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
// When the design route names a multimodal element, the testing link view loads the Plasma animation, VRM character or
// Rive character from its ``index.html`` in IL's examples folder into the frame above the chat, once the design loads.
//
// The chat keeps the one connection to the conversation. IL's ConnectConversation.js, which those three files use,
// first looks for window.SideBySideConversation in the parent window and, finding that object, joins through it
// instead of connecting separately. The testing link view defines window.SideBySideConversation. IL starts each
// animation or character only from a Start button inside the frame, so the testing link view hides that button and
// clicks it during the tester's voice start. Afterwards the chat's Conversation hands every call to
// MultimodalElementForwarder, which relays each one into the frame, so the animation or character follows the
// assistant's voice without any change to IL's files.
//
// A link offers text, voice or both. With voice offered, testers see the animation or character before starting. A
// voice start, hands-free or hold-to-talk, keeps the frame and sets the animation or character moving. A text start
// removes the frame, since nothing would drive the animation or character. For a text-only link, the design route
// returns no name.
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
import "./styles.css";
import { useStore } from "./store";
import { api } from "./api";
import { Conversation } from "./Conversation";
import { FindingsList, startCheck } from "./StartCheck";
import { VoiceStartDialog } from "./Dialogs";
import { MULTIMODAL_ELEMENT_HEIGHTS, hideExamplePageExtras, multimodalElementPage } from "./multimodalElementFrame";

const ConversationDesignPublicLinkToken = location.pathname.split("/").filter(Boolean).pop() || "";

// The handler inside the frame, set when IL's ConnectConversation.js there connects through
// window.SideBySideConversation. Connect returns a sendText and a talk that do nothing, because testers type and talk
// in the chat, which holds the real connection, and the Plasma, VRM and Rive files have no input box or talk button.
// Calling close forgets the handler.
let exampleOn = null;
window.SideBySideConversation = {
  Connect(on) {
    exampleOn = on;
    return { sendText: () => {}, talk: () => {}, close: () => { exampleOn = null; } };
  },
};
const toExample = (name, ...args) => { try { exampleOn?.(name, ...args); } catch (e) { console.warn(name, e); } };
// An extra view for the chat's Conversation. MultimodalElementForwarder relays every call into the frame, under the name
// IL's mount scripts use for that call, and does nothing until the frame has joined.
const MultimodalElementForwarder = {
  userMessage: (text, final) => toExample("onUserText", text, final),
  botMessage: (text) => toExample("onBotText", text),
  phase: (p) => toExample("onPhase", p),
  level: (l) => toExample("onLevel", l),
  track: (t) => toExample("onBotTrack", t),
  rtvi: (name, data) => toExample("onRtvi", name, data),
  adapterCallback: (e) => toExample("onAdapterCallback", e),
  botWordSaid: (word) => toExample("onBotWordSaid", word),
};

// Returns the Start button inside the frame, or null when the frame is absent or still loading.
const exampleStart = (frame) => frame?.contentDocument?.getElementById("start") || null;

function TrySidebar({ MultimodalElement, setMultimodalElement, frame, startOnLoad }) {
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
        setMultimodalElement(j.MultimodalElement || "");
        setLoaded(true);
        return api.validate(useStore.getState().toDesign(), "text").then((r) => setAccepted(!!r.ok));
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  // The builder's own Start check runs before the conversation opens. For voice, when the link asks for it, the
  // microphone check comes after it.
  const tryStart = startCheck(toDesign, setChecking, setFindings,
    (way) => (way === "voice" && micCheck ? setVoiceDialog(true) : startWith(way)));
  // A voice start clicks the hidden Start button inside the frame during the tester's own click, because Safari and iOS
  // allow audio only after a user gesture. While the frame is still loading, startOnLoad asks TryApp to click that
  // button once loading finishes. A text start removes the frame.
  const startWith = (way) => {
    if (way === "voice" && MultimodalElement) {
      const button = exampleStart(frame.current);
      if (button) { if (!button.disabled) { button.click(); button.disabled = true; } } else startOnLoad.current = true;
    }
    if (way !== "voice") setMultimodalElement("");
    setMode("conversation", way);
  };

  if (mode === "conversation") {
    return (
      <aside className="flex w-[26rem] shrink-0 select-none flex-col overflow-y-auto border-x" style={{ borderColor: "var(--raised)" }} data-testid="sidebar">
        <Conversation ConversationDesignPublicLinkToken={ConversationDesignPublicLinkToken} MultimodalElement={MultimodalElement ? MultimodalElementForwarder : null} />
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
  const [MultimodalElement, setMultimodalElement] = useState("");
  const frame = useRef(null);
  // True when the tester started with voice before the frame finished loading. TryApp then clicks the Start button on
  // load, outside any user gesture, so Safari and iOS may keep the frame's audio analysis silent.
  const startOnLoad = useRef(false);
  const onFrameLoad = () => {
    hideExamplePageExtras(frame.current);
    const button = startOnLoad.current ? exampleStart(frame.current) : null;
    if (button && !button.disabled) { button.click(); button.disabled = true; }
    startOnLoad.current = false;
  };
  return (
    <>
      <div className={`flex h-full flex-col items-center mode-${mode} phase-${phase || "idle"}`} data-mode={mode} data-phase={phase}>
        {MultimodalElement && (
          <iframe ref={frame} src={multimodalElementPage(MultimodalElement)} title="Animation or character that moves while the assistant speaks"
            onLoad={onFrameLoad} className="w-[26rem] shrink-0 border-0" style={{ height: MULTIMODAL_ELEMENT_HEIGHTS[MultimodalElement] || "18rem" }}
            data-testid="try-multimodal-element" />
        )}
        <div className="flex min-h-0 flex-1">
          <TrySidebar MultimodalElement={MultimodalElement} setMultimodalElement={setMultimodalElement} frame={frame} startOnLoad={startOnLoad} />
        </div>
      </div>
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><TryApp /></React.StrictMode>);
