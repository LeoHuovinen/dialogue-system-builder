// The page of one testing link, /try/<ConversationDesignPublicLinkToken>, where a tester talks to the saved conversation behind the link. The
// dialogue system builder is made to run with Illocutionary Lifecycles (IL), which it cannot run without, and in it a
// person draws a conversation as steps and lines on a canvas, compiles it to the flow IL runs, and talks to it
// through IL's mounts, and this page is the editor's own sidebar without the canvas, with the same Start check and
// the same Conversation component. The design is fetched from /api/share/<ConversationDesignPublicLinkToken>/design only to check it and to
// name the steps, and the conversation itself runs the server's stored copy, because Conversation reserves the
// session with the ConversationDesignPublicLinkToken and never sends a design. The page shows a button to start by text, by voice
// in the design's TTS voice, or both, following the link's settings, which the design route returns as ``text`` and
// ``voice``. Starting by voice opens the editor's microphone check first only when ``micCheck`` is true.
//
// When the design route returns a ``MultimodalElement`` address, IL's example page at that address is shown above the
// chat, served by the builder from IL's own examples folder. IL's
// ConnectConversation.js, which every example page uses, first looks for window.SideBySideConversation in its parent
// page and, when it finds it, connects through it instead of opening a connection of its own. This page sets that
// object, hides the example page's own Start button, and clicks it once when the tester starts with voice. The chat's
// Conversation then hands every call it gets to the MultimodalElement, which passes each on to the example page under
// the name IL's mount scripts use. The example page needs no change of its own to move with the assistant's voice. When
// a tester starts with text, the example page is removed, since nothing would move it.
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
import "./styles.css";
import { useStore } from "./store";
import { api } from "./api";
import { Conversation } from "./Conversation";
import { FindingsList, startCheck } from "./StartCheck";
import { VoiceStartDialog } from "./Dialogs";

const ConversationDesignPublicLinkToken = location.pathname.split("/").filter(Boolean).pop() || "";

// The example page's own handler, set when its ConnectConversation.js connects through window.SideBySideConversation.
// The connection it gets back sends nothing, since the tester types and talks in the chat, which holds the real
// connection, and the example page only shows what happens in it.
let exampleOn = null;
window.SideBySideConversation = {
  Connect(on) {
    exampleOn = on;
    return { sendText: () => {}, talk: () => {}, close: () => { exampleOn = null; } };
  },
};
const toExample = (name, ...args) => { try { exampleOn?.(name, ...args); } catch (e) { console.warn(name, e); } };
// Each call the chat gets, passed on to the example page under the name IL's mount scripts give it.
const MultimodalElement = {
  userMessage: (text, final) => toExample("onUserText", text, final),
  botMessage: (text) => toExample("onBotText", text),
  phase: (p) => toExample("onPhase", p),
  level: (l) => toExample("onLevel", l),
  track: (t) => toExample("onBotTrack", t),
  rtvi: (name, data) => toExample("onRtvi", name, data),
  adapterCallback: (e) => toExample("onAdapterCallback", e),
  botWordSaid: (word) => toExample("onBotWordSaid", word),
};

// Returns the example page's Start button, or null before the page has loaded. hideStart in TryApp hides it once the
// page loads, since the tester starts from the chat.
const exampleStart = (frame) => frame?.contentDocument?.getElementById("start") || null;

function TrySidebar({ MultimodalElementPage, setMultimodalElementPage, frame }) {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const toDesign = useStore((s) => s.toDesign);
  const title = useStore((s) => s.title);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(null);
  const [checking, setChecking] = useState(false);
  const [findings, setFindings] = useState([]);
  const [voice, setVoice] = useState(false);
  const [text, setText] = useState(true);
  const [micCheck, setMicCheck] = useState(false);
  const [voiceDialog, setVoiceDialog] = useState(false);

  useEffect(() => {
    fetch(`/api/share/${ConversationDesignPublicLinkToken}/design`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("This link does not exist."))))
      .then((j) => {
        useStore.getState().loadDesign(j.design);
        setVoice(!!j.voice);
        setText(j.text !== false);
        setMicCheck(!!j.micCheck);
        setMultimodalElementPage(j.MultimodalElement || "");
        setLoaded(true);
        return api.validate(useStore.getState().toDesign(), "text").then((r) => setAccepted(!!r.ok));
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  // The builder's own Start check runs before the conversation opens. For voice, when the link asks for it, the
  // microphone check comes after it.
  const tryStart = startCheck(toDesign, setChecking, setFindings,
    (way) => (way === "voice" && micCheck ? setVoiceDialog(true) : startWith(way)));
  // A voice start first joins the example page above the chat inside the tester's own click, because Safari and iOS
  // let a page play audio only from a user gesture. A text start removes the example page, since nothing would move it.
  const startWith = (way) => {
    const button = way === "voice" && MultimodalElementPage ? exampleStart(frame.current) : null;
    if (button && !button.disabled) { button.click(); button.disabled = true; }
    if (way !== "voice") setMultimodalElementPage("");
    setMode("conversation", way);
  };

  if (mode === "conversation") {
    return (
      <aside className="flex w-[26rem] shrink-0 select-none flex-col overflow-y-auto border-x" style={{ borderColor: "var(--raised)" }} data-testid="sidebar">
        <Conversation ConversationDesignPublicLinkToken={ConversationDesignPublicLinkToken} MultimodalElement={MultimodalElementPage ? MultimodalElement : null} />
      </aside>
    );
  }
  return (
    <aside className="flex w-[26rem] shrink-0 select-none flex-col border-x" style={{ borderColor: "var(--raised)" }} data-testid="sidebar">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b p-4" style={{ background: "rgb(48,48,48)", borderColor: "var(--line)" }} data-testid="try-header">
          <div className="font-medium">{loaded && title && title !== "Untitled conversation" ? title : "Try this conversation"}</div>
          <div className="mt-1 text-xs muted">Someone designed this conversation and would like you to try it. {voice && text ? "Talk or type" : voice ? "Talk" : "Type"} to it as you would to a real one.</div>
        </div>
        {error && <div className="mx-4 mt-3 rounded-lg border border-red-500/40 p-2 text-xs text-red-300" data-testid="try-error">{error}</div>}
      </div>
      <div className="shrink-0 border-t p-3" style={{ borderColor: "var(--raised)" }} data-testid="start-slot">
        <FindingsList findings={findings} />
        {voice && (
          <button type="button" className={`action-btn action-btn--solid w-full ${text ? "mb-2" : ""} ${accepted ? "start--accepted" : ""}`} onClick={() => tryStart("voice")} disabled={checking || !loaded} data-testid="start-voice">
            {checking ? "Checking…" : "Start with voice"}
          </button>
        )}
        {text && (
          <button type="button" className={`action-btn action-btn--solid w-full ${accepted ? "start--accepted" : ""}`} onClick={() => tryStart("text")} disabled={checking || !loaded} data-testid="start-text"
            data-accepted={accepted === null ? "unknown" : String(accepted)}>
            {checking ? "Checking…" : "Start with text only"}
          </button>
        )}
      </div>
      {voiceDialog && <VoiceStartDialog onCancel={() => setVoiceDialog(false)} onStart={() => { setVoiceDialog(false); startWith("voice"); }} />}
    </aside>
  );
}

function TryApp() {
  const mode = useStore((s) => s.mode);
  const phase = useStore((s) => s.live.phase);
  const [MultimodalElementPage, setMultimodalElementPage] = useState("");
  const frame = useRef(null);
  const hideStart = () => { const button = exampleStart(frame.current); if (button) button.style.display = "none"; };
  return (
    <>
      <div className={`flex h-full flex-col items-center mode-${mode} phase-${phase || "idle"}`} data-mode={mode} data-phase={phase}>
        {MultimodalElementPage && (
          <iframe ref={frame} src={MultimodalElementPage} title="Animation that moves while the assistant speaks" onLoad={hideStart}
            className="h-[18rem] w-[26rem] shrink-0 border-0" data-testid="try-multimodal-element" />
        )}
        <div className="flex min-h-0 flex-1">
          <TrySidebar MultimodalElementPage={MultimodalElementPage} setMultimodalElementPage={setMultimodalElementPage} frame={frame} />
        </div>
      </div>
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><TryApp /></React.StrictMode>);
