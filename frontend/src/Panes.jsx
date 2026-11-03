// The sidebar's two panes in the editor, NodePane for the selected node's prompt and questions, and EdgePane for when the
// selected line moves on. Each writes only the store's design, and registry.js holds the rules of the data they edit. A
// finding's code from the server's dialogue_system_builder/checks.py decides which field a refused Start marks red, so those codes
// are shared with that file. Imported by App.jsx, which lists the editor's parts.
import { useEffect, useRef } from "react";
import { useStore } from "./store";
import { ANY_OTHER, DEFAULT_WHEN, NodeType, WHEN, choicesOf, promptSnippet, whenLabel } from "./registry";

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs muted">{label}</div>
      {children}
    </label>
  );
}

export function NodePane({ node }) {
  const updateNodeData = useStore((s) => s.updateNodeData);
  const d = node.data;
  const set = (patch) => updateNodeData(node.id, patch);
  // A double-click on the node lands the cursor in its prompt.
  const focusTick = useStore((s) => s.focusTick);
  const promptRef = useRef(null);
  useEffect(() => { if (focusTick) promptRef.current?.focus(); }, [focusTick, node.id]);
  // True while a refused Start names this node's questions, for an empty question, a missing one, or
  // choices without a question. An error about the prompt alone never touches the questions.
  const QUESTION_FINDINGS = ["write-question", "add-questions", "add-question-with-choices"];
  const bad = useStore((s) => s.findings.some((f) => f.level === "error" && f.node === node.id && QUESTION_FINDINGS.includes(f.code)));
  const questions = d.questions || [];
  const setQ = (i, patch) => set({ questions: questions.map((q, k) => (k === i ? { ...q, ...patch } : q)) });

  if (node.type === NodeType.START) {
    return <div className="p-4 text-sm muted">Start. Drag from its handle to the first step.</div>;
  }
  if (node.type === NodeType.END) {
    return <div className="p-4 text-sm muted">End. The conversation closes here, with one last line the assistant writes from the system prompt. Put what it must say in the node before it. Drag from its endpoint to make another End.</div>;
  }
  return (
    <div className="flex flex-col gap-4 p-4" data-testid="node-pane">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider muted">Step</div>
      </div>
      <Field label="Prompt: an instruction to the bot, not the words it says">
        <textarea ref={promptRef} className="field" name="description" rows={4} value={d.description || ""}
          placeholder="e.g. “Greet them and ask about their commute.”"
          onChange={(e) => set({ description: e.target.value })} />
      </Field>
      {node.type === NodeType.STEP && (
        <>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs muted">
              <span>Things to find out</span>
              <button type="button" className="btn py-0.5 text-xs" data-testid="add-question"
                style={bad && !questions.some((q) => (q.text || "").trim()) ? { borderColor: "var(--error)", boxShadow: "0 0 0 2px rgba(248,113,113,.3)" } : undefined}
                onClick={() => set({ questions: [...questions, { text: "", options: null }] })}>+ Add question</button>
            </div>
            {bad && !questions.length && (
              <div className="mb-2 text-xs italic" style={{ color: "var(--error)" }} data-testid="needs-question">Please add a question</div>
            )}
            <div className="flex flex-col gap-2">
              {questions.map((q, i) => (
                <div key={i} className="rounded-lg border p-2" style={{ borderColor: "var(--line)" }}>
                  <div className="flex gap-2">
                    <input className="field" name={`question-${i}`}
                      placeholder={bad && !(q.text || "").trim() ? "Please write the question" : "e.g. “How do you usually get to work?”"}
                      style={bad && !(q.text || "").trim() ? { borderColor: "var(--error)", boxShadow: "0 0 0 2px rgba(248,113,113,.3)" } : undefined}
                      data-testid={bad && !(q.text || "").trim() ? "needs-question" : undefined}
                      value={q.text || ""} onChange={(e) => setQ(i, { text: e.target.value })} />
                    <button type="button" className="btn px-2 text-red-400" aria-label="Remove question"
                      onClick={() => set({ questions: questions.filter((_, k) => k !== i) })}>✕</button>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={Array.isArray(q.options) && q.options.length > 0}
                      onChange={(e) => setQ(i, { options: e.target.checked ? ["", ""] : null })} />
                    Fixed choices
                  </label>
                  {Array.isArray(q.options) && q.options.length > 0 && (
                    <div className="mt-1 flex flex-col gap-1">
                      {q.options.map((o, k) => (
                        <div key={k} className="flex gap-1">
                          <input className="field" placeholder={`e.g. “${["I drive", "I take the bus", "I cycle"][k] || `Choice ${k + 1}`}”`} value={o}
                            onChange={(e) => setQ(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} />
                          <button type="button" className="btn px-2" aria-label="Remove choice"
                            onClick={() => setQ(i, { options: q.options.filter((_, m) => m !== k) })}>✕</button>
                        </div>
                      ))}
                      {q.anyOther && (
                        <div className="flex gap-1">
                          <div className="field chip-other" data-testid="any-other-choice">{ANY_OTHER}</div>
                          <button type="button" className="btn px-2" aria-label="Remove any other choice"
                            onClick={() => setQ(i, { anyOther: false })}>✕</button>
                        </div>
                      )}
                      <div className="flex gap-1">
                        <button type="button" className="btn py-0.5 text-xs"
                          onClick={() => setQ(i, { options: [...q.options, ""] })}>+ choice</button>
                        {!q.anyOther && q.options.some((o) => (o || "").trim()) && (
                          <button type="button" className="btn btn-other py-0.5 text-xs" data-testid="add-any-other"
                            title="The user asks for something the choices do not offer"
                            onClick={() => setQ(i, { anyOther: true })}>+ any other choice</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function EdgePane({ edge }) {
  const updateEdgeData = useStore((s) => s.updateEdgeData);
  const nodes = useStore((s) => s.nodes);
  const source = nodes.find((n) => n.id === edge.source);
  const target = nodes.find((n) => n.id === edge.target);
  const d = edge.data || {};
  const set = (patch) => updateEdgeData(edge.id, patch);
  if (source?.type === NodeType.START) {
    return <div className="p-4 text-sm muted">The conversation starts at "{promptSnippet(target)}".</div>;
  }
  return (
    <div className="flex flex-col gap-4 p-4" data-testid="edge-pane">
      <div className="flex items-center justify-between">
        <div className="truncate text-xs font-medium uppercase tracking-wider muted">
          {promptSnippet(source, 3)} → {promptSnippet(target, 3)}
        </div>
      </div>
      <Field label="Move on">
        <select className="field" name="when" value={d.when || DEFAULT_WHEN} onChange={(e) => set({ when: e.target.value })}>
          {WHEN.map((w) => <option key={w.value} value={w.value}>
            {w.value === "answered" ? whenLabel({ data: { when: "answered" } }, source) : w.label}
          </option>)}
        </select>
      </Field>
      {d.when === "exchanges" && (
        <Field label="How many of the user's turns">
          <input className="field" type="number" name="turns" min={1} max={30} value={d.turns ?? 1}
            onChange={(e) => set({ turns: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
        </Field>
      )}
      {(d.when || DEFAULT_WHEN) === "sentence" && (
        <Field label="Keyword or phrase">
          <input className="field" name="sentence" value={d.sentence || ""} placeholder="e.g. “help” or “I want to skip this”"
            onChange={(e) => set({ sentence: e.target.value })} />
        </Field>
      )}
      {d.when === "choice" && (
        <Field label="Which choice">
          {choicesOf(source).length ? (
            <select className="field" name="option"
              value={d.optionIndex != null ? `${d.questionIndex ?? 0}:${d.optionIndex}` : ""}
              onChange={(e) => {
                const [qi, oi] = e.target.value.split(":");
                // Picking by position clears `option`, the text a template's line names its choice by, which registry.js reads only when no position is set.
                set(e.target.value ? { questionIndex: Number(qi), optionIndex: Number(oi), option: "" } : { questionIndex: null, optionIndex: null, option: "" });
              }}>
              <option value="">Pick one</option>
              {choicesOf(source).map((c) => <option key={`${c.questionIndex}:${c.optionIndex}`} value={`${c.questionIndex}:${c.optionIndex}`}>{c.text}</option>)}
            </select>
          ) : (
            <div className="text-sm text-amber-300">This step has no question with fixed choices yet.</div>
          )}
        </Field>
      )}
    </div>
  );
}
