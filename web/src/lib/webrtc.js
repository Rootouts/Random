const ICE = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: import.meta.env.VITE_TURN_URL,
      username: import.meta.env.VITE_TURN_USER,
      credential: import.meta.env.VITE_TURN_PASS,
    },
  ],
};

// sendAudioOnAnswer: true for normal users; admin sets false (listen-only until "Talk")
export function createMedia(socket, { onStream, onGone, sendAudioOnAnswer = true } = {}) {
  let local = null;
  const pcs = new Map();

  const initMic = async () => {
    local = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return local;
  };
  const setMuted = (m) => local?.getAudioTracks().forEach((t) => (t.enabled = !m));

  function makePc(peerId, sendAudio) {
    const pc = new RTCPeerConnection(ICE);
    if (sendAudio && local) local.getTracks().forEach((t) => pc.addTrack(t, local));
    else pc.addTransceiver("audio", { direction: "recvonly" });
    pc.onicecandidate = (e) => e.candidate && socket.emit("signal", { to: peerId, data: { candidate: e.candidate } });
    pc.ontrack = (e) => onStream?.(peerId, e.streams[0]);
    pc.onconnectionstatechange = () =>
      ["failed", "disconnected", "closed"].includes(pc.connectionState) && onGone?.(peerId);
    pcs.set(peerId, pc);
    return pc;
  }

  async function call(peerId, { sendAudio = true } = {}) {        // initiator
    const pc = makePc(peerId, sendAudio);
    await pc.setLocalDescription(await pc.createOffer());
    socket.emit("signal", { to: peerId, data: { sdp: pc.localDescription } });
  }

  async function onSignal({ from, data }) {
    let pc = pcs.get(from);
    if (data.sdp) {
      if (!pc) pc = makePc(from, sendAudioOnAnswer);              // answerer
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === "offer") {
        await pc.setLocalDescription(await pc.createAnswer());
        socket.emit("signal", { to: from, data: { sdp: pc.localDescription } });
      }
    } else if (data.candidate && pc) {
      try { await pc.addIceCandidate(data.candidate); } catch {}
    }
  }

  async function addMic(peerId) {                                 // admin barge-in / renegotiate
    const pc = pcs.get(peerId); if (!pc || !local) return;
    local.getTracks().forEach((t) => pc.addTrack(t, local));
    await pc.setLocalDescription(await pc.createOffer());
    socket.emit("signal", { to: peerId, data: { sdp: pc.localDescription } });
  }

  const close = (peerId) => { pcs.get(peerId)?.close(); pcs.delete(peerId); };
  const closeAll = () => { pcs.forEach((p) => p.close()); pcs.clear(); };

  return { initMic, setMuted, call, onSignal, addMic, close, closeAll, get local() { return local; }, peerIds: () => [...pcs.keys()] };
}
