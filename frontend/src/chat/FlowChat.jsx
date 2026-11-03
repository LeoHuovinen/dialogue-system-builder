// The chat's bubbles, heading and input, used by the editor's sidebar and a tester's page through Conversation.jsx, and
// alone through chat/main.jsx. The component is driven only by the messages it is given, never by RTVI events, so it runs
// beside any of IL's mounts, the text mount, the press-to-speak mount and the Pipecat voice mount. The person's line
// arrives as userMessage, as interim text while they speak and then the final line, and the assistant's reply as
// botMessage, one or more pieces that fill one bubble until the person speaks again.
import { useEffect, useRef, useState } from "react";

function renderInline(text) {   // the model sometimes writes **bold** and *italic* markers, so render them
  const parts = String(text || "").split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

function Dots() {
  const [n, setN] = useState(1);
  useEffect(() => { const t = window.setInterval(() => setN((r) => (r % 3) + 1), 400); return () => window.clearInterval(t); }, []);
  return <span>{".".repeat(n)}</span>;
}

// The messages list as a function of the incoming messages. The assistant's pieces join its open bubble, the person's
// interim text replaces their open bubble, and a final line of the person's leaves a thinking bubble for the reply.
export function chatReducer(ms, m) {
  const last = ms[ms.length - 1];
  const settled = ms.filter((x) => x.status !== "thinking" && !(x.role === "user" && x.status === "speaking"));
  if (m.type === "botMessage") {
    const open = settled[settled.length - 1];
    if (open?.role === "assistant" && open.open) return [...settled.slice(0, -1), { ...open, text: `${open.text} ${m.text}` }];
    return [...settled, { role: "assistant", text: m.text, status: "sent", open: true }];
  }
  if (m.type === "userMessage") {
    const closed = settled.map((x) => (x.open ? { ...x, open: false } : x));
    if (m.final === false) return [...closed, { role: "user", text: m.text, status: "speaking" }];
    return [...closed, { role: "user", text: m.text, status: "sent" }, { role: "assistant", text: "", status: "thinking" }];
  }
  if (m.type === "start") return last ? ms : [{ role: "assistant", text: "", status: "thinking" }];
  return ms;
}

export function FlowChat({ messages, typing, heading, onSend }) {
  const [draft, setDraft] = useState("");
  const listRef = useRef(null);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages]);
  const send = () => { const text = draft.trim(); if (!text) return; onSend(text); setDraft(""); };
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="chat">
      <div className="px-4 py-2 text-xs font-bold tracking-wide muted">{heading}</div>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2">
        {messages.map((m, i) => {
          const user = m.role === "user";
          const speaking = m.status === "speaking";
          return (
            <div key={i} className={`flex ${user ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[78%]" data-testid="chat-message" data-role={m.role} data-status={m.status}>
                <div className={`mb-0.5 text-[11px] font-bold tracking-wide ${user ? "text-right" : ""} muted`}>{user ? "you" : "assistant"}</div>
                <div className="rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words"
                  style={{
                    background: speaking ? "transparent" : user ? "rgba(17,94,89,.45)" : "var(--raised)",
                    border: speaking ? "1px dashed var(--line)" : "1px solid var(--line)",
                    opacity: speaking ? 0.65 : 1, minWidth: m.status === "thinking" ? 40 : undefined,
                    transition: "opacity 200ms ease, background 200ms ease, border 200ms ease",
                  }}>
                  {m.status === "thinking" ? <Dots /> : renderInline(m.text)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {typing && <div className="flex gap-2 border-t p-2" style={{ borderColor: "var(--raised)" }}>
        <input className="field" value={draft} autoFocus data-testid="chat-input" onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="type a message and press Enter…" />
        <button type="button" className="action-btn action-btn--solid action-btn--sm is-green" onClick={send} disabled={!draft.trim()} data-testid="chat-send">send</button>
      </div>}
    </div>
  );
}
