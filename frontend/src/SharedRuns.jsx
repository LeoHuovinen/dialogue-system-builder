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

const SAVED_KEY = "course-builder.saved-conversations";
const writeSaved = (list) => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch {} };
const updateSaved = (id, patch) => {
  const { saved, setSaved } = useStore.getState();
  const next = saved.map((c) => (c.id === id ? { ...c, ...patch } : c));
  writeSaved(next);
  setSaved(next);
};
// Save makes the testing link. The first save of a conversation creates it, and later saves update the
// design behind the same link, where the runs already made stay listed. The entry's ConversationDesignAPIKey goes along
// in X-Conversation-Design-API-Key, and the server's reply refreshes it.
export async function shareSaved(id) {
  const entry = useStore.getState().saved.find((c) => c.id === id);
  if (!entry) return;
  try {
    const headers = { "Content-Type": "application/json" };
    if (entry.ConversationDesignAPIKey) headers["X-Conversation-Design-API-Key"] = entry.ConversationDesignAPIKey;
    const r = await fetch("/api/share", { method: "POST", headers,
      body: JSON.stringify({ design: entry.design, label: entry.label, ConversationDesignPublicLinkToken: entry.shareToken || undefined }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ConversationDesignPublicLinkToken) {
      updateSaved(id, { shareToken: j.ConversationDesignPublicLinkToken, shareUrl: j.url, ConversationDesignAPIKey: j.ConversationDesignAPIKey });
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

// One saved conversation's row, one line of the label, Copy link, and, once someone has tried it,
// "tried ×N" in place of delete, which opens the testers' conversations in the popup above.
export function SavedRow({ c, isCurrent, count, onLoad, onDelete }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // The testing link is text only, so it can be copied only when the saved design passes the
  // builder's own text-mode check, the same one the Start buttons use, green when it does and grey when not.
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
          <button type="button" className={`btn shrink-0 px-2 py-0 text-xs ${textOk ? "btn-teal" : "opacity-40"}`} aria-disabled={!textOk}
            data-testid="share-copy" data-url={c.shareUrl} data-available={textOk === null ? "unknown" : String(textOk)}
            title={textOk ? c.shareUrl : "This conversation cannot run as text yet, so its testing link cannot be shared"}
            onClick={async () => {
              if (textOk) {
                // Browsers offer the clipboard only on HTTPS or localhost, so on a plain HTTP server the link is shown to copy by hand.
                if (!navigator.clipboard) { window.prompt("Copy this link:", c.shareUrl); return; }
                navigator.clipboard.writeText(c.shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); return;
              }
              // Grey shows the Start button's own refusal, in text mode, since the link is text only. The same
              // findings list, so the red messages show above Start and the named nodes and edges turn
              // red on the canvas; the canvas is checked when this row is the one loaded.
              const st = useStore.getState();
              try {
                const checked = await api.validate(isCurrent ? st.toDesign() : c.design, "text");
                const list = [...(checked.findings || [])];
                if (checked.refusal) list.push({ level: "error", text: `The engine refused the design: ${checked.refusal}` });
                st.setFindings(checked.ok ? [] : (list.length ? list : [{ level: "error", text: "The design cannot run." }]));
                if (checked.ok) setTextOk(true);
              } catch (e) { st.setFindings([{ level: "error", text: String(e.message || e) }]); }
            }}>
            {copied ? "Copied" : "Copy link"}
          </button>
        )}
        {count > 0
          ? <button type="button" className="btn shrink-0 px-2 py-0 text-xs" onClick={() => setOpen(!open)}
              title="Others have tried this through its link, so it cannot be deleted" data-testid="saved-locked">tried ×{count}</button>
          : <button type="button" className="btn px-2 py-0 text-xs text-red-400" onClick={onDelete} aria-label="Delete">✕</button>}
      </div>
      {open && <RunsDialog ConversationDesignPublicLinkToken={c.shareToken} label={c.label} onClose={() => setOpen(false)} />}
    </div>
  );
}
