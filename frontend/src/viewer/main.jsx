// The viewer's page, the FlowViewer alone, driven by the messages the embedding page sends through flow-viewer.js, or by
// ?design=URL for the design alone. The message {type: "design", design} carries the design as Export design writes it,
// and the canvas shows it in conversation mode. The message {type: "start"} says the conversation has started on its first
// step. The message {type: "adapterCallback", event} carries one adapter callback of the session, and a
// ConversationStateChangedAdapterCallbackHandlerEvent moves the lit node, while one of type "step-change" is sent
// only by the ?demo=1 replay below. The message {type: "phase", phase} carries "listening", "thinking", "speaking" or "idle", and
// "speaking" lights the node the last state change named. The message {type: "botMessage"} says a reply has arrived, and
// on the text mount, which has no phase, that is what lights the node. Only messages from the embedding page are read, and
// public-flow-viewer.js shares these message names.
import React from "react";
import ReactDOM from "react-dom/client";
import "../styles.css";
import { useStore } from "../store";
import { advancePatch, speakingPatch } from "../flow/live";
import { FlowViewer } from "./FlowViewer";

const s = () => useStore.getState();
const load = (design) => { s().loadDesign(design); s().setMode("conversation"); };
const step = (msg) => s().setLive(advancePatch(s(), msg));
let phaseSeen = false;
const handle = (m) => {
  if (!m || typeof m !== "object") return;
  if (m.type === "phase") phaseSeen = true;
  if (m.type === "botMessage" && !phaseSeen) s().setLive(speakingPatch(s()));
  if (m.type === "design") load(m.design);
  if (m.type === "start") step({ step_index: 0, previous_index: null });
  if (m.type === "phase") s().setLive(m.phase === "speaking" ? speakingPatch(s()) : { phase: m.phase });
  if (m.type === "adapterCallback") {
    const e = m.event || {};
    if (e.type === "ConversationStateChangedAdapterCallbackHandlerEvent") step({ step_index: e.conversation_state, previous_index: e.previous_conversation_state });
    if (e.type === "step-change") step(e);
  }
};
window.addEventListener("message", (ev) => { if (ev.source === window.parent) handle(ev.data); });
window.FlowViewer = { handle };   // for a page that loads the viewer directly instead of in a frame

// On its own, from the address, ?design=URL names a file Export design wrote and ?template=KEY one of the builder's own
// templates, and ?demo=1 replays a walk through it, every state change and phase as a conversation would send them.
const params = new URLSearchParams(location.search);
const play = async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ids = s().orderedStateIds(), edges = s().edges;
  handle({ type: "start" }); await wait(600);
  for (let at = 0; ; ) {
    handle({ type: "phase", phase: "speaking" }); await wait(2600);
    handle({ type: "phase", phase: "listening" }); await wait(1800);
    handle({ type: "phase", phase: "thinking" });
    const next = edges.find((e) => e.source === ids[at]);
    const to = next ? ids.indexOf(next.target) : -1;
    if (to < 0) break;
    handle({ type: "adapterCallback", event: { type: "step-change", step_index: to, previous_index: at } }); await wait(1400);
    at = to;
  }
  handle({ type: "phase", phase: "idle" });
};
const ready = (design) => {
  if (!design) throw new Error("no such template");
  load(design);
  if (params.get("demo")) setTimeout(play, 1200);
};
const failed = (what) => (error) => {
  const note = Object.assign(document.createElement("p"), { textContent: `The viewer could not load ${what}: ${error.message}` });
  note.style.cssText = "position:fixed;inset:1rem auto auto 1rem;margin:0;z-index:10;color:#f87171";
  document.body.append(note);
};
if (params.get("design")) {
  fetch(params.get("design")).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }).then(ready).catch(failed(params.get("design")));
} else if (params.get("template")) {
  import("../templates.json").then((m) => ready(m.default.find((t) => t.key === params.get("template"))?.design)).catch(failed(params.get("template")));
}

ReactDOM.createRoot(document.getElementById("root")).render(<FlowViewer />);
window.parent?.postMessage({ type: "flow-viewer-ready" }, "*");
