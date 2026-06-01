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

// Razorpay webhook needs the RAW body, so mount it before express.json()
app.post("/api/razorpay/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const expected = crypto.createHmac("sha256", RAZORPAY_WEBHOOK_SECRET).update(req.body).digest("hex");
  if (req.headers["x-razorpay-signature"] !== expected) return res.status(400).send("bad signature");
  const event = JSON.parse(req.body.toString());
  const setPremium = async (userId, plan) => {
    const days = plan === "month" ? 31 : 1;
    await supabase.from("profiles")
      .update({ premium: true, premium_until: new Date(Date.now() + days * 864e5).toISOString() })
      .eq("id", userId);
  };
  if (event.event === "payment.captured") {
    const n = event.payload.payment.entity.notes || {}; if (n.userId) await setPremium(n.userId, n.plan);
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

// one-time order (₹15/day = 1500 paise, ₹300/mo = 30000 paise)
app.post("/api/order", async (req, res) => {
  const { plan, userId } = req.body;
  try {
    const amount = plan === "month" ? 30000 : 1500;
    const order = await razorpay.orders.create({ amount, currency: "INR", notes: { userId, plan } });
    res.json({ orderId: order.id, amount, keyId: RAZORPAY_KEY_ID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// recurring subscription (optional auto-renew)
app.post("/api/subscribe", async (req, res) => {
  const { plan, userId } = req.body;
  try {
    const sub = await razorpay.subscriptions.create({
      plan_id: plan === "month" ? PLAN_MONTH_ID : PLAN_DAY_ID,
      customer_notify: 1, total_count: plan === "month" ? 12 : 30, notes: { userId, plan },
    });
    res.json({ subscriptionId: sub.id, keyId: RAZORPAY_KEY_ID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------------- realtime state ----------------
let io;
const queue = [];                 // [{ sid, gender, want, coord, mode }]
const rooms = new Map();          // roomId -> { type, code?, members:Set<sid> }
const users = new Map();          // sid -> user
const pendingInvites = new Map(); // roomId -> { from, to }

const pub = (u) => (u ? { name: u.name, gender: u.gender, loc: u.loc } : { name: "User", gender: "other" });
const rmQueue = (sid) => { const i = queue.findIndex(q => q.sid === sid); if (i >= 0) queue.splice(i, 1); };
const sidOf = (uid) => { for (const [sid, u] of users) if (u.id === uid) return sid; return null; };
function dist(a, b) {
  if (!a || !b) return 1e9;
  const R = 6371, d = x => x * Math.PI / 180;
  const dLat = d(b[0] - a[0]), dLng = d(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(d(a[0])) * Math.cos(d(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function closeRoom(roomId, reason) {
  const r = rooms.get(roomId); if (!r) return;
  io.to(roomId).emit("room:ended", { reason });
  for (const sid of r.members) io.sockets.sockets.get(sid)?.leave(roomId);
  rooms.delete(roomId);
}

async function main() {
  const server = http.createServer(app);
  io = new Server(server, { cors: { origin: CLIENT_ORIGIN } });

  if (REDIS_URL) { // only when running more than one instance
    const p = createRedis({ url: REDIS_URL }), s = p.duplicate();
    await Promise.all([p.connect(), s.connect()]);
    io.adapter(createAdapter(p, s));
  }

  io.on("connection", (socket) => {
    // --- identify ---
    socket.on("auth", async (token) => {
      try {
        const { data } = await supabase.auth.getUser(token);
        if (!data?.user) return socket.emit("auth:err");
        const { data: prof } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
        socket.data.user = {
          id: data.user.id, name: prof?.name || "User", gender: prof?.gender || "other",
          loc: prof?.loc || "", premium: !!prof?.premium, role: prof?.role || "user",
          coord: prof?.lat != null ? [prof.lat, prof.lng] : null,
        };
        users.set(socket.id, socket.data.user);
        socket.emit("auth:ok", pub(socket.data.user));
      } catch { socket.emit("auth:err"); }
    });
    socket.on("guest", (info) => {
      socket.data.user = {
        id: "guest:" + socket.id, name: info?.name || "Guest", gender: info?.gender || "other",
        loc: info?.loc || "", premium: false, role: "user", coord: info?.coord || null, guest: true,
      };
      users.set(socket.id, socket.data.user);
    });

    // --- matchmaking (1:1) ---
    socket.on("queue:join", ({ mode = "discover", want = "any", coord = null } = {}) => {
      const u = socket.data.user; if (!u) return;
      const wantG = u.premium ? want : "any";
      const nearby = u.premium && mode === "nearby";
      let pick = -1, best = Infinity;
      for (let i = 0; i < queue.length; i++) {
        const w = queue[i]; if (w.sid === socket.id) continue;
        const wu = users.get(w.sid);
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
      } else {
        queue.push({ sid: socket.id, gender: u.gender, want: wantG, coord: coord || u.coord, mode });
        socket.emit("queued");
      }
    });
    socket.on("queue:leave", () => rmQueue(socket.id));

    // --- WebRTC signaling relay (peer<->peer AND peer<->admin) ---
    socket.on("signal", ({ to, data }) => io.to(to).emit("signal", { from: socket.id, data }));

    // --- text chat (relayed + logged) ---
    socket.on("chat:msg", ({ roomId, text }) => {
      const u = socket.data.user;
      socket.to(roomId).emit("chat:msg", { from: socket.id, name: u?.name, text, ts: Date.now() });
      if (u && !u.guest) supabase.from("messages").insert({ room_id: roomId, sender: u.id, text }).then(() => {});
    });

    // --- conference (group, mesh) ---
    socket.on("conf:create", () => {
      const code = crypto.randomBytes(3).toString("hex").toUpperCase(), roomId = "c_" + code;
      rooms.set(roomId, { type: "conf", code, members: new Set([socket.id]) });
      socket.join(roomId); socket.emit("conf:created", { code, roomId });
    });
    socket.on("conf:join", ({ code }) => {
      const roomId = "c_" + String(code).toUpperCase(), room = rooms.get(roomId);
      if (!room) return socket.emit("conf:err", "No such room");
      const peers = [...room.members].map(sid => ({ id: sid, ...pub(users.get(sid)) }));
      room.members.add(socket.id); socket.join(roomId);
      socket.emit("conf:peers", { roomId, peers });
      socket.to(roomId).emit("peer:joined", { peerId: socket.id, info: pub(socket.data.user) });
    });

    // --- friend direct call (ring → accept) ---
    socket.on("invite", ({ toUserId }) => {
      const u = socket.data.user; if (!u) return;
      const sid = sidOf(toUserId); if (!sid) return socket.emit("invite:offline");
      const roomId = "r_" + crypto.randomBytes(5).toString("hex");
      pendingInvites.set(roomId, { from: socket.id, to: sid });
      io.to(sid).emit("invite", { roomId, from: pub(u), fromSid: socket.id });
    });
    socket.on("invite:accept", ({ roomId }) => {
      const inv = pendingInvites.get(roomId); if (!inv) return; pendingInvites.delete(roomId);
      rooms.set(roomId, { type: "1to1", members: new Set([inv.from, inv.to]) });
      io.sockets.sockets.get(inv.from)?.join(roomId);
      io.sockets.sockets.get(inv.to)?.join(roomId);
      io.to(inv.from).emit("matched", { roomId, peerId: inv.to,   peer: pub(users.get(inv.to)),   initiator: true });
      io.to(inv.to).emit("matched",   { roomId, peerId: inv.from, peer: pub(users.get(inv.from)), initiator: false });
    });

    // ---------------- ADMIN: live audio monitor (listen + talk) ----------------
    const isAdmin = () => socket.data.user?.role === "admin";
    socket.on("admin:rooms", () => {
      if (!isAdmin()) return;
      socket.emit("admin:rooms", [...rooms.entries()]
        .filter(([, r]) => r.type === "1to1")
        .map(([id, r]) => ({ id, members: [...r.members].map(sid => pub(users.get(sid))) })));
    });
    socket.on("admin:monitor", ({ roomId, talk = false }) => {
      if (!isAdmin()) return;
      const room = rooms.get(roomId); if (!room) return;
      socket.join(roomId);
      for (const sid of room.members) io.to(sid).emit("admin:monitorStart", { adminId: socket.id, talk });
      io.to(roomId).emit("monitored", { on: true });
      socket.emit("admin:monitoring", { roomId, members: [...room.members] });
    });
    socket.on("admin:talk", ({ roomId, on }) => {
      if (!isAdmin()) return;
      socket.to(roomId).emit("admin:talk", { adminId: socket.id, on });
    });
    socket.on("admin:stopMonitor", ({ roomId }) => {
      if (!isAdmin()) return;
      socket.to(roomId).emit("admin:monitorStop", { adminId: socket.id });
      io.to(roomId).emit("monitored", { on: false });
      socket.leave(roomId);
    });
    socket.on("admin:end", ({ roomId }) => { if (isAdmin()) closeRoom(roomId, "ended_by_admin"); });

    // --- teardown ---
    const leave = (roomId) => {
      const r = rooms.get(roomId); if (!r) return;
      r.members.delete(socket.id); socket.leave(roomId);
      socket.to(roomId).emit("peer:left", { peerId: socket.id });
      if (r.members.size === 0) rooms.delete(roomId);
      else if (r.type === "1to1") closeRoom(roomId, "peer_left");
    };
    socket.on("room:leave", ({ roomId }) => leave(roomId));
    socket.on("disconnect", () => {
      rmQueue(socket.id);
      for (const [id, r] of rooms) if (r.members.has(socket.id)) leave(id);
      users.delete(socket.id);
    });
  });

  server.listen(PORT, () => console.log("RandomTalk signaling on :" + PORT));
}
main();
