// The editor's main menu, the sidebar's nodes panel and the conversation's settings above it. The dialogue system builder is made
// to run with Illocutionary Lifecycles (IL), which it cannot run without, and in it a person draws a conversation as steps
// and lines on a canvas, compiles it to the flow IL runs, and talks to it through IL's mounts, and this file is where a
// design is started, loaded, saved and exported. The shapes add nodes to the canvas, the templates come from
// templates.json, and Describe a conversation asks the server for a whole design. Saved conversations live in this
// browser's localStorage under "course-builder.saved-conversations", a key SharedRuns.jsx shares, each entry id, savedAt,
// label, design, shareToken, shareUrl and ConversationDesignAPIKey, and Save also makes the testing link through SharedRuns.jsx. Download flow writes IL's flow, which a server hands to IL's mounts and which cannot
// be loaded back, and Export design writes the canvas's design, which Import design loads back. Imported by App.jsx, which
// lists the editor's parts.
import { useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { api } from "./api";
import { NodeType, promptSnippet, whenLabel } from "./registry";
import CONVERSATIONS from "./templates.json";
import { SavedRow, shareSaved, useRunCounts } from "./SharedRuns";

// Saved conversations live in this browser's localStorage only, as a list of {id, savedAt, label, design}.
const SAVED_KEY = "course-builder.saved-conversations";
const readSaved = () => { try { const v = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeSaved = (list) => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch {} };

// The shapes of the nodes panel, each an operation on a chosen line, that is on the node before the place and the line
// from it. A shape's `source` adds questions to the node before the place, where a branch's question lives. Its `line`
// changes the rule of the line itself when no new node is added. Its `cells` add new nodes, one column per dx, centred on
// the node before the place. Its `entries` are the lines from that node into the cells, the first being the chosen line
// itself, retargeted, keeping its rule unless data is given. Its `links` are lines between the cells, its `exits` lines
// from cells on to the line's old target, and its `backs` lines from cells back to the node before the place, which
// loop onto it. A choice with questionIndex "new" points at the question the shape adds to the node before.
const empty = () => ({ description: "", questions: [] });
const choice = (i) => ({ when: "choice", questionIndex: 0, optionIndex: i });
const newChoice = (i) => ({ when: "choice", questionIndex: "new", optionIndex: i });
const onward = { when: "exchanges", turns: 1 };
export const SHAPES = [
  { key: "node", title: "One node", description: "One new node after the node before the place; moves on after one user turn.",
    cells: [{ k: "a", dx: 0, data: empty() }], entries: [{ k: "a" }], exits: [{ k: "a", data: onward }] },
  { key: "yes-no", title: "Yes / No branch", description: "The node before the place gets a Yes / No question; each choice leads to its own new node, and both lead on.",
    source: { questions: [{ text: "", options: ["Yes", "No"] }] },
    cells: [{ k: "y", dx: 0, data: empty() }, { k: "n", dx: 0, data: empty() }],
    entries: [{ k: "y", data: newChoice(0) }, { k: "n", data: newChoice(1) }],
    exits: [{ k: "y", data: onward }, { k: "n", data: onward }] },
  { key: "loop", title: "Loop until confirmed", description: "In the node's own column: a node that asks whether what they said is right, Yes / No. Yes moves on; No goes back to the node.",
    place: "column",
    cells: [{ k: "c", dx: 0, data: { description: "Ask whether what they told you is right.", questions: [{ text: "Is that right?", options: ["Yes", "No"] }] } }],
    entries: [{ k: "c" }], exits: [{ k: "c", data: choice(0) }], backs: [{ k: "c", data: choice(1) }] },
  { key: "three-way", title: "Three-way branch", description: "The node before the place gets a question with three choices; each choice leads to its own new node, and all lead on.",
    source: { questions: [{ text: "", options: ["Option 1", "Option 2", "Option 3"] }] },
    cells: [{ k: "a", dx: 0, data: empty() }, { k: "b", dx: 0, data: empty() }, { k: "c", dx: 0, data: empty() }],
    entries: [{ k: "a", data: newChoice(0) }, { k: "b", data: newChoice(1) }, { k: "c", data: newChoice(2) }],
    exits: [{ k: "a", data: onward }, { k: "b", data: onward }, { k: "c", data: onward }] },
];

// The whole conversation's settings, the voice and the system prompt, shown at the top of the sidebar in both views, the
// nodes panel and above a node being edited.
// The region's voice list, fetched once per page and shared by every DesignHeader instance.
let voicesPromise = null;
const loadVoices = () => (voicesPromise ||= api.voices().then((r) => r.voices || []).catch(() => []));

// The saved conversations live in the store so the settings section can save from either view and
// the list under Saved conversations follows. Filled once from this browser's localStorage.
useStore.setState({ saved: readSaved() });
const labelNow = () => {
  const s = useStore.getState();
  const first = s.nodes.find((n) => n.id === s.orderedStateIds()[0]);
  return `${promptSnippet(first, 5)} (${new Date().toLocaleString()})`;
};
// Save overwrites the saved conversation the canvas came from; Save as new always adds one.
const saveCurrent = () => {
  const { saved, currentSavedId, toDesign, setSaved, setCurrentSavedId } = useStore.getState();
  const current = saved.find((c) => c.id === currentSavedId) || null;
  const next = current
    ? saved.map((c) => (c.id === current.id ? { ...c, savedAt: Date.now(), label: labelNow(), design: toDesign() } : c))
    : [{ id: `${Date.now().toString(36)}`, savedAt: Date.now(), label: labelNow(), design: toDesign() }, ...saved];
  writeSaved(next);
  setSaved(next);
  if (!current) setCurrentSavedId(next[0].id);
  useStore.getState().markClean();
  return shareSaved(current ? current.id : next[0].id);   // the testing link, made on the first save and updated after
};
const saveAsNew = () => {
  const { saved, toDesign, setSaved, setCurrentSavedId } = useStore.getState();
  const entry = { id: `${Date.now().toString(36)}`, savedAt: Date.now(), label: labelNow(), design: toDesign() };
  const next = [entry, ...saved];
  writeSaved(next);
  setSaved(next);
  setCurrentSavedId(entry.id);
  useStore.getState().markClean();
  return shareSaved(entry.id);   // a new saved conversation gets its own testing link
};
// Opening a saved conversation, a template, Import design and Describe a conversation all call this before replacing
// the canvas. The confirm popup shows the current canvas and the design ``next`` as thumbnails. When the canvas has
// unsaved changes it also offers Save and open, which saves the canvas the way Save does, and Don't save. Resolves true
// when the canvas may be replaced.
const confirmReplace = async (text, next) => {
  const { askConfirm, isDirty, toDesign } = useStore.getState();
  const dirty = isDirty();
  const answer = await askConfirm(text, { current: toDesign(), next, dirty });
  if (!answer) return false;
  if (answer === "save") await saveCurrent();
  return true;
};
// Download flow writes the canvas as IL's flow, the file a server hands to IL's mounts.
// The server compiles it and saves it through IL's SaveLoadFlowAdapter before sending it.
const saveFile = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};
const downloadFlow = async () => {
  const { toDesign } = useStore.getState();
  try {
    const r = await api.flow(toDesign());
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      const lines = (body.findings || []).map((f) => f.text).concat(body.refusal ? [body.refusal] : []);
      window.alert(lines.length ? lines.join("\n") : "The design cannot be compiled.");
      return;
    }
    const disposition = r.headers.get("content-disposition") || "";
    const starred = disposition.match(/filename\*=utf-8''([^;]+)/i)?.[1];
    const plain = disposition.match(/filename="([^"]+)"/i)?.[1];
    const name = (starred ? decodeURIComponent(starred) : plain) || "flow.json";
    saveFile(await r.blob(), name);
  } catch (e) {
    window.alert(String(e.message || e));
  }
};

// Export design and Import design carry the canvas itself as a file, so a design moves between browsers and machines.
// Download flow above is the compiled file a session starts with, which cannot be loaded back.
const exportDesign = () => {
  const design = useStore.getState().toDesign();
  const name = (String(design.title || "").replace(/[^\w\- ]/g, "").trim() || "design") + ".design.json";
  saveFile(new Blob([JSON.stringify(design, null, 2)], { type: "application/json" }), name);
};
const importDesign = async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    const design = JSON.parse(await file.text());
    if (!Array.isArray(design?.nodes)) {
      window.alert(design?.ConversationStates || design?.PromptBlocks
        ? "This is a flow file (Download flow). Import takes a design file (Export design)."
        : "This file is not a design.");
      return;
    }
    const { setFindings, loadDesign } = useStore.getState();
    if (!(await confirmReplace(`Replace everything on the canvas with “${design.title || file.name}”?`, design))) return;
    setFindings([]);
    loadDesign(design);
  } catch (err) {
    window.alert(`The file could not be read: ${err.message || err}`);
  }
};

export function DesignHeader() {
  const style = useStore((s) => s.style);
  const voice = useStore((s) => s.voice);
  const setDesignField = useStore((s) => s.setDesignField);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  // True while a refused Start asks for a voice and none is chosen yet. The select is then
  // outlined red and the section is held open so the red is seen.
  const needsVoice = useStore((s) => !s.voice && s.findings.some((f) => f.level === "error" && f.code === "choose-voice"));
  const talking = useStore((s) => s.talking);
  const [voices, setVoices] = useState([]);
  useEffect(() => { let live = true; loadVoices().then((v) => { if (live) setVoices(v); }); return () => { live = false; }; }, []);
  // Grouped by locale for the select, as a list of [localeName, voices].
  const groups = useMemo(() => {
    const m = new Map();
    voices.forEach((v) => { if (!m.has(v.localeName)) m.set(v.localeName, []); m.get(v.localeName).push(v); });
    return [...m.entries()];
  }, [voices]);
  return (
    <details open={settingsOpen || needsVoice} onToggle={(e) => setSettingsOpen(e.currentTarget.open)} data-testid="design-header">
      <summary className="cursor-pointer text-sm font-medium">Voice settings</summary>
      <div className="mt-2">
      <label className="mb-1 block text-xs muted" htmlFor="tts-voice">Voice</label>
      <select id="tts-voice" className={needsVoice ? "field mb-1" : "field mb-3"} name="voice" value={voice || ""} onChange={(e) => setDesignField("voice", e.target.value)} data-testid="voice"
        style={needsVoice ? { borderColor: "var(--error)", boxShadow: "0 0 0 2px rgba(248,113,113,.3)" } : undefined}>
        <option value="">Choose a voice</option>
        {groups.map(([localeName, vs]) => (
          <optgroup key={localeName} label={localeName}>
            {vs.map((v) => <option key={v.name} value={v.name}>{v.displayName} ({v.gender.toLowerCase()}), {v.name}</option>)}
          </optgroup>
        ))}
      </select>
      {needsVoice && <div className="mb-2 text-xs italic" style={{ color: "var(--error)" }} data-testid="needs-voice">Please choose a voice</div>}
      <div className="mb-1 text-xs muted" id="talking-label">Talking</div>
      <div className="mb-3 flex flex-col gap-1 text-sm" role="radiogroup" aria-labelledby="talking-label" data-testid="talking">
        {[["free", "Just talk, the microphone is always on"], ["hold", "Hold a button while talking"]].map(([value, text]) => (
          <label key={value} className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="talking" value={value} checked={talking === value} onChange={() => setDesignField("talking", value)} data-testid={`talking-${value}`} />
            {text}
          </label>
        ))}
      </div>
      <label className="mb-1 block text-xs muted" htmlFor="system-prompt">System prompt</label>
      <textarea id="system-prompt" className="field" rows={3} name="style" value={style}
        style={{ maxHeight: "4.6rem", overflowY: "auto", resize: "none" }}
        placeholder="e.g. “Friendly tone. Each utterance is max 10 words.”"
        onChange={(e) => setDesignField("style", e.target.value)} />
      </div>
    </details>
  );
}

export function NodesPanel() {
  const loadDesign = useStore((s) => s.loadDesign);
  const setFindings = useStore((s) => s.setFindings);
  const loadConversation = async (c) => {
    if (!(await confirmReplace(`Replace everything on the canvas with “${c.title}”?`, c.design))) return;
    setFindings([]);
    loadDesign(structuredClone(c.design));
  };
  // Describe a conversation sends the description to the server, which answers with a whole design held to the builder's
  // limits, and the design replaces the canvas after a confirm.
  const [describeText, setDescribeText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [describeError, setDescribeError] = useState("");
  const generateFromDescription = async () => {
    setGenerating(true);
    setDescribeError("");
    try {
      const r = await api.generate(describeText);
      if (!r.ok || !r.design) { setDescribeError(r.error || "the conversation could not be designed"); return; }
      if (!(await confirmReplace("Replace everything on the canvas with the generated conversation?", r.design))) return;
      setFindings([]);
      loadDesign(r.design);
    } catch (e) {
      setDescribeError(String(e.message || e));
    } finally { setGenerating(false); }
  };
  // Saved conversations are the current canvas, kept in this browser.
  const currentSavedId = useStore((s) => s.currentSavedId);
  const setCurrentSavedId = useStore((s) => s.setCurrentSavedId);
  const saved = useStore((s) => s.saved);
  const setSaved = useStore((s) => s.setSaved);
  const current = saved.find((c) => c.id === currentSavedId) || null;
  const runCounts = useRunCounts(saved);   // a shared conversation someone has tried cannot be deleted
  // Resolves true once the saved conversation is on the canvas, so a row's Copy link or API can open it first.
  const loadSaved = async (c) => {
    if (!(await confirmReplace(`Replace everything on the canvas with “${c.label}”?`, c.design))) return false;
    setFindings([]);
    loadDesign(structuredClone(useStore.getState().saved.find((x) => x.id === c.id)?.design || c.design));
    setCurrentSavedId(c.id);
    return true;
  };
  const deleteSaved = (id) => {
    const next = saved.filter((c) => c.id !== id);
    writeSaved(next);
    setSaved(next);
    if (id === currentSavedId) setCurrentSavedId(null);
  };
  const addShape = useStore((s) => s.addShape);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const placementPreview = useStore((s) => s.placementPreview);
  const setGhost = useStore((s) => s.setGhost);

  // Every place is one existing line, listed as "After [X]" only, the node the line leaves, with
  // the line's rule in parentheses when it has one so two lines from the same node stay apart.
  // Hovering one shows the ghost. Start and End never take a shape on themselves.
  const placements = (shape) => {
    const name = (n) => (!n ? "?" : n.type === NodeType.START ? "Start" : n.type === NodeType.END ? "End" : `"${promptSnippet(n)}"`);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const inserts = (shape.cells || []).length && !shape.source && !shape.backs && shape.place !== "column";
    return edges
      .filter((e) => inserts || byId[e.source]?.type === NodeType.STEP)
      .map((e) => ({
        label: `After ${name(byId[e.source])}${e.data?.when ? ` (${whenLabel(e, byId[e.source])})` : ""}`,
        placement: { kind: "between", edgeId: e.id },
      }));
  };


  return (
    <div className="flex flex-col gap-3 pb-4" data-testid="palette">
      {/* The conversation's settings section, on a lighter ground than the rest of the sidebar. */}
      <div className="border-b p-4" style={{ background: "rgb(48,48,48)", borderColor: "var(--line)" }}><DesignHeader /></div>
      <div className="flex flex-col gap-3 px-4">
      <details className="pt-2" data-testid="add-node">
        <summary className="cursor-pointer text-sm font-medium">Add a node</summary>
      <div className="mt-2 text-xs font-medium muted">
        Open a shape, then hover a place to see on the canvas where its nodes would go, and click to add them.
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {SHAPES.map((t) => (
          <details key={t.key} className="rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--raised)" }} data-testid={`template-${t.key}`}>
            <summary className="cursor-pointer p-3">
              <span className="font-medium">{t.title}</span>
              <div className="text-xs muted">{t.description}</div>
            </summary>
            <div className="flex flex-col gap-1 border-t p-2" style={{ borderColor: "var(--line)" }} data-testid="placements">
              {placements(t).map((p, i) => (
                <button type="button" key={i} data-testid="placement"
                  onMouseEnter={() => setGhost(placementPreview(p.placement, t))} onMouseLeave={() => setGhost(null)}
                  onClick={() => { setGhost(null); addShape(t, p.placement); }}
                  className="rounded-lg border px-2 py-1.5 text-left text-xs transition hover:border-teal-600 disabled:opacity-40"
                  style={{ borderColor: "var(--line)", background: "rgb(31,31,31)" }}>
                  {p.label}
                </button>
              ))}
            </div>
          </details>
        ))}
      </div>
      </details>
      <details className="border-t pt-2" style={{ borderColor: "var(--raised)" }} data-testid="describe">
        <summary className="cursor-pointer text-sm font-medium">Describe a conversation</summary>
        <div className="mt-2 flex flex-col gap-2">
          <textarea className="field" rows={4} value={describeText} disabled={generating} data-testid="describe-text"
            placeholder="e.g. “Book a table: how many people, which evening, inside or outside, then confirm.”"
            onChange={(e) => setDescribeText(e.target.value)} />
          <button type="button" className={`btn btn-teal justify-center text-sm${generating ? " is-designing" : ""}`} onClick={generateFromDescription}
            disabled={generating || !describeText.trim()} data-testid="generate">
            {generating
              ? <>Designing<span className="dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></>
              : "Generate the conversation"}
          </button>
          {describeError && <div className="rounded-lg border border-red-500/40 px-2 py-1.5 text-xs text-red-300" data-testid="describe-error">{describeError}</div>}
        </div>
      </details>
      <details className="border-t pt-2" style={{ borderColor: "var(--raised)" }} data-testid="conversation-templates">
        <summary className="cursor-pointer text-sm font-medium">Conversation templates</summary>
        <div className="mt-2 flex flex-col gap-2">
          {CONVERSATIONS.map((c) => (
            <button type="button" key={c.key} data-testid={`conversation-${c.key}`} onClick={() => loadConversation(c)}
              className="rounded-xl border p-3 text-left transition hover:border-teal-600"
              style={{ borderColor: "var(--line)", background: "var(--raised)" }}>
              <span className="font-medium">{c.title}</span>
              <div className="text-xs muted">{c.description}</div>
            </button>
          ))}
        </div>
      </details>
      <details className="border-t pt-2" style={{ borderColor: "var(--raised)" }} data-testid="saved-conversations">
        <summary className="cursor-pointer text-sm font-medium">Saved conversations</summary>
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex gap-2">
            <button type="button" className="btn btn-teal flex-1 justify-center text-sm" onClick={saveCurrent} data-testid="save-conversation">
              {current ? "Save (overwrite)" : "Save the current conversation"}
            </button>
            {current && <button type="button" className="btn text-sm" onClick={saveAsNew} data-testid="save-as-new">Save as new</button>}
          </div>
          <button type="button" className="btn text-sm justify-center" onClick={downloadFlow} data-testid="download-flow"
            title="The conversation as a flow file, which IL runs as it is on any of its mounts">
            Download flow
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn flex-1 justify-center text-sm" onClick={exportDesign} data-testid="export-design"
              title="The design on the canvas as a file, to import here or in another browser">
              Export design
            </button>
            <label className="btn flex-1 justify-center text-sm cursor-pointer" data-testid="import-design"
              title="Load a design file made with Export design; it replaces the current design">
              Import design
              <input type="file" accept=".json,application/json" className="hidden" onChange={importDesign} data-testid="import-design-input" />
            </label>
          </div>
          {saved.length === 0 && <div className="text-xs muted">Nothing saved in this browser yet.</div>}
          {saved.map((c) => (
            <SavedRow key={c.id} c={c} isCurrent={c.id === currentSavedId} count={runCounts[c.shareToken] || 0}
              onLoad={() => loadSaved(c)} onSave={saveCurrent} onDelete={() => deleteSaved(c.id)} />
          ))}
        </div>
      </details>
      </div>
    </div>
  );
}
