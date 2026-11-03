// The chat's page, FlowChat alone, driven by messages from the page that embeds it through public-flow-chat.js, which
// shares these message names. The message {type: "setup", typing, heading} says whether to show the input, for the text
// mount, and the line above the bubbles. The message {type: "start"} says the conversation has started, and shows a
// thinking bubble until the assistant's first words. The message {type: "userMessage", text, final} carries the person's
// line, with final false while they are still speaking. The message {type: "botMessage", text} carries the assistant's
// reply or a piece of it, and its name is IL's view method. This page sends {type: "flow-chat-ready"} once, to any origin
// since it carries nothing, and {type: "flow-chat-send", text} for every line typed into it, only to the embedding page's
// origin. Only messages from the embedding page are read.
import React, { useEffect, useReducer, useState } from "react";
import ReactDOM from "react-dom/client";
import "../styles.css";
import { FlowChat, chatReducer } from "./FlowChat";

let parentOrigin = "*";

function ChatPage() {
  const [messages, dispatch] = useReducer(chatReducer, []);
  const [setup, setSetup] = useState({ typing: false, heading: "CHAT" });
  useEffect(() => {
    const handle = (ev) => {
      if (ev.source !== window.parent) return;
      if (ev.origin !== "null") parentOrigin = ev.origin;
      const m = ev.data;
      if (!m || typeof m !== "object") return;
      if (m.type === "setup") setSetup({ typing: !!m.typing, heading: m.heading || "CHAT" });
      else dispatch(m);
    };
    window.addEventListener("message", handle);
    window.parent?.postMessage({ type: "flow-chat-ready" }, "*");
    return () => window.removeEventListener("message", handle);
  }, []);
  const send = (text) => window.parent?.postMessage({ type: "flow-chat-send", text }, parentOrigin);
  return <FlowChat messages={messages} typing={setup.typing} heading={setup.heading} onSend={send} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<ChatPage />);
