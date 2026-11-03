// The dialogue system builder's flow viewer, embedded in any page as one view of IL's ConnectConversation({way, views}), on the
// text, press-to-speak and Pipecat voice mounts alike. The viewer runs in a frame of its own, so its styles never touch
// the page, and messages go to the frame's origin only.
//
//   import { mountFlowViewer } from "./flow-viewer.js";
//   const nodes = mountFlowViewer(element, { src: "viewer.html", design });   // design is the object Export design writes
//   ConnectConversation({ way: "text", views: [nodes] });
//
// ConnectConversation calls start() when the conversation starts, adapterCallback(event) with every adapter callback of
// the session, botMessage() with each reply, and phase(p) with "listening", "thinking" or "speaking" on the two speech
// mounts. The text mount has no phase, so there the reply lights the node. design(d) redraws the
// viewer with another design.
export function mountFlowViewer(element, { src = "viewer.html", design } = {}) {
  const frame = Object.assign(document.createElement("iframe"), { src, title: "conversation flow" });
  frame.style.cssText = "border:0;width:100%;height:100%;display:block";
  element.replaceChildren(frame);
  const origin = new URL(src, location.href).origin;
  const target = origin === "null" ? "*" : origin;   // a page opened from a file has no origin to name
  let ready = false; const queue = [];
  const send = (m) => (ready ? frame.contentWindow.postMessage(m, target) : queue.push(m));
  window.addEventListener("message", (ev) => {
    if (ev.source !== frame.contentWindow || ev.data?.type !== "flow-viewer-ready") return;
    ready = true; queue.splice(0).forEach((m) => frame.contentWindow.postMessage(m, target));
  });
  if (design) send({ type: "design", design });
  return {
    design: (d) => send({ type: "design", design: d }),
    start: () => send({ type: "start" }),
    adapterCallback: (event) => send({ type: "adapterCallback", event }),
    botMessage: () => send({ type: "botMessage" }),
    phase: (phase) => send({ type: "phase", phase }),
  };
}
