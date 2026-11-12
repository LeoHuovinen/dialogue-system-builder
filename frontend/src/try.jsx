// The page of one testing link, /try/<ConversationDesignPublicLinkToken>, where a tester talks to the saved conversation behind the link. The
// dialogue system builder is made to run with Illocutionary Lifecycles (IL), which it cannot run without, and in it a
// person draws a conversation as steps and lines on a canvas, compiles it to the flow IL runs, and talks to it
// through IL's mounts, and this page is the editor's own sidebar without the canvas, with the same Start check and
// the same Conversation component. The design is fetched from /api/share/<ConversationDesignPublicLinkToken>/design only to check it and to
// name the steps, and the conversation itself runs the server's stored copy, because Conversation reserves the
// session with the ConversationDesignPublicLinkToken and never sends a design. The page shows a button to start by text, by voice
// in the design's TTS voice, or both, following the link's settings, which the design route returns as ``text`` and
// ``voice``. Starting by voice opens the editor's microphone check first only when ``micCheck`` is true.
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
import "./styles.css";
import { useStore } from "./store";
import { api } from "./api";
import { Conversation } from "./Conversation";
import { FindingsList, startCheck } from "./StartCheck";
import { VoiceStartDialog } from "./Dialogs";

const ConversationDesignPublicLinkToken = location.pathname.split("/").filter(Boolean).pop() || "";

function TrySidebar() {
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
        setLoaded(true);
        return api.validate(useStore.getState().toDesign(), "text").then((r) => setAccepted(!!r.ok));
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  // The builder's own Start check runs before the conversation opens. For voice, when the link asks for it, the
  // microphone check comes after it.
  const tryStart = startCheck(toDesign, setChecking, setFindings,
    (way) => (way === "voice" && micCheck ? setVoiceDialog(true) : setMode("conversation", way)));

  if (mode === "conversation") {
    return (
      <aside className="flex w-[26rem] shrink-0 select-none flex-col overflow-y-auto border-x" style={{ borderColor: "var(--raised)" }} data-testid="sidebar">
        <Conversation ConversationDesignPublicLinkToken={ConversationDesignPublicLinkToken} />
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
      {voiceDialog && <VoiceStartDialog onCancel={() => setVoiceDialog(false)} onStart={() => { setVoiceDialog(false); setMode("conversation", "voice"); }} />}
    </aside>
  );
}

function TryApp() {
  const mode = useStore((s) => s.mode);
  const phase = useStore((s) => s.live.phase);
  return (
    <>
      <div className={`flex h-full justify-center mode-${mode} phase-${phase || "idle"}`} data-mode={mode} data-phase={phase}>
        <TrySidebar />
      </div>
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><TryApp /></React.StrictMode>);
