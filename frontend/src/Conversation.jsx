// The conversation in the sidebar, for the designer's own Start in the editor and for a tester on a testing link's
// page. The dialogue system builder is made to run with Illocutionary Lifecycles (IL), which it cannot run without, and in
// it a person draws a conversation as steps and lines on a canvas, compiles it to the flow IL runs, and talks to
// it through IL's mounts, and this component is the one place a page of the builder talks. The component first reserves the
// session at the builder's /api/sessions, with the canvas's design or, on a testing link's page, the link's ConversationDesignPublicLinkToken,
// and gets a session id and the indexes of the End steps. The component then connects through IL's own
// ConnectConversation.js, served by the builder at /il/. A text conversation connects to the text mount at
// /ws?session_id=..., and a hands-free voice conversation to the Pipecat voice mount with the session id in the offer's
// request data. A design whose Talking is "hold" connects to the press-to-speak mount at /press?session_id=..., and the
// person holds a button while talking. IL's script sets that button's label and disables it while the assistant speaks.
// The Space key works as the button too, and on a touch screen one tap starts listening and the next tap sends. Everything shown arrives as one view of that
// connection. The view's adapterCallback(e) moves the lit node on each
// ConversationStateChangedAdapterCallbackHandlerEvent and adds an answer on each
// QuestionAnsweredAdapterCallbackHandlerEvent, userMessage and botMessage fill the chat through chatReducer from
// chat/FlowChat.jsx, and phase follows listening, thinking and speaking on WebRTC voice. Imported by App.jsx and
// try.jsx, and it imports nothing of Pipecat, which IL's voice script loads itself.
import { useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { useStore } from "./store";
import { advancePatch, speakingPatch } from "./flow/live";
import { FlowChat, chatReducer } from "./chat/FlowChat";

const STATE_CHANGED = "ConversationStateChangedAdapterCallbackHandlerEvent";
const QUESTION_ANSWERED = "QuestionAnsweredAdapterCallbackHandlerEvent";

// The question texts of the conversation state at index, in the order the compiler gives them to IL.
function questionsOf(state, index) {
  const id = state.orderedStateIds()[index];
  const node = state.nodes.find((n) => n.id === id);
  return (node?.data?.questions || []).map((q) => (typeof q === "string" ? q : q?.text || ""));
}

export function Conversation({ ConversationDesignPublicLinkToken = null }) {
  const toDesign = useStore((s) => s.toDesign);
  const setMode = useStore((s) => s.setMode);
  const setLive = useStore((s) => s.setLive);
  const startMode = useStore((s) => s.startMode);   // "voice" opens the microphone, "text" types only
  const voice = useStore((s) => s.voice);
  const talking = useStore((s) => s.talking);
  const style = useStore((s) => s.style);
  const live = useStore((s) => s.live);
  const [phase, setPhase] = useState("connecting");  // connecting | live | ended | error
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [messages, dispatch] = useReducer(chatReducer, []);
  const connection = useRef(null);
  const botTrack = useRef(null);
  const way = startMode === "voice" ? (talking === "hold" ? "press" : "voice") : "text";
  const holdButton = useRef(null);
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  useEffect(() => {
    let closed = false;
    (async () => {
      try {
        const r = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ConversationDesignPublicLinkToken ? { way, ConversationDesignPublicLinkToken } : { way, design: toDesign() }) });
        const reserved = await r.json().catch(() => ({}));
        if (!r.ok) {
          (reserved.findings || []).forEach((f) => (f.level === "error" ? toast.error(f.text) : toast.warning(f.text)));
          if (reserved.refusal) toast.error(`The engine refused the design: ${reserved.refusal}`);
          throw new Error(reserved.error || "Fix the design before talking to it.");
        }
        const endings = (reserved.endings || []).map(String);
        setLive({ index: null, pending: null, done: false, answers: [], path: { nodes: [], edges: [] }, crossing: null, phase: "idle" });
        const state = () => useStore.getState();
        // The text way has no phase, so the node lights as soon as the reply arrives; on the voice way it lights
        // when the reply starts to be spoken.
        const lightNode = () => setLive(speakingPatch(state()));
        const view = {
          start: () => { dispatch({ type: "start" }); setLive(advancePatch(state(), { step_index: 0, previous_index: null, done: endings.includes("0") })); },
          // When nothing was heard during a hold, the server sends an empty final line. It is not a turn, so it is not shown.
          userMessage: (text, final) => { if (String(text || "").trim()) dispatch({ type: "userMessage", text, final }); },
          botMessage: (text) => { dispatch({ type: "botMessage", text }); if (way === "text") lightNode(); },
          phase: (p) => {
            if (p === "closed") { setPhase((x) => (x === "live" ? "ended" : x)); setLive({ phase: "idle" }); return; }
            // Pipecat can report the user's turn as stopped a few milliseconds after the reply has started to be spoken,
            // and IL's script makes that "thinking", so a "thinking" that arrives while the reply is spoken is left out.
            if (p === "thinking" && state().live.phase === "speaking") return;
            if (p === "speaking") lightNode(); else setLive({ phase: p });
            if (p === "listening" && state().live.done) connection.current?.close();   // End has been said, so nothing more is taken in
          },
          track: (t) => { botTrack.current = t; },
          adapterCallback: (e) => {
            if (e?.type === STATE_CHANGED) {
              setLive(advancePatch(state(), { step_index: e.conversation_state, previous_index: e.previous_conversation_state,
                done: endings.includes(String(e.conversation_state)) }));
              if (way === "text") lightNode();
            } else if (e?.type === QUESTION_ANSWERED) {
              const index = state().live.index ?? 0;
              const ordinal = Number(String(e.AnalyzerInstance || "").split("::")[1] || 0);
              const answer = { step_index: index, ordinal, question: questionsOf(state(), index)[ordinal] || "", answer: e.answer || "", choice: e.choice || "" };
              const rest = (state().live.answers || []).filter((a) => !(a.step_index === index && a.ordinal === ordinal));
              setLive({ answers: [...rest, answer] });
            }
          },
        };
        const { ConnectConversation } = await import(/* @vite-ignore */ `${location.origin}/il/ConnectConversation.js`);
        if (closed) return;
        const sid = encodeURIComponent(reserved.session_id);
        connection.current = await ConnectConversation(way === "voice"
          ? { way, requestData: { session_id: reserved.session_id }, views: [view] }
          : way === "press"
            ? { way, path: `/press?session_id=${sid}`, views: [view], ...(touch ? { clickTalk: holdButton.current } : { talk: holdButton.current }) }
            : { way, path: `/ws?session_id=${sid}`, views: [view] });
        setPhase("live");
      } catch (e) { setError(String(e.message || e)); setPhase("error"); }
    })();
    return () => { closed = true; try { connection.current?.close(); } catch {} };
  }, []);

  // Holding the Space key, while the focus is not in a text field, presses the hold-to-talk button. It sends the button
  // mouse events, because IL's script listens for those on the button and tracks whether it is held.
  useEffect(() => {
    if (way !== "press" || touch) return undefined;
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
    const down = (e) => { if (e.code !== "Space" || e.repeat || typing(e)) return; e.preventDefault(); holdButton.current?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); };
    const up = (e) => { if (e.code !== "Space" || typing(e)) return; e.preventDefault(); holdButton.current?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [way, touch]);
  // Mute TTS silences the assistant's audio track; the reply is still said, so the turns keep their timing.
  useEffect(() => { if (botTrack.current) botTrack.current.enabled = !muted; }, [muted]);
  const backToEdit = () => { try { connection.current?.close(); } catch {} setMode("edit"); };
  const userTurns = messages.filter((m) => m.role === "user" && m.status === "sent").length;

  return (
    <section className="relative flex min-h-0 flex-1 flex-col" data-testid="conversation" data-phase={phase} data-way={way}>
      <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--raised)" }}>
        {!ConversationDesignPublicLinkToken && <button type="button" className="action-btn action-btn--ghost action-btn--sm" onClick={backToEdit} data-testid="back">Back to edit</button>}
        <div className="font-medium">Conversation</div>
        <div className="flex-1" />
        {phase === "connecting" && <span className="connecting-label" data-testid="connecting"><span className="spinner" />Connecting…</span>}
        {phase === "live" && way !== "text" && (
          <button type="button" className={`action-btn action-btn--sm ${muted ? "action-btn--solid" : "action-btn--ghost"}`} onClick={() => setMuted((m) => !m)} data-testid="mute" data-muted={String(muted)}>
            {muted ? "Unmute TTS" : "Mute TTS"}
          </button>
        )}
      </div>
      {!ConversationDesignPublicLinkToken && (
        <div className="border-b px-4 py-2 text-xs" style={{ background: "rgb(48,48,48)", borderColor: "var(--line)" }} data-testid="voice-readonly">
          <div><span className="muted">Voice </span>{voice || <span className="muted italic">none</span>}</div>
          <div><span className="muted">System prompt </span>{style || <span className="muted italic">none</span>}</div>
        </div>
      )}
      {error && <div className="mx-4 mt-3 rounded-lg border border-red-500/40 p-2 text-xs text-red-300" data-testid="conversation-error">{error}</div>}
      {(live.answers || []).length > 0 && (
        <details className="px-4 py-2" data-testid="answers">
          <summary className="cursor-pointer text-xs font-bold tracking-wide muted">Answers ({live.answers.length})</summary>
          <ul className="mt-1 space-y-1 text-sm">
            {live.answers.map((a) => (
              <li key={`${a.step_index}-${a.ordinal}`} data-testid="answer">
                {a.question && <div className="text-xs muted">{a.question}</div>}
                {a.choice ? <div className="font-medium" style={{ color: "rgb(120,230,190)" }}>{a.choice}</div>
                  : <div style={{ color: "rgba(253,253,253,.85)" }}>{a.answer}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm" data-testid="progress">
        <div><span className="muted">Step </span><span data-testid="step">{live.index == null ? "—" : `${live.index + 1}`}</span></div>
        <div><span className="muted">Turns </span>{userTurns}</div>
        {live.done && <span className="rounded-full bg-teal-900/40 px-2 py-0.5 text-xs" data-testid="done">Conversation finished</span>}
        {phase === "ended" && <span className="text-xs muted" data-testid="ended">ended</span>}
      </div>
      {way === "press" && (
        <div className="px-4 pb-2" data-testid="hold-to-talk">
          {/* IL's ConnectConversation writes this button's label ("Loading…", "Hold to speak", "Release to send") and greys it. */}
          <button type="button" ref={holdButton} className="action-btn action-btn--solid start--accepted w-full select-none py-4 text-base disabled:opacity-40"
            style={{ touchAction: "none" }} data-testid="hold-button">Loading…</button>
          <div className="mt-1 text-center text-xs muted" data-testid="hold-hint">
            {live.phase === "thinking" ? "Thinking…" : live.phase === "speaking" ? "Speaking…" : touch ? "Tap to start talking, tap again to send" : "or hold the Space bar"}
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <FlowChat messages={messages} heading={way === "voice" ? "CHAT: speak or type" : way === "press" ? "CHAT: hold to talk or type" : "CHAT: type"}
          typing={phase === "live" && !live.done} onSend={(text) => connection.current?.sendText(text)} />
      </div>
      {live.done && (
        <div className="border-t px-4 py-3 text-sm" style={{ borderColor: "var(--raised)", color: "rgb(120,230,190)" }} data-testid="ended-note">
          Conversation ended successfully!
        </div>
      )}
    </section>
  );
}
