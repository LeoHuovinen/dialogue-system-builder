// The testing links of the saved conversations in the editor's sidebar, and the box of the testers' conversations
// shown in the sidebar's popup and on the results page. Designs live in this browser's localStorage and there are no
// accounts. Whoever has the link can try the conversation as text, through IL's text mount like any Start, and see what
// was said. Save posts the design to the builder's /api/share, which keeps it behind the link and answers with the link's
// ConversationDesignAPIKey, kept in the entry as ConversationDesignAPIKey. A later Save of the same design sends it in
// X-Conversation-Design-API-Key, since the server refuses to change a link without it. A saved design someone has tried
// cannot be deleted here. The localStorage key
// "course-builder.saved-conversations" is shared with Sidebar.jsx, and the run counts refresh every 15 seconds while the
// page is open. Imported by Sidebar.jsx and results.jsx, and dialogue_system_builder/share.py explains the links on the server.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "./store";
import { api } from "./api";
import { MULTIMODAL_ELEMENT_BACKGROUND, hideExamplePageExtras, multimodalElementPage } from "./multimodalElementFrame";

const SAVED_KEY = "course-builder.saved-conversations";
const writeSaved = (list) => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch {} };
const updateSaved = (id, patch) => {
  const { saved, setSaved } = useStore.getState();
  const next = saved.map((c) => (c.id === id ? { ...c, ...patch } : c));
  writeSaved(next);
  setSaved(next);
};
// Save makes the testing link. The first save of a conversation creates it, and later saves update the design behind
// the same link, where the runs already made stay listed. The entry's ConversationDesignAPIKey goes along in
// X-Conversation-Design-API-Key, and the server's reply refreshes it. ``extra`` may set the link's ``text``, ``voice``
// and ``micCheck`` to true or false, and ``MultimodalElement`` to the name of the multimodal element shown above the
// chat or an empty string. The server's answer is kept in the entry as shareText, shareVoice, shareMicCheck and
// shareMultimodalElement, and a setting not in ``extra`` stays as the link had it.
export async function shareSaved(id, extra = {}) {
  const entry = useStore.getState().saved.find((c) => c.id === id);
  if (!entry) return;
  try {
    const headers = { "Content-Type": "application/json" };
    if (entry.ConversationDesignAPIKey) headers["X-Conversation-Design-API-Key"] = entry.ConversationDesignAPIKey;
    const r = await fetch("/api/share", { method: "POST", headers,
      body: JSON.stringify({ design: entry.design, label: entry.label, ConversationDesignPublicLinkToken: entry.shareToken || undefined, ...extra }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ConversationDesignPublicLinkToken) {
      updateSaved(id, { shareToken: j.ConversationDesignPublicLinkToken, shareUrl: j.url, ConversationDesignAPIKey: j.ConversationDesignAPIKey,
        shareText: j.text !== false, shareVoice: !!j.voice, shareMicCheck: !!j.micCheck, shareMultimodalElement: j.MultimodalElement || "" });
    }
  } catch {}
}
const fetchRuns = async (ConversationDesignPublicLinkToken) => {
  const r = await fetch(`/api/share/${ConversationDesignPublicLinkToken}/runs`);
  if (!r.ok) throw new Error(r.status === 404 ? "That testing link does not exist." : `Could not load the runs (${r.status}).`);
  return (await r.json()).runs || [];
};

// How many runs each shared saved conversation has, for "tried ×N" and the undeletable rule. Refreshed while the page is
// open, through the one cheap count route.
export function useRunCounts(saved) {
  const [counts, setCounts] = useState({});
  const links = [...new Set(saved.map((c) => c.shareToken).filter(Boolean))].join(",");
  useEffect(() => {
    if (!links) return undefined;
    let live = true;
    const load = () => fetch(`/api/share/counts?links=${encodeURIComponent(links)}`).then((r) => r.json())
      .then((j) => { if (live) setCounts(j.counts || {}); }).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { live = false; clearInterval(t); };
  }, [links]);
  return counts;
}

// One run's words, in the Chat panel's own bubble markup.
function Transcript({ turns }) {
  return (
    <div className="mt-2 flex flex-col gap-2" data-testid="run-transcript">
      {turns.map((t, i) => {
        const user = t.role === "user";
        return (
          <div key={i} className={`flex ${user ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[78%]" data-testid="chat-message" data-role={user ? "user" : "assistant"}>
              <div className={`mb-0.5 text-[11px] font-bold tracking-wide ${user ? "text-right" : ""} muted`}>{user ? "tester" : "assistant"}</div>
              <div className="rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words"
                style={{ background: user ? "rgba(17,94,89,.45)" : "var(--raised)", border: "1px solid var(--line)" }}>
                {t.text}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// The testers' conversations, styled like the "?" help dialog, with a left bar of one entry per run, its
// day and whether it reached End, and the chosen conversation on the right, scrollable. The same box is
// the builder's popup and the results page (/results/<ConversationDesignPublicLinkToken>), so the two are identical.
const dayOf = (t) => (t ? new Date(t * 1000).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "");
export function RunsBox({ ConversationDesignPublicLinkToken, label, boxRef }) {
  const [runs, setRuns] = useState(null);
  const [pick, setPick] = useState(0);
  useEffect(() => { fetchRuns(ConversationDesignPublicLinkToken).then(setRuns).catch(() => setRuns([])); }, [ConversationDesignPublicLinkToken]);
  const run = runs && runs[pick];
  return (
      <div ref={boxRef} className="flex flex-col gap-4 border p-5" style={{ width: 800, maxWidth: "calc(100% - 2rem)", background: "var(--dialog)", borderColor: "var(--line)" }} data-testid="runs-box">
        <div className="truncate text-base font-medium">Tried by others: {label}</div>
        <div className="flex min-h-0 gap-4" style={{ height: "60vh" }}>
          <div className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r pr-3" style={{ borderColor: "var(--line)" }} data-testid="runs-list">
            {runs === null && <div className="text-xs muted">Loading…</div>}
            {runs && runs.map((r, i) => (
              <button type="button" key={r.session} onClick={() => setPick(i)} data-testid="runs-item" data-picked={i === pick}
                className="rounded-lg border px-2 py-1.5 text-left text-xs transition hover:border-teal-600"
                style={{ borderColor: i === pick ? "rgb(13,148,136)" : "var(--line)", background: i === pick ? "rgba(17,94,89,.35)" : "rgb(31,31,31)" }}>
                <div className="font-medium">{dayOf(r.started)}</div>
                <div className={r.ended ? "text-teal-600" : "muted"} data-testid="runs-status">{r.ended ? "complete" : "not complete"}</div>
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto pr-1" data-testid="runs-conversation">
            {run && <Transcript turns={run.turns} />}
          </div>
        </div>
      </div>
  );
}

// The builder's popup, the box above over the canvas area, closed by a click outside it.
function RunsDialog({ ConversationDesignPublicLinkToken, label, onClose }) {
  const boxRef = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-y-0 left-0 z-50 flex items-center justify-center" style={{ right: "26rem", background: "var(--scrim)" }} data-testid="runs-dialog">
      <RunsBox ConversationDesignPublicLinkToken={ConversationDesignPublicLinkToken} label={label} boxRef={boxRef} />
    </div>,
    document.body,
  );
}

// The popup behind the API button. The saved design answers OpenAI-format requests at this server's "/v1" with its
// ConversationDesignAPIKey as the bearer, as dialogue_system_builder/mounts.py explains, so the popup shows OpenAI's own
// quickstart for the chosen language with this address and this key filled in, one box and one Copy at a time. The box
// is the text that is copied, so what is pasted is what was read.
const API_TEXT = "Your conversation is an API now. Pick what you are building, press Copy, paste it, and it runs. Only your newest "
  + "message is read, the conversation itself is kept here. Send END to start over, HELP for the rules. One key is one "
  + "conversation at a time.";
const apiSnippets = (base, key) => ({
  "Python": `from openai import OpenAI\nclient = OpenAI(base_url="${base}", api_key="${key}")\nresponse = client.responses.create(model="dialogue-system-builder", input="Hello")`,
  "JavaScript": `import OpenAI from "openai";\nconst client = new OpenAI({ baseURL: "${base}", apiKey: "${key}", dangerouslyAllowBrowser: true });\nconst response = await client.responses.create({ model: "dialogue-system-builder", input: "Hello" });`,
  "Unity": `UnityWebRequest www = UnityWebRequest.Post("${base}/responses", "{\\"input\\": \\"Hello\\"}", "application/json");\nwww.SetRequestHeader("Authorization", "Bearer ${key}");\nyield return www.SendWebRequest();\nstring reply = www.downloadHandler.text;`,
  "curl": `curl ${base}/responses \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${key}" \\\n  -d '{"input": "Hello"}'`,
});
function ApiDialog({ c, onClose }) {
  const boxRef = useRef(null);
  const [pick, setPick] = useState("Python");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);
  const base = `${location.origin}/v1`;
  const snippets = apiSnippets(base, c.ConversationDesignAPIKey);
  const copy = () => {
    if (!navigator.clipboard) { window.prompt("Copy this:", snippets[pick]); return; }
    navigator.clipboard.writeText(snippets[pick]); setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  return createPortal(
    <div className="fixed inset-y-0 left-0 z-50 flex items-center justify-center" style={{ right: "26rem", background: "var(--scrim)" }} data-testid="api-dialog">
      <div ref={boxRef} className="flex flex-col gap-4 border p-5" style={{ width: 800, maxWidth: "calc(100% - 2rem)", background: "var(--dialog)", borderColor: "var(--line)" }}>
        <div className="truncate text-base font-medium">Use as an API: {c.label}</div>
        <div className="text-xs muted">{API_TEXT}</div>
        <div className="flex flex-col gap-1 text-xs" data-testid="api-values">
          <div className="flex gap-2"><span className="w-16 shrink-0 muted select-none">Base URL</span><span className="font-mono">{base}</span></div>
          <div className="flex gap-2"><span className="w-16 shrink-0 muted select-none">API key</span><span className="font-mono">{c.ConversationDesignAPIKey}</span></div>
        </div>
        <div className="flex gap-1">
          {Object.keys(snippets).map((name) => (
            <button type="button" key={name} onClick={() => setPick(name)} data-testid="api-pick" data-picked={name === pick}
              className="rounded-lg border px-2 py-1.5 text-xs transition hover:border-teal-600"
              style={{ borderColor: name === pick ? "rgb(13,148,136)" : "var(--line)", background: name === pick ? "rgba(17,94,89,.35)" : "rgb(31,31,31)" }}>
              {name}
            </button>
          ))}
        </div>
        <div className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--line)", background: "rgb(31,31,31)", paddingBottom: "calc(0.375rem + 1rem)" }}>
            {Object.entries(snippets).map(([name, text]) => (
              <pre key={name} className="font-mono text-xs" data-testid={name === pick ? "api-snippet" : undefined}
                style={{ gridArea: "1 / 1", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", visibility: name === pick ? "visible" : "hidden" }}>{text}</pre>
            ))}
          </div>
          <button type="button" className="btn btn-teal shrink-0 px-2 py-0 text-xs self-stretch" onClick={copy} data-testid="api-copy">{copied ? "Copied" : "Copy"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// The tiles offered for the multimodal element above the chat. Each tile runs the Plasma animation, VRM character or
// Rive character itself, scaled down and disconnected from any conversation. "None" is always offered. Another tile
// appears when /api/capabilities lists its name, or when the link stores that name although this server cannot serve
// the file. Such a tile shows as chosen, cannot be picked, and carries "(not on this server)", since testers then see
// nothing above the chat.
const MULTIMODAL_ELEMENT_OPTIONS = [
  { name: "", label: "None" },
  { name: "plasma", label: "Plasma" },
  { name: "vrm", label: "3D character" },
  { name: "rive", label: "2D character" },
];

// The testing link popup, which a saved conversation's Copy link opens when that conversation is open on the canvas. It
// shows the link and its own Copy link button, which first saves the canvas into the link the way Save does, so testers
// get what is on the canvas. A design that cannot run as text is not copied, and the Start check's findings show
// instead. Below the link, a box shows how many testers have tried it, from the row's count that refreshes every 15
// seconds, with a button that opens their conversations and a link to the results page. With no testers yet it says "No
// one has tried it yet." Then come checkboxes for how testers may talk, Text, Voice spoken in the design's TTS voice,
// and beneath Voice whether their microphone is checked first. Below those, a row of tiles lets the author choose the
// animation or character above the chat, as MULTIMODAL_ELEMENT_OPTIONS describes. Picking requires Voice ticked, since
// every choice moves only with the assistant's voice, and with Voice unticked no tile shows as chosen. Voice can be ticked
// only when the design has a TTS voice and the server has the kind of voice the design needs. One of Text and Voice
// must stay ticked, so unticking the only ticked one shows a red warning and changes nothing.
function ShareDialog({ c, count, onOpenRuns, onSave, onClose }) {
  const boxRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState([]);
  const [serverVoice, setServerVoice] = useState(true);
  const [warning, setWarning] = useState("");
  const entry = useStore((s) => s.saved.find((x) => x.id === c.id)) || c;
  const [voices, setVoices] = useState([]);
  useEffect(() => { api.voices().then((r) => setVoices(r.voices || [])).catch(() => {}); }, []);
  // The TTS voice and Talking belong to the design, so changing them here changes the canvas the same way Voice settings
  // does and saves it at once, to this browser's saved conversation and to the link.
  const [savingDesign, setSavingDesign] = useState(false);
  const changeDesign = async (name, value) => {
    setSavingDesign(true);
    try { useStore.getState().setDesignField(name, value); await onSave(); } finally { setSavingDesign(false); }
  };
  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);
  const hold = entry.design?.talking === "hold";
  const [serverMultimodalElements, setServerMultimodalElements] = useState([]);
  useEffect(() => { api.capabilities().then((x) => {
    setServerVoice(hold ? x?.press === true : x?.voice !== false);
    setServerMultimodalElements(Array.isArray(x?.MultimodalElements) ? x.MultimodalElements : []);
  }).catch(() => {}); }, [hold]);
  const voiceName = entry.design?.voice || "";
  const canVoice = serverVoice && !!voiceName;
  const voiceHint = !serverVoice ? (hold ? "This server has no hold-to-talk voice." : "This server has no hands-free voice.")
    : !voiceName ? "Choose a voice below first." : "Testers speak and hear the voice below.";
  const copy = async () => {
    setBusy(true);
    setProblems([]);
    try {
      await onSave();
      const fresh = useStore.getState().saved.find((x) => x.id === c.id) || entry;
      const checked = await api.validate(fresh.design, "text");
      if (!checked.ok) {
        const list = [...(checked.findings || [])];
        if (checked.refusal) list.push({ level: "error", text: `The engine refused the design: ${checked.refusal}` });
        setProblems(list.length ? list : [{ level: "error", text: "The design cannot run." }]);
        useStore.getState().setFindings(list);
        return;
      }
      if (!fresh.shareUrl) { setProblems([{ level: "error", text: "The link could not be saved. Try again." }]); return; }
      if (!navigator.clipboard) { window.prompt("Copy this link:", fresh.shareUrl); return; }
      await navigator.clipboard.writeText(fresh.shareUrl).catch(() => window.prompt("Copy this link:", fresh.shareUrl));
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } finally { setBusy(false); }
  };
  const textOn = entry.shareText !== false;
  const voiceOn = canVoice && !!entry.shareVoice;
  const set = (name, on, otherOn) => {
    if (!on && !otherOn) { setWarning("Testers need at least one way to talk. Tick the other one first."); return; }
    setWarning("");
    shareSaved(c.id, { [name]: on });
  };
  return createPortal(
    <div className="fixed inset-y-0 left-0 z-50 flex items-center justify-center" style={{ right: "26rem", background: "var(--scrim)" }} data-testid="share-dialog">
      <div ref={boxRef} className="flex flex-col gap-4 border p-5" style={{ width: 560, maxWidth: "calc(100% - 2rem)", background: "var(--dialog)", borderColor: "var(--line)" }}>
        <div className="truncate text-base font-medium">Testing link: {entry.label}</div>
        <div className="text-xs muted">Anyone with the link can try this conversation. Copy link saves the canvas first, so the link runs what you see.</div>
        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1 truncate rounded-lg border px-2 py-1.5 font-mono text-xs" style={{ borderColor: "var(--line)", background: "rgb(31,31,31)" }}
            data-testid="share-url">{entry.shareUrl || "Saving…"}</div>
          <button type="button" className="btn btn-teal shrink-0 px-3 py-0 text-xs" onClick={copy} disabled={busy} data-testid="share-dialog-copy">
            {busy ? "Saving…" : copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "rgb(31,31,31)" }} data-testid="share-tried">
          {count > 0 ? (
            <>
              <span>Tried by others <strong data-testid="share-tried-count">{count}</strong> {count === 1 ? "time" : "times"}</span>
              <span className="flex-1" />
              <button type="button" className="btn px-2 py-0 text-xs" onClick={onOpenRuns} data-testid="share-tried-open">See their conversations</button>
              {entry.shareToken && <a className="text-xs underline muted hover:text-teal-600" href={`/results/${entry.shareToken}`} target="_blank" rel="noreferrer" data-testid="share-tried-results">Results page</a>}
            </>
          ) : <span className="muted" data-testid="share-tried-none">No one has tried it yet.</span>}
        </div>
        <div className="flex flex-col gap-2" data-testid="share-ways">
          <div className="text-xs muted">Testers can talk by</div>
          <label className="flex cursor-pointer items-start gap-2 text-sm" data-testid="share-text">
            <input type="checkbox" className="mt-1" checked={textOn} onChange={(e) => set("text", e.target.checked, voiceOn)} data-testid="share-text-checkbox" />
            <span>Text<span className="block text-xs muted">Testers type their answers.</span></span>
          </label>
          <label className={`flex items-start gap-2 text-sm ${canVoice ? "cursor-pointer" : "opacity-50"}`} data-testid="share-voice">
            <input type="checkbox" className="mt-1" checked={voiceOn} disabled={!canVoice}
              onChange={(e) => set("voice", e.target.checked, textOn)} data-testid="share-voice-checkbox" />
            <span>Voice<span className="block text-xs muted">{voiceHint}</span></span>
          </label>
          <div className="ml-6 flex flex-col gap-2 text-sm" data-testid="share-voice-settings">
            <label className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs muted">Voice</span>
              <select className="field min-w-0 flex-1 py-1 text-sm" value={voiceName} disabled={savingDesign}
                onChange={(e) => changeDesign("voice", e.target.value)} data-testid="share-voice-select">
                <option value="">Choose a voice</option>
                {voices.map((v) => <option key={v.name} value={v.name}>{v.displayName} ({String(v.gender || "").toLowerCase()}), {v.name}</option>)}
              </select>
            </label>
            <div className="flex items-start gap-2" role="radiogroup" aria-label="Talking">
              <span className="w-16 shrink-0 pt-0.5 text-xs muted">Talking</span>
              <div className="flex flex-col gap-1">
                {[["free", "Just talk, the microphone is always on"], ["hold", "Hold a button while talking"]].map(([value, text]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="share-talking" value={value} checked={(entry.design?.talking === "hold" ? "hold" : "free") === value}
                      disabled={savingDesign} onChange={() => changeDesign("talking", value)} data-testid={`share-talking-${value}`} />
                    {text}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <label className={`ml-6 flex items-start gap-2 text-sm ${voiceOn ? "cursor-pointer" : "opacity-50"}`} data-testid="share-mic">
            <input type="checkbox" className="mt-1" checked={voiceOn && !!entry.shareMicCheck} disabled={!voiceOn}
              onChange={(e) => { setWarning(""); shareSaved(c.id, { micCheck: e.target.checked }); }} data-testid="share-mic-checkbox" />
            <span>Check the microphone before starting<span className="block text-xs muted">Testers say a few words and see the level before the conversation starts.</span></span>
          </label>
          <div className={`ml-6 flex flex-col gap-1 text-sm ${voiceOn ? "" : "opacity-50"}`} data-testid="share-multimodal-element">
            <span>Multimodal element above the chat<span className="block text-xs muted">An animation or character that moves while the assistant speaks.</span></span>
            <div className="flex flex-wrap gap-2">
              {MULTIMODAL_ELEMENT_OPTIONS.filter((o) => !o.name || serverMultimodalElements.includes(o.name) || o.name === (entry.shareMultimodalElement || "")).map((o) => {
                const served = !o.name || serverMultimodalElements.includes(o.name);
                const chosen = voiceOn && (entry.shareMultimodalElement || "") === o.name;
                return (
                  <button key={o.name || "none"} type="button" disabled={!voiceOn || !served} aria-pressed={chosen}
                    onClick={() => { setWarning(""); shareSaved(c.id, { MultimodalElement: o.name }); }}
                    className="flex w-28 flex-col overflow-hidden rounded-lg border text-xs"
                    style={{ borderColor: chosen ? "var(--accent, #22d3ee)" : "var(--line)", borderWidth: chosen ? 2 : 1 }}
                    data-testid={`share-multimodal-element-${o.name || "none"}`}>
                    <div className="relative h-16 w-full overflow-hidden" style={{ background: MULTIMODAL_ELEMENT_BACKGROUND }}>
                      {o.name && served
                        ? <iframe src={multimodalElementPage(o.name)} title={o.label} tabIndex={-1} onLoad={(e) => hideExamplePageExtras(e.currentTarget)}
                            className="pointer-events-none absolute left-0 top-0 border-0"
                            style={{ width: 448, height: 256, transform: "scale(0.25)", transformOrigin: "0 0" }} />
                        : null}
                    </div>
                    <span className="px-2 py-1 text-left">{o.label}{served ? "" : " (not on this server)"}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {warning && <div className="text-xs" style={{ color: "var(--error)" }} data-testid="share-ways-warning">{warning}</div>}
        </div>
        {problems.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs" style={{ color: "var(--error)" }} data-testid="share-problems">
            {problems.map((f, i) => <li key={i}>{f.text}</li>)}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}

// One saved conversation's row, one line of the label, Copy link, API, and, once someone has tried it,
// "tried ×N" in place of delete, which opens the testers' conversations in the popup above.
// Copy link and API belong to the conversation open on the canvas. On the other rows they are greyed out. Clicking one
// there first asks whether to replace the canvas with that conversation, and after it is open shows the testing link
// popup or the API popup.
export function SavedRow({ c, isCurrent, count, onLoad, onSave, onDelete }) {
  const [shareOpen, setShareOpen] = useState(false);
  const openAfterLoad = async (open) => { if (isCurrent || await onLoad()) open(true); };
  const [open, setOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  // Copy link is green only when the saved design passes the builder's text-mode check, the same one the Start buttons
  // use, and API shows only then. Text is the check every link needs, since a link falls back to text when voice
  // cannot run.
  const [textOk, setTextOk] = useState(null);
  useEffect(() => {
    let live = true;
    api.validate(c.design, "text").then((r) => { if (live) setTextOk(!!r.ok); }).catch(() => { if (live) setTextOk(false); });
    return () => { live = false; };
  }, [c.savedAt]);
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border p-2" data-current={isCurrent}
      style={{ borderColor: isCurrent ? "rgb(13,148,136)" : "var(--line)", background: isCurrent ? "rgba(17,94,89,.35)" : "var(--raised)" }}
      data-testid={`saved-${c.id}`}>
      <div className="flex items-center gap-2">
        <button type="button" className="min-w-0 flex-1 truncate text-left text-sm transition hover:text-teal-600" onClick={onLoad} title={c.label}>{c.label}</button>
        {c.shareUrl && (
          <button type="button" className={`btn shrink-0 px-2 py-0 text-xs ${isCurrent && textOk ? "btn-teal" : "opacity-40"}`}
            data-testid="share-copy" data-url={c.shareUrl} data-current={String(isCurrent)} data-available={textOk === null ? "unknown" : String(textOk)}
            title={isCurrent ? c.shareUrl : "Opens this conversation, then its testing link"}
            onClick={() => openAfterLoad(setShareOpen)}>
            Copy link
          </button>
        )}
        {c.shareUrl && c.ConversationDesignAPIKey && textOk && (
          <button type="button" className={`btn btn-other shrink-0 px-2 py-0 text-xs ${isCurrent ? "" : "opacity-40"}`} onClick={() => openAfterLoad(setApiOpen)} data-testid="api-open"
            title={isCurrent ? "OpenAI-format requests with this design's key run this design" : "Opens this conversation, then its API"}>API</button>
        )}
        {count > 0
          ? <button type="button" className="btn shrink-0 px-2 py-0 text-xs" onClick={() => setOpen(!open)}
              title="Others have tried this through its link, so it cannot be deleted" data-testid="saved-locked">tried ×{count}</button>
          : <button type="button" className="btn px-2 py-0 text-xs text-red-400" onClick={onDelete} aria-label="Delete">✕</button>}
      </div>
      {open && <RunsDialog ConversationDesignPublicLinkToken={c.shareToken} label={c.label} onClose={() => setOpen(false)} />}
      {apiOpen && <ApiDialog c={c} onClose={() => setApiOpen(false)} />}
      {shareOpen && <ShareDialog c={c} count={count} onSave={onSave} onClose={() => setShareOpen(false)}
        onOpenRuns={() => { setShareOpen(false); setOpen(true); }} />}
    </div>
  );
}
