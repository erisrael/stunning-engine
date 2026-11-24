// Customer support calls (the website, the app's widget, the Telegram Mini App and the agents' desk): how the two
// browsers find a path to each other.
//
// The offer and the answer travel through the server, and so do the network addresses found later ("trickle"): on
// mobile data the address through the relay (TURN, the one that works behind phone-network firewalls) often takes a
// few seconds, longer than the first answer could wait. Without it the call rings, is answered and then cannot
// connect. So: wait a little for the relay before sending the offer or answer, send every address found after that,
// and add the other side's addresses as they arrive (read from the call's status, which both sides check anyway).

const hasRelay = (servers: RTCIceServer[]) => servers.some((s) => [s.urls].flat().some((u) => /^turns?:/i.test(String(u))));

/** Waits until the browser has its addresses: all of them, or the relay one (when there is a relay), at most `max` ms. */
export async function gathered(pc: RTCPeerConnection, servers: RTCIceServer[] = [], max?: number) {
  if (pc.iceGatheringState === "complete") return;
  const relay = hasRelay(servers);
  const limit = max ?? (relay ? 6000 : 3000);
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(t);
      pc.removeEventListener("icegatheringstatechange", onState);
      pc.removeEventListener("icecandidate", onCand);
      resolve();
    };
    const t = window.setTimeout(finish, limit);
    const onState = () => pc.iceGatheringState === "complete" && finish();
    // A relay address is enough to connect anywhere; give the others a moment, then go (the rest follow).
    const onCand = (e: RTCPeerConnectionIceEvent) => {
      if (e.candidate?.type === "relay" || (!relay && e.candidate?.type === "srflx")) window.setTimeout(finish, 400);
    };
    pc.addEventListener("icegatheringstatechange", onState);
    pc.addEventListener("icecandidate", onCand);
  });
}

/**
 * Sends this side's addresses as they are found (one at a time, in order; the server keeps them in a list) and adds
 * the other side's. `start` is called once the call has an ID on the server (before that they wait in a queue).
 */
export function trickle(pc: RTCPeerConnection, send: (candidate: RTCIceCandidateInit) => Promise<unknown>) {
  let ready = false;
  const queue: RTCIceCandidateInit[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  const post = (c: RTCIceCandidateInit) => {
    chain = chain.then(() => send(c)).catch(() => {});
  };
  pc.addEventListener("icecandidate", (e) => {
    if (!e.candidate || !e.candidate.candidate) return;
    const c = e.candidate.toJSON();
    if (ready) post(c);
    else queue.push(c);
  });
  const seen = new Set<string>();
  return {
    /** The call exists on the server: send what was found so far, and the rest as it comes. */
    start() {
      if (ready) return;
      ready = true;
      for (const c of queue.splice(0)) post(c);
    },
    /** The other side's addresses (from the call's status); each is added once, after its answer or offer is set. */
    async add(list: unknown) {
      if (!Array.isArray(list) || !pc.remoteDescription || pc.signalingState === "closed") return;
      for (const raw of list) {
        const key = JSON.stringify(raw);
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          await pc.addIceCandidate(raw as RTCIceCandidateInit);
        } catch {
          // An address this browser cannot use: the others still can.
        }
      }
    },
  };
}
