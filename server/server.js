import express from "express";
import http from "http";
import cors from "cors";
import crypto from "crypto";
import { Server } from "socket.io";
import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient as createRedis } from "redis";

const {
  PORT = 8080, CLIENT_ORIGIN = "*",
  SUPABASE_URL, SUPABASE_SERVICE_KEY,
  RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET,
  PLAN_DAY_ID, PLAN_MONTH_ID, REDIS_URL,
} = process.env;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

// webhook needs RAW body — mount before express.json()
app.post("/api/razorpay/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const expected = crypto.createHmac("sha256", RAZORPAY_WEBHOOK_SECRET).update(req.body).digest("hex");
  if (req.headers["x-razorpay-signature"] !== expected) return res.status(400).send("bad signature");
  const event = JSON.parse(req.body.toString());
  const setPremium = async (userId, plan) => {
    const days = plan === "month" ? 31 : 1;
    await supabase.from("profiles").update({ premium: true, premium_until: new Date(Date.now() + days * 864e5).toISOString() }).eq("id", userId);
  };
  if (event.event === "payment.captured") {
    const p = event.payload.payment.entity; let notes = p.notes || {};
    if (!notes.userId && p.order_id) { try { const o = await razorpay.orders.fetch(p.order_id); notes = o.notes || notes; } catch {} }
    if (notes.userId) await setPremium(notes.userId, notes.plan);
  }
  if (event.event === "subscription.charged" || event.event === "subscription.activated") {
    const n = event.payload.subscription.entity.notes || {}; if (n.userId) await setPremium(n.userId, n.plan);
  }
  if (["subscription.halted", "subscription.cancelled", "subscription.completed"].includes(event.event)) {
    const n = event.payload.subscription.entity.notes || {};
    if (n.userId) await supabase.from("profiles").update({ premium: false }).eq("id", n.userId);
  }
  res.json({ ok: true });
});

app.use(express.json());
app.get("/", (_, res) => res.send("RandomTalk signaling up"));

// derive the user from their login token — never trust a userId sent by the browser
async function uidFromReq(req) {
  const t = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!t) return null;
  const { data } = await supabase.auth.getUser(t);
  return data?.user?.id || null;
}
app.post("/api/order", async (req, res) => {
  const userId = await uidFromReq(req); if (!userId) return res.status(401).json({ error: "login required" });
  try {
    const { plan } = req.body; const amount = plan === "month" ? 30000 : 1500;
    const order = await razorpay.orders.create({ amount, currency: "INR", notes: { userId, plan } });
    res.json({ orderId: order.id, amount, keyId: RAZORPAY_KEY_ID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/subscribe", async (req, res) => {
  const userId = await uidFromReq(req); if (!userId) return res.status(401).json({ error: "login required" });
  try {
    const { plan } = req.body;
    const sub = await razorpay.subscriptions.create({ plan_id: plan === "month" ? PLAN_MONTH_ID : PLAN_DAY_ID, customer_notify: 1, total_count: plan === "month" ? 12 : 30, notes: { userId, plan } });
    res.json({ subscriptionId: sub.id, keyId: RAZORPAY_KEY_ID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

let io;
const queue = [], rooms = new Map(), users = new Map(), pendingInvites = new Map();
const pub = (u) => (u ? { name: u.name, gender: u.gender, loc: u.loc } : { name: "User", gender: "other" });
const rmQueue = (sid) => { const i = queue.findIndex(q => q.sid === sid); if (i >= 0) queue.splice(i, 1); };
const sidOf = (uid) => { for (const [sid, u] of users) if (u.id === uid) return sid; return null; };
function dist(a, b) { if (!a || !b) return 1e9; const R = 6371, d = x => x * Math.PI / 180; const dLat = d(b[0]-a[0]), dLng = d(b[1]-a[1]); const h = Math.sin(dLat/2)**2 + Math.cos(d(a[0]))*Math.cos(d(b[0]))*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
function closeRoom(roomId, reason) { const r = rooms.get(roomId); if (!r) return; io.to(roomId).emit("room:ended", { reason }); for (const sid of r.members) io.sockets.sockets.get(sid)?.leave(roomId); rooms.delete(roomId); }
const otherInRoom = (roomId, sid) => { const r = rooms.get(roomId); if (!r) return null; return [...r.members].find(s => s !== sid) || null; };

async function main() {
  const server = http.createServer(app);
  io = new Server(server, { cors: { origin: CLIENT_ORIGIN } });
  if (REDIS_URL) { const p = createRedis({ url: REDIS_URL }), s = p.duplicate(); await Promise.all([p.connect(), s.connect()]); io.adapter(createAdapter(p, s)); }

  io.on("connection", (socket) => {
    socket.on("auth", async (token) => {
      try {
        const { data } = await supabase.auth.getUser(token);
        if (!data?.user) return socket.emit("auth:err");
        const { data: prof } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
        if (prof?.banned) { socket.emit("banned"); return; }
        const { data: bl } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", data.user.id);
        socket.data.blocks = new Set((bl || []).map(b => b.blocked_id));
        socket.data.user = { id: data.user.id, name: prof?.name || "User", gender: prof?.gender || "other", loc: prof?.loc || "", premium: !!prof?.premium, role: prof?.role || "user", coord: prof?.lat != null ? [prof.lat, prof.lng] : null };
        users.set(socket.id, socket.data.user);
        socket.emit("auth:ok", pub(socket.data.user));
      } catch { socket.emit("auth:err"); }
    });
    socket.on("guest", (info) => {
      socket.data.blocks = new Set();
      socket.data.user = { id: "guest:" + socket.id, name: info?.name || "Guest", gender: info?.gender || "other", loc: info?.loc || "", premium: false, role: "user", coord: info?.coord || null, guest: true };
      users.set(socket.id, socket.data.user);
    });

    socket.on("queue:join", ({ mode = "discover", want = "any", coord = null } = {}) => {
      const u = socket.data.user; if (!u) return;
      const wantG = u.premium ? want : "any";
      const nearby = u.premium && mode === "nearby";
      const myBlocks = socket.data.blocks || new Set();
      let pick = -1, best = Infinity;
      for (let i = 0; i < queue.length; i++) {
        const w = queue[i]; if (w.sid === socket.id) continue;
        const wu = users.get(w.sid); if (!wu) continue;
        if (myBlocks.has(wu.id)) continue;                                   // I blocked them
        const wSock = io.sockets.sockets.get(w.sid);
        if (wSock?.data?.blocks?.has(u.id)) continue;                        // they blocked me
        const genderOk = (wantG === "any" || wu.gender === wantG) && (w.want === "any" || u.gender === w.want);
        if (!genderOk) continue;
        const score = (nearby || w.mode === "nearby") ? dist(coord || u.coord, w.coord) : 0;
        if (score < best) { best = score; pick = i; }
      }
      if (pick >= 0) {
        const peer = queue.splice(pick, 1)[0];
        const roomId = "r_" + crypto.randomBytes(5).toString("hex");
        rooms.set(roomId, { type: "1to1", members: new Set([socket.id, peer.sid]) });
        socket.join(roomId); io.sockets.sockets.get(peer.sid)?.join(roomId);
        socket.emit("matched", { roomId, peerId: peer.sid, peer: pub(users.get(peer.sid)), initiator: true });
        io.to(peer.sid).emit("matched", { roomId, peerId: socket.id, peer: pub(u), initiator: false });
        supabase.from("calls").insert({ room_id: roomId, a: u.id, b: users.get(peer.sid)?.id }).then(() => {});
      } else { queue.push({ sid: socket.id, gender: u.gender, want: wantG, coord: coord || u.coord, mode }); socket.emit("queued"); }
    });
    socket.on("queue:leave", () => rmQueue(socket.id));

    socket.on("signal", ({ to, data }) => io.to(to).emit("signal", { from: socket.id, data }));

    socket.on("chat:msg", ({ roomId, text }) => {
      const u = socket.data.user; if (!u) return;
      const now = Date.now();
      socket.data._cm = (socket.data._cm || []).filter(t => now - t < 5000);
      if (socket.data._cm.length >= 12) return;                            // rate limit: 12 / 5s
      socket.data._cm.push(now);
      const msg = String(text || "").slice(0, 1000); if (!msg.trim()) return;
      socket.to(roomId).emit("chat:msg", { from: socket.id, name: u.name, text: msg, ts: now });
      if (!u.guest) supabase.from("messages").insert({ room_id: roomId, sender: u.id, text: msg }).then(() => {});
    });

    // ----- report & block -----
    socket.on("report", async ({ roomId, reason }) => {
      const u = socket.data.user; if (!u) return;
      const other = users.get(otherInRoom(roomId, socket.id));
      await supabase.from("reports").insert({
        reporter_id: u.guest ? null : u.id, reporter_name: u.name,
        reported_id: (other && !other.guest) ? other.id : null, reported_name: other?.name || null,
        reason: String(reason || "").slice(0, 200), room_id: roomId,
      });
      socket.emit("reported");
    });
    socket.on("block", async ({ roomId }) => {
      const u = socket.data.user; if (!u) return;
      const other = users.get(otherInRoom(roomId, socket.id));
      if (u && !u.guest && other && !other.guest) {
        await supabase.from("blocks").upsert({ blocker_id: u.id, blocked_id: other.id });
        socket.data.blocks = socket.data.blocks || new Set(); socket.data.blocks.add(other.id);
      }
      socket.emit("blocked:ok");
      closeRoom(roomId, "blocked");
    });

    // ----- conference -----
    socket.on("conf:create", () => { const code = crypto.randomBytes(3).toString("hex").toUpperCase(), roomId = "c_" + code; rooms.set(roomId, { type: "conf", code, members: new Set([socket.id]) }); socket.join(roomId); socket.emit("conf:created", { code, roomId }); });
    socket.on("conf:join", ({ code }) => {
      const roomId = "c_" + String(code).toUpperCase(), room = rooms.get(roomId);
      if (!room) return socket.emit("conf:err", "No such room");
      const peers = [...room.members].map(sid => ({ id: sid, ...pub(users.get(sid)) }));
      room.members.add(socket.id); socket.join(roomId);
      socket.emit("conf:peers", { roomId, peers });
      socket.to(roomId).emit("peer:joined", { peerId: socket.id, info: pub(socket.data.user) });
    });

    // ----- friend direct call -----
    socket.on("invite", ({ toUserId }) => {
      const u = socket.data.user; if (!u) return;
      const sid = sidOf(toUserId); if (!sid) return socket.emit("invite:offline");
      const target = io.sockets.sockets.get(sid);
      if (socket.data.blocks?.has(toUserId) || target?.data?.blocks?.has(u.id)) return; // respect blocks
      const roomId = "r_" + crypto.randomBytes(5).toString("hex");
      pendingInvites.set(roomId, { from: socket.id, to: sid });
      io.to(sid).emit("invite", { roomId, from: pub(u), fromSid: socket.id });
    });
    socket.on("invite:accept", ({ roomId }) => {
      const inv = pendingInvites.get(roomId); if (!inv) return; pendingInvites.delete(roomId);
      rooms.set(roomId, { type: "1to1", members: new Set([inv.from, inv.to]) });
      io.sockets.sockets.get(inv.from)?.join(roomId); io.sockets.sockets.get(inv.to)?.join(roomId);
      io.to(inv.from).emit("matched", { roomId, peerId: inv.to, peer: pub(users.get(inv.to)), initiator: true });
      io.to(inv.to).emit("matched", { roomId, peerId: inv.from, peer: pub(users.get(inv.from)), initiator: false });
    });

    // ----- admin -----
    const isAdmin = () => socket.data.user?.role === "admin";
    socket.on("admin:rooms", () => { if (!isAdmin()) return; socket.emit("admin:rooms", [...rooms.entries()].filter(([, r]) => r.type === "1to1").map(([id, r]) => ({ id, members: [...r.members].map(sid => pub(users.get(sid))) }))); });
    socket.on("admin:reports", async () => { if (!isAdmin()) return; const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(50); socket.emit("admin:reports", data || []); });
    socket.on("admin:ban", async ({ userId }) => {
      if (!isAdmin() || !userId) return;
      await supabase.from("profiles").update({ banned: true }).eq("id", userId);
      for (const [sid, uu] of users) if (uu.id === userId) { io.to(sid).emit("banned"); io.sockets.sockets.get(sid)?.disconnect(true); }
    });
    socket.on("admin:monitor", ({ roomId, talk = false }) => { if (!isAdmin()) return; const room = rooms.get(roomId); if (!room) return; socket.join(roomId); for (const sid of room.members) io.to(sid).emit("admin:monitorStart", { adminId: socket.id, talk }); io.to(roomId).emit("monitored", { on: true }); socket.emit("admin:monitoring", { roomId }); });
    socket.on("admin:talk", ({ roomId, on }) => { if (!isAdmin()) return; socket.to(roomId).emit("admin:talk", { adminId: socket.id, on }); });
    socket.on("admin:stopMonitor", ({ roomId }) => { if (!isAdmin()) return; socket.to(roomId).emit("admin:monitorStop", { adminId: socket.id }); io.to(roomId).emit("monitored", { on: false }); socket.leave(roomId); });
    socket.on("admin:end", ({ roomId }) => { if (isAdmin()) closeRoom(roomId, "ended_by_admin"); });

    const leave = (roomId) => { const r = rooms.get(roomId); if (!r) return; r.members.delete(socket.id); socket.leave(roomId); socket.to(roomId).emit("peer:left", { peerId: socket.id }); if (r.members.size === 0) rooms.delete(roomId); else if (r.type === "1to1") closeRoom(roomId, "peer_left"); };
    socket.on("room:leave", ({ roomId }) => leave(roomId));
    socket.on("disconnect", () => { rmQueue(socket.id); for (const [id, r] of rooms) if (r.members.has(socket.id)) leave(id); users.delete(socket.id); });
  });

  server.listen(PORT, () => console.log("RandomTalk signaling on :" + PORT));
}
main();
