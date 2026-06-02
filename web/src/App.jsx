// src/App.jsx — production-wired RandomTalk (with safety + legal)
// Libs: ./lib/supabase, ./lib/socket, ./lib/webrtc, ./lib/locations, ./lib/pay
// Runs in your Vite project (needs npm deps + backend), not the chat preview.

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Mic, MicOff, Phone, PhoneOff, SkipForward, Users, MapPin, Crown, Send, Search,
  Clock, X, Check, Shield, ArrowLeft, UserPlus, Lock, LogOut, Eye, Globe, Plus,
  Activity, IndianRupee, MessageSquare, Hash, Headphones, Volume2, Radio, Flag, Ban
} from "lucide-react";

import { supabase } from "./lib/supabase";
import { socket } from "./lib/socket";
import { createMedia } from "./lib/webrtc";
import { checkout } from "./lib/pay";
import { getCountries, getStates, getCities, getCitiesOfCountry } from "./lib/locations";

const COLORS = ["bg-blue-500","bg-emerald-500","bg-violet-500","bg-amber-500","bg-rose-500","bg-cyan-500","bg-indigo-500","bg-teal-500"];
const aColor = (n="?") => COLORS[(n.charCodeAt(0) + n.length) % COLORS.length];
const GenderIcon = ({ g, className }) => <span className={className}>{g === "male" ? "♂" : g === "female" ? "♀" : "⚧"}</span>;
const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};
const REPORT_REASONS = ["Harassment or bullying", "Sexual or explicit content", "Hate or abuse", "User seems underage", "Spam or scam", "Something else"];
const SUPPORT_EMAIL = "support@yourdomain.com";

function Wave({ active, color = "bg-blue-500" }) {
  const [bars, setBars] = useState(Array(20).fill(5));
  useEffect(() => { const id = setInterval(() => setBars(p => p.map(() => active ? 6 + Math.random()*28 : 4)), 130); return () => clearInterval(id); }, [active]);
  return <div className="flex items-center justify-center gap-1 h-10">{bars.map((h,i) => <div key={i} style={{height:`${h}px`}} className={`w-1 rounded-full transition-all duration-100 ${color}`} />)}</div>;
}
function CallTimer() {
  const [s, setS] = useState(0);
  useEffect(() => { const t = setInterval(() => setS(x => x + 1), 1000); return () => clearInterval(t); }, []);
  return <div className="mt-2 font-mono text-gray-400">{fmt(s)}</div>;
}
function Page({ children, center }) {
  return <div className="min-h-screen w-full bg-white text-gray-800 flex justify-center"><div className={`w-full max-w-md flex-1 flex flex-col px-5 py-6 ${center ? "justify-center" : ""}`}>{children}</div></div>;
}
function Brand({ big }) {
  return <div className="flex items-center gap-2"><div className={`${big ? "h-12 w-12" : "h-8 w-8"} rounded-full bg-blue-600 flex items-center justify-center`}><Headphones className={big ? "h-6 w-6 text-white" : "h-4 w-4 text-white"} /></div><span className={`font-semibold tracking-tight ${big ? "text-3xl" : "text-xl"}`}>RandomTalk</span></div>;
}
function Hdr({ title, onBack }) {
  return <div className="flex items-center gap-2 mb-5"><button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><ArrowLeft className="h-5 w-5 text-gray-600" /></button><span className="text-xl font-medium">{title}</span></div>;
}
function RemoteAudio({ map }) {
  return <>{Object.entries(map).map(([id, s]) => <audio key={id} autoPlay playsInline ref={el => { if (el && el.srcObject !== s) el.srcObject = s; }} />)}</>;
}
function Toast({ text }) {
  return <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg">{text}</div>;
}

/* ----- consent gate ----- */
function Consent({ onAgree, onTerms, onPrivacy }) {
  const [ok, setOk] = useState(false);
  return (
    <Page center>
      <div className="flex flex-col gap-4">
        <Brand big />
        <h2 className="text-xl font-medium mt-2">Before you start</h2>
        <div className="text-sm text-gray-600 space-y-2">
          <p>RandomTalk connects you by voice with strangers. By continuing you understand and agree that:</p>
          <p>• You are <b>18 years or older</b>.</p>
          <p>• Calls and chats <b>may be monitored or recorded</b> for safety and moderation.</p>
          <p>• You will not share illegal, abusive, hateful, or sexual content, and you will be respectful.</p>
          <p>• Limited data (name, gender, location, messages) is stored to run the service.</p>
          <p>• You can be reported, blocked, and banned for breaking these rules.</p>
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer mt-1">
          <input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} className="mt-1" />
          <span>I am 18+ and I agree to the <button type="button" onClick={onTerms} className="text-blue-600 underline">Terms</button>, the <button type="button" onClick={onPrivacy} className="text-blue-600 underline">Privacy Policy</button>, and to calls being monitored for safety.</span>
        </label>
        <button disabled={!ok} onClick={onAgree} className="w-full py-3.5 rounded-full bg-blue-600 text-white font-medium text-lg disabled:opacity-40 hover:bg-blue-700">Agree & continue</button>
      </div>
    </Page>
  );
}

/* ----- Terms / Privacy (TEMPLATE — have a lawyer finalise) ----- */
function Legal({ kind, onBack }) {
  return (
    <Page>
      <Hdr title={kind === "terms" ? "Terms of Service" : "Privacy Policy"} onBack={onBack} />
      <div className="flex-1 overflow-y-auto text-sm text-gray-600 space-y-3 leading-relaxed">
        <p className="text-xs text-gray-400">Template only — review with a lawyer before public launch. Last updated: {new Date().toISOString().slice(0,10)}.</p>
        {kind === "terms" ? (<>
          <p><b>1. Eligibility.</b> You must be 18+ to use RandomTalk. By using it you confirm you meet this requirement.</p>
          <p><b>2. The service.</b> RandomTalk connects users for voice calls and text chat with strangers, friends, and groups. Free and paid (Premium) features are offered.</p>
          <p><b>3. Acceptable use.</b> You agree not to: harass, threaten, or bully others; share sexual, hateful, violent, or illegal content; involve minors; record or share others' audio without consent; impersonate; spam; or attempt to break or abuse the service.</p>
          <p><b>4. Safety & monitoring.</b> To keep users safe, calls and chats may be monitored or recorded, and content may be reviewed by moderators. Violations can lead to warnings, blocks, or permanent bans.</p>
          <p><b>5. Reporting.</b> You can report or block any user. We may act on reports at our discretion and may share information with authorities where required by law.</p>
          <p><b>6. Premium & billing.</b> Premium costs ₹15/day or ₹300/month via Razorpay. Subscriptions renew until cancelled. Except where required by law, payments are non-refundable. Prices may change with notice.</p>
          <p><b>7. Termination.</b> We may suspend or terminate accounts that violate these Terms.</p>
          <p><b>8. Disclaimer & liability.</b> The service is provided “as is.” To the extent permitted by law, we are not liable for user conduct or indirect damages.</p>
          <p><b>9. Governing law.</b> These Terms are governed by the laws of India. Disputes are subject to the courts of [your city].</p>
          <p><b>10. Grievances.</b> Contact our grievance officer at {SUPPORT_EMAIL}. We respond within the timelines required by applicable law.</p>
        </>) : (<>
          <p><b>Who we are.</b> RandomTalk ([Your Company]) operates this service. Contact: {SUPPORT_EMAIL}.</p>
          <p><b>Data we collect.</b> Account data (name, gender, location, email), usage data (call metadata, messages), and limited technical data. Calls/chats may be recorded for safety.</p>
          <p><b>Why.</b> To match users, provide calls/chat, process payments, keep the service safe, and meet legal obligations.</p>
          <p><b>Sharing.</b> With service providers (Supabase, Render, Razorpay) under contract, and with authorities when legally required. We do not sell your data.</p>
          <p><b>Storage & retention.</b> Data is stored on Supabase and retained only as long as needed or as required by law.</p>
          <p><b>Your rights.</b> You may request access to or deletion of your data by emailing {SUPPORT_EMAIL}.</p>
          <p><b>Children.</b> The service is strictly for users 18+. We do not knowingly collect data from minors; report suspected minors via the in-app report tool.</p>
          <p><b>Security.</b> We use encryption in transit and access controls. No system is perfectly secure; we notify users of material breaches as required.</p>
        </>)}
      </div>
    </Page>
  );
}

/* ----- report dialog ----- */
function ReportOverlay({ onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-sm bg-white rounded-3xl border border-gray-200 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2 font-medium"><Flag className="h-4 w-4 text-rose-600" />Report user</div><button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="space-y-1">
          {REPORT_REASONS.map(r => <button key={r} onClick={() => onSubmit(r)} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-50 text-sm">{r}</button>)}
        </div>
        <p className="text-xs text-gray-400 mt-3">Reports go to moderators. For emergencies, contact local authorities.</p>
      </div>
    </div>
  );
}

export default function App() {
  // identity
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [guest, setGuest] = useState(null);
  const [booting, setBooting] = useState(true);
  const [banned, setBanned] = useState(false);
  const [legal, setLegal] = useState(null);
  const [consented, setConsented] = useState(() => ls.get("rt_consent_v1") === "1");
  const me = guest || (profile && { ...profile, id: session?.user?.id, premium: profile.premium, role: profile.role });
  const isPremium = !!me?.premium;
  const isAdmin = profile?.role === "admin";

  // ui
  const [screen, setScreen] = useState("landing");
  const [overlay, setOverlay] = useState(null);
  const [locOpen, setLocOpen] = useState(false);
  const [mode, setMode] = useState("discover");
  const [want, setWant] = useState("any");
  const [autoConnect, setAutoConnect] = useState(false);
  const [toast, setToast] = useState("");
  const toastRef = useRef(null);
  function flash(msg) { setToast(msg); clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(""), 2200); }

  // call
  const [match, setMatch] = useState(null);
  const roomRef = useRef(null);
  const callStartRef = useRef(0);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [muted, setMuted] = useState(false);
  const [monitored, setMonitored] = useState(false);
  const [streams, setStreams] = useState({});
  const [incoming, setIncoming] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);

  // social
  const [friends, setFriends] = useState([]);
  const [findQ, setFindQ] = useState("");
  const [findRes, setFindRes] = useState([]);
  const [history, setHistory] = useState([]);

  // conference / admin
  const [conf, setConf] = useState(null);
  const [adminRooms, setAdminRooms] = useState([]);
  const [adminReports, setAdminReports] = useState([]);
  const [adminTab, setAdminTab] = useState("calls");
  const [adminCall, setAdminCall] = useState(null);
  const [adminStreams, setAdminStreams] = useState({});
  const [adminTalking, setAdminTalking] = useState(false);

  const media = useRef(null);
  const adminMedia = useRef(null);
  const routeRef = useRef(null);
  const chatRef = useRef(null);
  const autoRef = useRef(autoConnect); autoRef.current = autoConnect;
  const matchRef = useRef(match); matchRef.current = match;

  /* boot */
  useEffect(() => {
    const g = ls.get("rt_guest");
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSession(data.session);
      else if (g) { try { setGuest(JSON.parse(g)); setScreen("lobby"); } catch {} }
      setBooting(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session) loadProfile(); }, [session]);
  async function loadProfile() {
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    setProfile(data); setGuest(null); ls.del("rt_guest");
    if (data?.banned) setBanned(true);
    setScreen(s => (s === "landing" || s === "auth" || s === "guest") ? "lobby" : s);
  }

  /* socket */
  useEffect(() => {
    if (!me) return;
    if (!socket.connected) socket.connect();
    if (guest) socket.emit("guest", { name: guest.name, gender: guest.gender, loc: guest.loc, coord: guest.coord });
    else if (session) socket.emit("auth", session.access_token);

    media.current = createMedia(socket, {
      onStream: (id, s) => setStreams(p => ({ ...p, [id]: s })),
      onGone: (id) => setStreams(p => { const n = { ...p }; delete n[id]; return n; }),
    });
    adminMedia.current = createMedia(socket, { onStream: (id, s) => setAdminStreams(p => ({ ...p, [id]: s })), sendAudioOnAnswer: false });
    routeRef.current = media.current;

    const onSignal = (m) => routeRef.current?.onSignal(m);
    socket.on("signal", onSignal);
    socket.on("banned", () => setBanned(true));

    socket.on("matched", async ({ roomId, peerId, peer, initiator }) => {
      roomRef.current = roomId; callStartRef.current = Date.now();
      setMatch({ roomId, peerId, peer, initiator });
      setMessages([]); setMuted(false); setMonitored(false); setIncoming(null); setReportOpen(false); setScreen("incall");
      await media.current.initMic();
      if (initiator) media.current.call(peerId);
    });
    socket.on("chat:msg", ({ name, text }) => setMessages(p => [...p, { from: "them", name, text }]));
    socket.on("room:ended", () => endLocal(true));
    socket.on("peer:left", () => endLocal(true));
    socket.on("monitored", ({ on }) => setMonitored(on));

    socket.on("conf:created", ({ code, roomId }) => { roomRef.current = roomId; setConf({ roomId, code, peers: {} }); setScreen("conf"); media.current.initMic(); });
    socket.on("conf:peers", async ({ roomId, peers }) => {
      roomRef.current = roomId; setConf({ roomId, code: roomId.replace("c_",""), peers: Object.fromEntries(peers.map(p => [p.id, p])) });
      setScreen("conf"); await media.current.initMic(); peers.forEach(p => media.current.call(p.id));
    });
    socket.on("peer:joined", ({ peerId, info }) => setConf(c => c ? { ...c, peers: { ...c.peers, [peerId]: { id: peerId, ...info } } } : c));
    socket.on("invite", ({ roomId, from, fromSid }) => setIncoming({ roomId, from, fromSid }));

    socket.on("admin:rooms", (list) => setAdminRooms(list));
    socket.on("admin:reports", (list) => setAdminReports(list));
    socket.on("admin:monitorStart", ({ adminId }) => media.current.call(adminId, { sendAudio: true }));
    socket.on("admin:talk", () => {});

    return () => { socket.off("signal", onSignal); socket.removeAllListeners(); };
  }, [me?.id, guest?.name]);

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [messages]);
  useEffect(() => { if (session) loadFriends(); }, [session, screen === "friends"]);

  /* actions */
  function startGuest(g) { setGuest(g); ls.set("rt_guest", JSON.stringify(g)); setScreen("lobby"); }
  function startCall() {
    const m = (mode === "friend" || mode === "conference") ? "discover" : mode;
    setScreen("matching");
    socket.emit("queue:join", { mode: m, want: isPremium ? want : "any", coord: me?.coord || null });
  }
  function next() { socket.emit("room:leave", { roomId: roomRef.current }); media.current.closeAll(); setStreams({}); startCall(); }
  function endLocal(skipAuto) {
    media.current?.closeAll(); setStreams({});
    const mt = matchRef.current;
    if (mt) { const dur = Math.floor((Date.now() - callStartRef.current) / 1000); setHistory(h => [{ name: mt.peer?.name, loc: mt.peer?.loc, dur, when: "Just now" }, ...h].slice(0, 15)); }
    if (!skipAuto && autoRef.current) { setMatch(null); startCall(); }
    else { setMatch(null); roomRef.current = null; setScreen("lobby"); }
  }
  function hangup() { socket.emit("room:leave", { roomId: roomRef.current }); endLocal(false); }
  function send() {
    if (!draft.trim()) return;
    socket.emit("chat:msg", { roomId: roomRef.current, text: draft.trim() });
    setMessages(p => [...p, { from: "me", text: draft.trim() }]); setDraft("");
  }
  function toggleMute() { setMuted(m => { media.current.setMuted(!m); return !m; }); }
  function reportPeer(reason) { socket.emit("report", { roomId: roomRef.current, reason }); setReportOpen(false); flash("Report sent to moderators"); }
  function blockPeer() { socket.emit("block", { roomId: roomRef.current }); flash("User blocked"); endLocal(false); }

  async function loadFriends() {
    if (!session) return;
    const { data } = await supabase.from("friends").select("friend_id, status, profiles!friends_friend_id_fkey(name,gender,loc)").eq("user_id", session.user.id);
    setFriends((data || []).map(r => ({ id: r.friend_id, status: r.status, ...r.profiles })));
  }
  async function addFriend(uid) { if (!session || !uid) return; await supabase.from("friends").insert({ user_id: session.user.id, friend_id: uid, status: "pending" }); loadFriends(); }
  function callFriend(uid) { if (!isPremium) return setOverlay("premium"); socket.emit("invite", { toUserId: uid }); }
  function acceptInvite() { if (incoming) { socket.emit("invite:accept", { roomId: incoming.roomId, toSid: incoming.fromSid }); setIncoming(null); } }

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = findQ.trim(); if (q.length < 2) return setFindRes([]);
      const { data } = await supabase.from("profiles").select("id,name,gender,loc").ilike("name", `%${q}%`).limit(20);
      setFindRes(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [findQ]);

  function signOut() { socket.disconnect(); supabase.auth.signOut(); ls.del("rt_guest"); setProfile(null); setGuest(null); setSession(null); setBanned(false); setScreen("landing"); }

  function adminRefresh() { socket.emit("admin:rooms"); socket.emit("admin:reports"); }
  function adminListen(roomId) { routeRef.current = adminMedia.current; setAdminCall(roomId); setAdminTalking(false); setAdminStreams({}); socket.emit("admin:monitor", { roomId, talk: false }); }
  async function adminTalk(on) { socket.emit("admin:talk", { roomId: adminCall, on }); if (on) { await adminMedia.current.initMic(); adminMedia.current.peerIds().forEach(id => adminMedia.current.addMic(id)); } else adminMedia.current.setMuted(true); setAdminTalking(on); }
  function adminStop() { socket.emit("admin:stopMonitor", { roomId: adminCall }); adminMedia.current.closeAll(); setAdminStreams({}); setAdminCall(null); routeRef.current = media.current; }
  function adminEnd(roomId) { socket.emit("admin:end", { roomId }); if (roomId === adminCall) adminStop(); adminRefresh(); }
  function adminBan(uid) { if (!uid) return; socket.emit("admin:ban", { userId: uid }); flash("User banned"); setTimeout(adminRefresh, 400); }
  useEffect(() => { if (screen === "admin") { adminRefresh(); const t = setInterval(adminRefresh, 4000); return () => clearInterval(t); } }, [screen]);

  /* =================== RENDER =================== */
  if (legal) return <Legal kind={legal} onBack={() => setLegal(null)} />;
  if (!consented) return <Consent onAgree={() => { ls.set("rt_consent_v1", "1"); setConsented(true); }} onTerms={() => setLegal("terms")} onPrivacy={() => setLegal("privacy")} />;
  if (booting) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  if (banned)
    return (
      <Page center>
        <div className="flex flex-col items-center text-center gap-4">
          <div className="h-14 w-14 rounded-full bg-rose-100 flex items-center justify-center"><Ban className="h-7 w-7 text-rose-600" /></div>
          <div className="text-xl font-medium">Account suspended</div>
          <p className="text-sm text-gray-500 max-w-xs">Your access has been suspended for violating our community rules. To appeal, contact {SUPPORT_EMAIL}.</p>
          <button onClick={signOut} className="mt-2 px-6 py-2.5 rounded-full border border-gray-300 text-gray-700 text-sm">Sign out</button>
        </div>
      </Page>
    );

  /* LANDING */
  if (screen === "landing")
    return (
      <Page center>
        <div className="flex flex-col items-center text-center gap-6">
          <Brand big />
          <p className="text-gray-500 max-w-xs text-lg">Talk to people, voice only. No camera, just conversation.</p>
          <div className="w-full max-w-xs flex flex-col gap-3 mt-2">
            <button onClick={() => setScreen("guest")} className="w-full py-3.5 rounded-full bg-blue-600 text-white font-medium text-lg hover:bg-blue-700">Continue as guest</button>
            <button onClick={() => setScreen("auth")} className="w-full py-3.5 rounded-full border border-gray-300 text-gray-700 font-medium text-lg hover:bg-gray-50">Log in / Sign up</button>
          </div>
          <div className="text-xs text-gray-400 flex gap-3"><button onClick={() => setLegal("terms")} className="hover:underline">Terms</button><button onClick={() => setLegal("privacy")} className="hover:underline">Privacy</button></div>
        </div>
      </Page>
    );

  /* AUTH */
  if (screen === "auth")
    return <Auth onBack={() => setScreen("landing")} onLocOpen={() => setLocOpen(true)}
      pickedLoc={locOpen ? null : guest?._loc}
      LocPicker={locOpen ? <LocationPicker onClose={() => setLocOpen(false)} onPick={(l) => { setGuest(g => ({ ...(g || {}), _loc: l })); setLocOpen(false); }} /> : null} />;

  /* GUEST SETUP */
  if (screen === "guest")
    return <GuestSetup onBack={() => setScreen("landing")} onLocOpen={() => setLocOpen(true)}
      LocPicker={locOpen ? <LocationPicker onClose={() => setLocOpen(false)} onPick={(l) => { setGuest(g => ({ ...(g || {}), _loc: l })); setLocOpen(false); }} /> : null}
      pickedLoc={guest?._loc}
      onStart={({ name, gender }) => { const l = guest?._loc; startGuest({ name: name || "Guest", gender, loc: l?.label || "", coord: l ? [l.lat, l.lng] : null }); }} />;

  /* LOBBY */
  if (screen === "lobby" && me)
    return (
      <Page>
        <div className="flex items-center justify-between">
          <Brand />
          <div className="flex items-center gap-1">
            <button onClick={() => { setFindQ(""); setScreen("find"); }} className="p-2 rounded-full hover:bg-gray-100" title="Find people"><Search className="h-5 w-5 text-gray-600" /></button>
            {isAdmin && <button onClick={() => setScreen("admin")} className="p-2 rounded-full hover:bg-gray-100" title="Admin"><Activity className="h-5 w-5 text-gray-600" /></button>}
            <button onClick={signOut} className="p-2 rounded-full hover:bg-gray-100" title="Sign out"><LogOut className="h-5 w-5 text-gray-600" /></button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <div className={`h-11 w-11 rounded-full text-white flex items-center justify-center font-semibold text-lg ${aColor(me.name)}`}>{me.name[0].toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 font-medium text-lg">{me.name}{isPremium && <Crown className="h-4 w-4 text-amber-500" />}</div>
            <button onClick={() => setLocOpen(true)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600"><MapPin className="h-3.5 w-3.5" />{me.loc || "Not set"} <span className="text-xs text-blue-600">· change</span></button>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500 capitalize">{me.gender}</span>
        </div>

        <div className="mt-7 grid grid-cols-4 gap-2">
          {[{ k: "discover", icon: Globe, label: "Discover" }, { k: "nearby", icon: MapPin, label: "Nearby", prem: true }, { k: "friend", icon: Users, label: "Friends", prem: true, go: "friends" }, { k: "conference", icon: Users, label: "Group" }].map(({ k, icon: Icon, label, prem, go }) => {
            const locked = prem && !isPremium, active = mode === k;
            return (
              <button key={k} onClick={() => { if (locked) return setOverlay("premium"); if (go) return setScreen(go); if (k === "conference") return setScreen("confSetup"); setMode(k); }}
                className={`relative rounded-2xl py-3 border flex flex-col items-center gap-1.5 ${active && !locked ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                {locked && <Lock className="h-3 w-3 text-amber-500 absolute top-1.5 right-1.5" />}<Icon className="h-5 w-5" /><span className="text-xs">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm text-gray-500 flex items-center gap-1">Match with{!isPremium && <Lock className="h-3 w-3 text-amber-500" />}</span>
          <div className="flex gap-1.5">{["any", "male", "female"].map(g => <button key={g} onClick={() => isPremium ? setWant(g) : setOverlay("premium")} className={`px-3 py-1.5 rounded-full text-sm capitalize border ${isPremium && want === g ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>{g}</button>)}</div>
        </div>

        <label className="mt-4 flex items-center justify-between cursor-pointer">
          <span className="text-sm text-gray-600 flex items-center gap-2"><SkipForward className="h-4 w-4 text-gray-400" />Auto-connect on disconnect</span>
          <span onClick={() => setAutoConnect(a => !a)} className={`h-6 w-11 rounded-full relative ${autoConnect ? "bg-blue-600" : "bg-gray-300"}`}><span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${autoConnect ? "translate-x-5" : ""}`} /></span>
        </label>

        <div className="flex-1" />
        <button onClick={startCall} className="w-full py-4 rounded-full bg-blue-600 text-white font-medium text-lg hover:bg-blue-700 flex items-center justify-center gap-2 mt-6"><Phone className="h-5 w-5" />Start call</button>
        <div className="flex items-center justify-center gap-5 mt-3 text-sm">
          <button onClick={() => setScreen("friends")} className="text-gray-500 hover:text-gray-800">Friends</button>
          <button onClick={() => setScreen("history")} className="text-gray-500 hover:text-gray-800">History</button>
          {!isPremium && <button onClick={() => setOverlay("premium")} className="text-amber-600 hover:underline flex items-center gap-1"><Crown className="h-3.5 w-3.5" />Premium</button>}
        </div>
        <div className="text-center text-xs text-gray-400 mt-3 flex justify-center gap-3"><button onClick={() => setLegal("terms")} className="hover:underline">Terms</button><button onClick={() => setLegal("privacy")} className="hover:underline">Privacy</button></div>

        {incoming && <IncomingCall from={incoming.from} onAccept={acceptInvite} onDecline={() => setIncoming(null)} />}
        {locOpen && <LocationPicker onClose={() => setLocOpen(false)} onPick={async (l) => { setLocOpen(false); if (guest) { const g = { ...guest, loc: l.label, coord: [l.lat, l.lng] }; setGuest(g); ls.set("rt_guest", JSON.stringify(g)); } else { await supabase.from("profiles").update({ loc: l.label, lat: l.lat, lng: l.lng }).eq("id", session.user.id); loadProfile(); } }} />}
        {overlay === "premium" && <Premium onClose={() => setOverlay(null)} onPay={(plan) => checkout({ plan, userId: session?.user?.id, onDone: () => { setOverlay(null); setTimeout(loadProfile, 2500); } })} />}
        {toast && <Toast text={toast} />}
      </Page>
    );

  /* FIND PEOPLE */
  if (screen === "find")
    return (
      <Page>
        <Hdr title="Find people" onBack={() => setScreen("lobby")} />
        <div className="flex items-center gap-2 border border-gray-300 rounded-full px-4 py-2.5 focus-within:border-blue-600"><Search className="h-4 w-4 text-gray-400" /><input autoFocus value={findQ} onChange={e => setFindQ(e.target.value)} placeholder="Search people by name" className="flex-1 outline-none text-base" /></div>
        <div className="flex-1 overflow-y-auto mt-3">
          {findRes.map((s) => { const fr = friends.find(f => f.id === s.id); return (
            <div key={s.id} className="flex items-center gap-3 py-2 border-b border-gray-100">
              <div className={`h-10 w-10 rounded-full text-white flex items-center justify-center font-semibold ${aColor(s.name)}`}>{s.name[0]}</div>
              <div className="flex-1 min-w-0"><div className="font-medium">{s.name}</div><div className="text-sm text-gray-500 capitalize flex items-center gap-1"><GenderIcon g={s.gender} className="text-sm" />{s.gender} · {s.loc || "—"}</div></div>
              <div className="flex items-center gap-1.5">
                {!fr ? <button onClick={() => addFriend(s.id)} className="h-9 w-9 rounded-full border border-gray-300 text-gray-700 flex items-center justify-center"><UserPlus className="h-4 w-4" /></button>
                  : fr.status === "pending" ? <span className="text-xs text-amber-600">Pending</span> : <span className="text-xs text-emerald-600 flex items-center gap-0.5"><Check className="h-3 w-3" />Friend</span>}
                <button onClick={() => callFriend(s.id)} className="h-9 w-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><Phone className="h-4 w-4" /></button>
              </div>
            </div>); })}
          {findQ.length >= 2 && findRes.length === 0 && <div className="text-center text-sm text-gray-400 py-8">No matches</div>}
        </div>
        {overlay === "premium" && <Premium onClose={() => setOverlay(null)} onPay={(plan) => checkout({ plan, userId: session?.user?.id, onDone: () => setOverlay(null) })} />}
      </Page>
    );

  /* MATCHING */
  if (screen === "matching")
    return (
      <Page center>
        <div className="flex flex-col items-center gap-6">
          <div className="relative h-24 w-24 flex items-center justify-center"><span className="absolute inset-0 rounded-full border-2 border-blue-200 animate-ping" /><div className="h-16 w-16 rounded-full bg-blue-600 flex items-center justify-center"><Search className="h-7 w-7 text-white" /></div></div>
          <div className="text-center"><div className="text-lg font-medium">Finding someone…</div><div className="text-sm text-gray-500 mt-1">{mode === "nearby" ? "Searching nearby" : "Connecting you"}{isPremium && want !== "any" ? ` · ${want}` : ""}</div></div>
          <button onClick={() => { socket.emit("queue:leave"); setScreen("lobby"); }} className="px-6 py-2 rounded-full border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">Cancel</button>
        </div>
      </Page>
    );

  /* IN CALL */
  if (screen === "incall" && match)
    return (
      <Page>
        <RemoteAudio map={streams} />
        <div className="flex items-center gap-2">
          <button onClick={hangup} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><ArrowLeft className="h-5 w-5 text-gray-600" /></button>
          <span className="text-sm text-gray-500">In call</span><div className="flex-1" />
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer" onClick={() => setAutoConnect(a => !a)}><span className={`h-4 w-4 rounded border flex items-center justify-center ${autoConnect ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}>{autoConnect && <Check className="h-3 w-3 text-white" />}</span>Auto-next</label>
        </div>

        {monitored && <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2 flex items-center gap-2"><Shield className="h-3.5 w-3.5" />This call may be monitored for safety.</div>}

        <div className="mt-4 flex flex-col items-center text-center">
          <div className={`relative h-20 w-20 rounded-full text-white flex items-center justify-center text-2xl font-semibold ${aColor(match.peer?.name)}`}>{match.peer?.name?.[0]}<span className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-emerald-500 border-2 border-white" /></div>
          <div className="mt-3 text-xl font-medium">{match.peer?.name || "Stranger"}</div>
          <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
            <span className="capitalize flex items-center gap-1"><GenderIcon g={match.peer?.gender} className="text-base" />{match.peer?.gender || "—"}</span>
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{match.peer?.loc || "Location hidden"}</span>
          </div>
          <CallTimer />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-gray-200 p-2"><Wave active={!muted} color="bg-blue-500" /><div className="text-center text-xs text-gray-400 mt-1">You {muted && "(muted)"}</div></div>
          <div className="rounded-2xl border border-gray-200 p-2"><Wave active color="bg-emerald-500" /><div className="text-center text-xs text-gray-400 mt-1">{match.peer?.name || "Stranger"}</div></div>
        </div>

        <div ref={chatRef} className="flex-1 overflow-y-auto my-3 space-y-2 pr-1">
          {messages.length === 0 && <div className="text-center text-sm text-gray-400 mt-6">Say hi 👋 — chat while you talk</div>}
          {messages.map((m, i) => <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}><div className={`max-w-xs px-3 py-2 rounded-2xl text-base ${m.from === "me" ? "bg-blue-600 text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"}`}>{m.text}</div></div>)}
        </div>

        <div className="flex items-center gap-2 mb-3"><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Message…" className="flex-1 border border-gray-300 rounded-full px-4 py-2.5 text-base outline-none focus:border-blue-600" /><button onClick={send} className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center"><Send className="h-4 w-4" /></button></div>

        <div className="flex items-center justify-center gap-4 pb-1">
          <button onClick={toggleMute} className={`h-14 w-14 rounded-full flex items-center justify-center border ${muted ? "bg-rose-50 border-rose-200 text-rose-600" : "border-gray-300 text-gray-700"}`}>{muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}</button>
          <button onClick={hangup} className="h-16 w-16 rounded-full bg-rose-600 text-white flex items-center justify-center hover:bg-rose-700"><PhoneOff className="h-7 w-7" /></button>
          <button onClick={next} className="h-14 w-14 rounded-full border border-gray-300 text-gray-700 flex items-center justify-center"><SkipForward className="h-6 w-6" /></button>
        </div>
        <div className="mt-2 flex items-center justify-center gap-5 text-sm">
          <button onClick={() => addFriend(match.peer?.id)} className="text-blue-600 hover:underline flex items-center gap-1"><UserPlus className="h-4 w-4" />Add friend</button>
          <button onClick={() => setReportOpen(true)} className="text-gray-500 hover:underline flex items-center gap-1"><Flag className="h-4 w-4" />Report</button>
          <button onClick={blockPeer} className="text-rose-600 hover:underline flex items-center gap-1"><Ban className="h-4 w-4" />Block</button>
        </div>
        {reportOpen && <ReportOverlay onClose={() => setReportOpen(false)} onSubmit={reportPeer} />}
        {toast && <Toast text={toast} />}
      </Page>
    );

  /* CONFERENCE SETUP */
  if (screen === "confSetup")
    return (
      <Page>
        <Hdr title="Group call" onBack={() => setScreen("lobby")} />
        <p className="text-gray-500 text-base mb-6">Talk with several people at once. Create a room and share the code, or join one.</p>
        <button onClick={() => socket.emit("conf:create")} className="w-full py-3.5 rounded-full bg-blue-600 text-white font-medium text-lg flex items-center justify-center gap-2 hover:bg-blue-700"><Plus className="h-5 w-5" />Create a room</button>
        <div className="flex items-center gap-3 my-5 text-gray-400 text-sm"><div className="flex-1 h-px bg-gray-200" />or join<div className="flex-1 h-px bg-gray-200" /></div>
        <JoinRoom onJoin={(code) => socket.emit("conf:join", { code })} />
      </Page>
    );

  /* CONFERENCE */
  if (screen === "conf" && conf) {
    const peers = Object.values(conf.peers || {});
    return (
      <Page>
        <RemoteAudio map={streams} />
        <div className="flex items-center gap-2"><button onClick={() => { socket.emit("room:leave", { roomId: conf.roomId }); media.current.closeAll(); setStreams({}); setConf(null); setScreen("lobby"); }} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><ArrowLeft className="h-5 w-5 text-gray-600" /></button><div><div className="font-medium">Group call</div><div className="text-xs text-gray-500">{peers.length + 1} in room</div></div><div className="flex-1" /><span className="flex items-center gap-1.5 text-sm border border-gray-300 rounded-full px-3 py-1.5"><Hash className="h-3.5 w-3.5 text-gray-400" />{conf.code}</span></div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center gap-1.5"><div className={`h-16 w-16 rounded-full text-white flex items-center justify-center text-xl font-semibold ${aColor(me.name)} ${!muted ? "ring-4 ring-blue-300" : ""}`}>{me.name[0]}</div><span className="text-sm">You</span></div>
          {peers.map(p => <div key={p.id} className="flex flex-col items-center gap-1.5"><div className={`h-16 w-16 rounded-full text-white flex items-center justify-center text-xl font-semibold ${aColor(p.name)}`}>{p.name?.[0]}</div><span className="text-sm">{p.name}</span></div>)}
        </div>
        <div className="flex-1" />
        <div className="flex items-center justify-center gap-4 pb-1"><button onClick={toggleMute} className={`h-14 w-14 rounded-full flex items-center justify-center border ${muted ? "bg-rose-50 border-rose-200 text-rose-600" : "border-gray-300 text-gray-700"}`}>{muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}</button><button onClick={() => { socket.emit("room:leave", { roomId: conf.roomId }); media.current.closeAll(); setStreams({}); setConf(null); setScreen("lobby"); }} className="h-16 w-16 rounded-full bg-rose-600 text-white flex items-center justify-center hover:bg-rose-700"><PhoneOff className="h-7 w-7" /></button></div>
      </Page>
    );
  }

  /* FRIENDS */
  if (screen === "friends")
    return (
      <Page>
        <Hdr title="Friends" onBack={() => setScreen("lobby")} />
        {!isPremium && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 mb-4 text-sm text-amber-700 flex items-center gap-2"><Crown className="h-4 w-4" />Calling friends needs Premium. <button onClick={() => setOverlay("premium")} className="underline font-medium">Upgrade</button></div>}
        {friends.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2"><Users className="h-10 w-10" /><p className="text-sm">No friends yet.</p></div> :
          <div className="space-y-2">{friends.map(f => <div key={f.id} className="flex items-center gap-3 py-2 border-b border-gray-100"><div className={`h-10 w-10 rounded-full text-white flex items-center justify-center font-semibold ${aColor(f.name)}`}>{f.name?.[0]}</div><div className="flex-1"><div className="font-medium">{f.name}</div><div className="text-sm text-gray-500">{f.loc || "—"}</div></div>{f.status === "pending" ? <span className="text-sm text-amber-600">Pending…</span> : <button onClick={() => callFriend(f.id)} className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><Phone className="h-4 w-4" /></button>}</div>)}</div>}
        {overlay === "premium" && <Premium onClose={() => setOverlay(null)} onPay={(plan) => checkout({ plan, userId: session?.user?.id, onDone: () => setOverlay(null) })} />}
      </Page>
    );

  /* HISTORY */
  if (screen === "history")
    return (
      <Page>
        <Hdr title="Call history" onBack={() => setScreen("lobby")} />
        {history.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2"><Clock className="h-10 w-10" /><p className="text-sm">No calls yet.</p></div> :
          <div className="space-y-1">{history.map((h, i) => <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100"><div className={`h-10 w-10 rounded-full text-white flex items-center justify-center font-semibold ${aColor(h.name)}`}>{h.name?.[0]}</div><div className="flex-1"><div className="font-medium">{h.name}</div><div className="text-sm text-gray-500">{h.loc || "—"} · {h.when}</div></div><div className="text-sm font-mono text-gray-400">{fmt(h.dur)}</div></div>)}</div>}
      </Page>
    );

  /* ADMIN */
  if (screen === "admin")
    return (
      <Page>
        <RemoteAudio map={adminStreams} />
        <Hdr title="Admin" onBack={() => setScreen("lobby")} />
        <div className="flex gap-2 mb-4 text-sm">
          {[["calls", "Live calls"], ["reports", "Reports"]].map(([k, l]) => <button key={k} onClick={() => setAdminTab(k)} className={`px-3 py-1.5 rounded-full border ${adminTab === k ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>{l}{k === "reports" && adminReports.length ? ` (${adminReports.length})` : ""}</button>)}
        </div>

        {adminTab === "calls" && (
          <div className="space-y-1">
            {adminRooms.length === 0 && <div className="text-center text-sm text-gray-400 py-8">No active calls right now.</div>}
            {adminRooms.map(r => (
              <div key={r.id} className="flex items-center gap-3 py-2.5 border-b border-gray-100">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <div className="flex-1 text-sm font-medium">{r.members.map(m => m.name).join("  ↔  ")}</div>
                {adminCall === r.id
                  ? <div className="flex items-center gap-1.5"><span className="text-xs text-emerald-600 flex items-center gap-1"><Volume2 className="h-3.5 w-3.5" />Listening</span><button onClick={() => adminTalk(!adminTalking)} className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 ${adminTalking ? "bg-blue-600 text-white" : "border border-gray-300 text-gray-600"}`}><Radio className="h-3 w-3" />{adminTalking ? "Talking" : "Talk"}</button><button onClick={adminStop} className="px-2 py-1 rounded-full text-xs border border-gray-300 text-gray-600">Stop</button></div>
                  : <div className="flex items-center gap-1.5"><button onClick={() => adminListen(r.id)} className="px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-700 flex items-center gap-1"><Eye className="h-3 w-3" />Listen</button><button onClick={() => adminEnd(r.id)} className="px-2 py-1 rounded-full text-xs text-rose-600 border border-rose-200">End</button></div>}
              </div>
            ))}
          </div>
        )}

        {adminTab === "reports" && (
          <div className="space-y-2">
            {adminReports.length === 0 && <div className="text-center text-sm text-gray-400 py-8">No reports.</div>}
            {adminReports.map(r => (
              <div key={r.id} className="rounded-2xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium flex items-center gap-1.5"><Flag className="h-3.5 w-3.5 text-rose-600" />{r.reported_name || "Unknown"}</div>
                  {r.reported_id && <button onClick={() => adminBan(r.reported_id)} className="px-2 py-1 rounded-full text-xs bg-rose-600 text-white flex items-center gap-1"><Ban className="h-3 w-3" />Ban</button>}
                </div>
                <div className="text-xs text-gray-500 mt-1">Reason: {r.reason}</div>
                <div className="text-xs text-gray-400 mt-0.5">by {r.reporter_name || "—"} · {r.created_at ? new Date(r.created_at).toLocaleString() : ""}</div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-4 flex items-center gap-1"><Shield className="h-3 w-3" />Moderation & safety only. Disclose monitoring in your Terms.</p>
        {toast && <Toast text={toast} />}
      </Page>
    );

  return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
}

/* ---------------- Location picker: Country → State → City ---------------- */
function LocationPicker({ onClose, onPick }) {
  const [country, setCountry] = useState(null);
  const [stateSel, setStateSel] = useState(null);
  const [q, setQ] = useState("");
  const num = (v, f = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : f; };
  const countries = useMemo(() => getCountries(), []);
  const states = useMemo(() => (country ? getStates(country.isoCode) : []), [country]);
  const cities = useMemo(() => {
    if (!country) return [];
    if (stateSel) return getCities(country.isoCode, stateSel.isoCode);
    if (states.length === 0) return getCitiesOfCountry(country.isoCode);
    return [];
  }, [country, stateSel, states]);
  const level = !country ? "country" : (!stateSel && states.length > 0 ? "state" : "city");
  const base = level === "country" ? countries : level === "state" ? states : cities;
  const ql = q.trim().toLowerCase();
  const list = (ql ? base.filter(x => x.name.toLowerCase().includes(ql)) : base).slice(0, 100);
  const back = () => { setQ(""); if (stateSel) setStateSel(null); else if (country) setCountry(null); else onClose(); };
  const placeholder = level === "country" ? "Search country" : level === "state" ? "Search state / province" : "Search city / district";
  const crumb = [country?.name, stateSel?.name].filter(Boolean).join(" › ") || "Choose location";
  function choose(item) {
    if (level === "country") { setCountry(item); setQ(""); }
    else if (level === "state") { setStateSel(item); setQ(""); }
    else { const label = stateSel ? `${item.name}, ${stateSel.name}, ${country.name}` : `${item.name}, ${country.name}`; onPick({ label, lat: num(item.latitude, num(country.latitude)), lng: num(item.longitude, num(country.longitude)) }); }
  }
  return (
    <div className="fixed inset-0 bg-white z-50 flex justify-center">
      <div className="w-full max-w-md flex flex-col px-5 py-5">
        <div className="flex items-center gap-2 mb-1"><button onClick={back} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><ArrowLeft className="h-5 w-5 text-gray-600" /></button><span className="text-lg font-medium truncate">{crumb}</span></div>
        <div className="text-xs text-gray-400 mb-2">{level === "country" ? "Pick your country" : level === "state" ? "Pick a state/province — or use the whole country" : "Pick a city/district — or use the whole state"}</div>
        <div className="flex items-center gap-2 border border-gray-300 rounded-full px-4 py-2.5 focus-within:border-blue-600"><Search className="h-4 w-4 text-gray-400" /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} className="flex-1 outline-none text-base" /></div>
        {country && !stateSel && <button onClick={() => onPick({ label: country.name, lat: num(country.latitude), lng: num(country.longitude) })} className="mt-2 text-sm text-blue-600 text-left">Use {country.name} (whole country)</button>}
        {stateSel && <button onClick={() => onPick({ label: `${stateSel.name}, ${country.name}`, lat: num(stateSel.latitude, num(country.latitude)), lng: num(stateSel.longitude, num(country.longitude)) })} className="mt-2 text-sm text-blue-600 text-left">Use {stateSel.name} (whole state)</button>}
        <div className="flex-1 overflow-y-auto mt-2">
          {list.map((item, i) => (
            <button key={(item.isoCode || item.name) + i} onClick={() => choose(item)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-xl text-left">
              <span className="text-base">{level === "country" ? item.flag : <MapPin className="h-4 w-4 text-gray-400 inline" />}</span>
              <span className="flex-1 text-base">{item.name}</span>
              {level !== "city" && <ArrowLeft className="h-4 w-4 text-gray-300 rotate-180" />}
            </button>
          ))}
          {base.length === 0 && <div className="text-center text-sm text-gray-400 py-8">No options — use the button above.</div>}
          {ql && list.length === 0 && base.length > 0 && <div className="text-center text-sm text-gray-400 py-8">No matches</div>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return <div><label className="text-sm text-gray-500">{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-3 text-base outline-none focus:border-blue-600" /></div>;
}

function Auth({ onBack, onLocOpen, LocPicker, pickedLoc }) {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [name, setName] = useState(""); const [gender, setGender] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  if (LocPicker) return LocPicker;
  async function go() {
    setBusy(true); setErr("");
    try {
      if (tab === "login") { const { error } = await supabase.auth.signInWithPassword({ email, password: pass }); if (error) throw error; }
      else {
        const { data, error } = await supabase.auth.signUp({ email, password: pass, options: { data: { name } } });
        if (error) throw error;
        const uid = data.user?.id;
        if (uid) await supabase.from("profiles").update({ name, gender, loc: pickedLoc?.label || "", lat: pickedLoc?.lat, lng: pickedLoc?.lng }).eq("id", uid);
      }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const ok = email.trim() && pass.trim() && (tab === "login" || (name.trim() && gender));
  return (
    <div className="min-h-screen w-full bg-white text-gray-800 flex justify-center"><div className="w-full max-w-md px-5 py-6 flex flex-col">
      <div className="flex items-center gap-2 mb-5"><button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><ArrowLeft className="h-5 w-5 text-gray-600" /></button><span className="text-xl font-medium">{tab === "login" ? "Log in" : "Create account"}</span></div>
      <div className="flex gap-2 mb-4">{["login", "signup"].map(t => <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 rounded-full text-sm capitalize border ${tab === t ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>{t === "login" ? "Log in" : "Sign up"}</button>)}</div>
      <div className="flex flex-col gap-4">
        {tab === "signup" && <Field label="Name" value={name} onChange={setName} placeholder="What should we call you?" />}
        {tab === "signup" && <div><label className="text-sm text-gray-500">Gender</label><div className="mt-1 grid grid-cols-3 gap-2">{["male", "female", "other"].map(g => <button key={g} onClick={() => setGender(g)} className={`py-2.5 rounded-xl border capitalize text-base flex items-center justify-center gap-1.5 ${gender === g ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600"}`}><GenderIcon g={g} className="text-base" />{g}</button>)}</div></div>}
        {tab === "signup" && <div><label className="text-sm text-gray-500">Location (optional)</label><button onClick={onLocOpen} className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-3 text-base text-left flex items-center justify-between hover:border-blue-600"><span className={pickedLoc ? "text-gray-800" : "text-gray-400"}>{pickedLoc?.label || "Search city / district"}</span><Search className="h-4 w-4 text-gray-400" /></button></div>}
        <Field label="Email" value={email} onChange={setEmail} placeholder="you@email.com" />
        <Field label="Password" value={pass} onChange={setPass} placeholder="••••••••" type="password" />
      </div>
      {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
      <div className="flex-1" />
      <button disabled={!ok || busy} onClick={go} className="mt-6 w-full py-3.5 rounded-full bg-blue-600 text-white font-medium text-lg disabled:opacity-40 hover:bg-blue-700">{busy ? "Please wait…" : tab === "login" ? "Log in" : "Create account"}</button>
      <p className="text-center text-xs text-gray-400 mt-3">By continuing you agree to the Terms and Privacy Policy.</p>
    </div></div>
  );
}

function GuestSetup({ onBack, onLocOpen, LocPicker, pickedLoc, onStart }) {
  const [name, setName] = useState(""); const [gender, setGender] = useState("");
  if (LocPicker) return LocPicker;
  return (
    <div className="min-h-screen w-full bg-white text-gray-800 flex justify-center"><div className="w-full max-w-md px-5 py-6 flex flex-col">
      <div className="flex items-center gap-2 mb-5"><button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><ArrowLeft className="h-5 w-5 text-gray-600" /></button><span className="text-xl font-medium">Quick setup</span></div>
      <div className="flex flex-col gap-4">
        <Field label="Name (optional)" value={name} onChange={setName} placeholder="What should we call you?" />
        <div><label className="text-sm text-gray-500">Gender</label><div className="mt-1 grid grid-cols-3 gap-2">{["male", "female", "other"].map(g => <button key={g} onClick={() => setGender(g)} className={`py-2.5 rounded-xl border capitalize text-base flex items-center justify-center gap-1.5 ${gender === g ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600"}`}><GenderIcon g={g} className="text-base" />{g}</button>)}</div></div>
        <div><label className="text-sm text-gray-500">Location (optional)</label><button onClick={onLocOpen} className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-3 text-base text-left flex items-center justify-between hover:border-blue-600"><span className={pickedLoc ? "text-gray-800" : "text-gray-400"}>{pickedLoc?.label || "Search city / district"}</span><Search className="h-4 w-4 text-gray-400" /></button></div>
      </div>
      <div className="flex-1" />
      <button disabled={!gender} onClick={() => onStart({ name: name.trim(), gender })} className="mt-6 w-full py-3.5 rounded-full bg-blue-600 text-white font-medium text-lg disabled:opacity-40 hover:bg-blue-700">Start</button>
      <p className="text-center text-xs text-gray-400 mt-3 flex items-center justify-center gap-1"><Shield className="h-3 w-3" />You must be 18+. Be kind — calls may be monitored for safety.</p>
    </div></div>
  );
}

function JoinRoom({ onJoin }) {
  const [code, setCode] = useState("");
  return (<>
    <div className="flex items-center gap-2 border border-gray-300 rounded-full px-4 py-2.5 focus-within:border-blue-600"><Hash className="h-4 w-4 text-gray-400" /><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Enter room code" className="flex-1 outline-none text-base uppercase tracking-wider" /></div>
    <button disabled={!code.trim()} onClick={() => onJoin(code.trim())} className="mt-3 w-full py-3 rounded-full border border-gray-300 text-gray-700 font-medium disabled:opacity-40 hover:bg-gray-50">Join room</button>
  </>);
}

function IncomingCall({ from, onAccept, onDecline }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl border border-gray-200 p-6 text-center shadow-xl">
        <div className={`h-16 w-16 rounded-full mx-auto text-white flex items-center justify-center text-2xl font-semibold ${aColor(from?.name)}`}>{from?.name?.[0]}</div>
        <div className="mt-3 text-lg font-medium">{from?.name}</div><div className="text-sm text-gray-500">is calling you…</div>
        <div className="mt-5 flex gap-3"><button onClick={onDecline} className="flex-1 py-3 rounded-full bg-rose-600 text-white font-medium">Decline</button><button onClick={onAccept} className="flex-1 py-3 rounded-full bg-emerald-600 text-white font-medium">Accept</button></div>
      </div>
    </div>
  );
}

function Premium({ onClose, onPay }) {
  const [plan, setPlan] = useState("month"); const [busy, setBusy] = useState(false);
  const perks = [["Filter by gender"], ["Match people nearby"], ["Call your friends"], ["Priority matching"]];
  return (
    <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md bg-white rounded-3xl border border-gray-200 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><Crown className="h-5 w-5 text-amber-500" /><span className="text-lg font-medium">Premium</span></div><button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="space-y-2.5 mb-4">{perks.map(([t], k) => <div key={k} className="flex items-center gap-3 text-base"><Check className="h-4 w-4 text-blue-600" />{t}</div>)}</div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button onClick={() => setPlan("day")} className={`rounded-2xl border p-3 text-left ${plan === "day" ? "border-blue-600 bg-blue-50" : "border-gray-200"}`}><div className="text-xs text-gray-500">Daily</div><div className="text-xl font-semibold">₹15<span className="text-sm font-normal text-gray-500">/day</span></div></button>
          <button onClick={() => setPlan("month")} className={`relative rounded-2xl border p-3 text-left ${plan === "month" ? "border-blue-600 bg-blue-50" : "border-gray-200"}`}><span className="absolute -top-2 right-2 text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full">Save 33%</span><div className="text-xs text-gray-500">Monthly</div><div className="text-xl font-semibold">₹300<span className="text-sm font-normal text-gray-500">/mo</span></div></button>
        </div>
        <button onClick={() => { setBusy(true); onPay(plan); }} disabled={busy} className="w-full py-3.5 rounded-full bg-blue-600 text-white font-medium flex items-center justify-center gap-2 hover:bg-blue-700">{busy ? "Opening…" : `Pay with Razorpay · ${plan === "day" ? "₹15" : "₹300"}`}</button>
        <p className="text-center text-xs text-gray-400 mt-2">Renews until cancelled. See Terms.</p>
      </div>
    </div>
  );
}
