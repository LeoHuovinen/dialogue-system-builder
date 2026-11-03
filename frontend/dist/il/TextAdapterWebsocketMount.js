// The browser half of TextAdapterWebsocketMount: the page's turns as text frames on the mount's socket; the reply back as
// {"type": "TextReplyText", "text"} (onBotText), the typed line back as {"type": "TextHeardText", "text"} when the session
// takes it (onUserText), the adapter callbacks back as JSON (onAdapterCallback), the log lines (marked log) to ./log.js. Imported by ConnectConversation.js for way "text".
export function Connect(on, { path = "/ws", hello = null } = {}) {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${scheme}://${location.host}${path}`);
  const queued = [];
  socket.onopen = () => { if (hello) socket.send(JSON.stringify(hello)); queued.splice(0).forEach((m) => socket.send(m)); };
  socket.onmessage = (m) => {
    const message = JSON.parse(m.data);
    if (message.log) { window.dispatchEvent(new CustomEvent(message.log === "event" ? "RecordedEventLog" : "AdapterCallbackLog", { detail: message })); return; }   // the log stream, to ./log.js, never to the page
    if (message.type === "TextReplyText") { if (message.text) on("onBotText", message.text); return; }
    if (message.type === "TextHeardText") { on("onUserText", message.text, true); return; }
    on("onAdapterCallback", message);
  };
  return {
    sendText: (text) => (socket.readyState === WebSocket.OPEN ? socket.send(text) : queued.push(text)),
    close: () => socket.close(),
  };
}

