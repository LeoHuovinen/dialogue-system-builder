// The dialogue system builder's chat, embedded in any page as one view of IL's ConnectConversation({way, views}), beside the flow
// viewer or alone, on the text, press-to-speak and Pipecat voice mounts alike. The chat runs in a frame of its own, so its
// styles never touch the page, and messages go to the frame's origin only.
//
//   import { mountFlowChat } from "./flow-chat.js";
//   const chat = mountFlowChat(element, { src: "chat.html", typing: true, onSend: (text) => conversation.sendText(text) });
//   ConnectConversation({ way: "text", views: [nodes, chat] });
//
// ConnectConversation calls start() when the conversation starts, userMessage(text, final) with the person's line and
// botMessage(text) with the assistant's reply. The option typing shows the chat's input, for the text mount, and onSend
// receives every typed line. src/chat/main.jsx is the frame's side of these messages.
export function mountFlowChat(element, { src = "chat.html", typing = false, heading = typing ? "CHAT: type" : "CHAT: speak", onSend = () => {} } = {}) {
  const frame = Object.assign(document.createElement("iframe"), { src, title: "conversation chat" });
  frame.style.cssText = "border:0;width:100%;height:100%;display:block";
  element.replaceChildren(frame);
  const origin = new URL(src, location.href).origin;
  const target = origin === "null" ? "*" : origin;   // a page opened from a file has no origin to name
  let ready = false; const queue = [];
  const send = (m) => (ready ? frame.contentWindow.postMessage(m, target) : queue.push(m));
  window.addEventListener("message", (ev) => {
    if (ev.source !== frame.contentWindow) return;
    if (ev.data?.type === "flow-chat-ready") { ready = true; queue.splice(0).forEach((m) => frame.contentWindow.postMessage(m, target)); }
    if (ev.data?.type === "flow-chat-send") onSend(ev.data.text);
  });
  send({ type: "setup", typing, heading });
  return {
    start: () => send({ type: "start" }),
    userMessage: (text, final) => send({ type: "userMessage", text, final }),
    botMessage: (text) => send({ type: "botMessage", text }),
  };
}
