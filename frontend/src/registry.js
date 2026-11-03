// The rules of the design's data, shared by every page, the node types and their empty data, the line kinds with their
// labels, the "any other choice" slot, and the order of the states. These are pure functions and data. The server keeps the
// same rules in Python, in dialogue_system_builder/compile.py, whose docstring
// states the design's shape, so a change to one of these rules is a change there too.
export const NodeType = { START: "start", STEP: "step", END: "end" };

const EMPTY_DATA = { [NodeType.START]: {}, [NodeType.STEP]: { description: "", questions: [] }, [NodeType.END]: {} };

export function defaultDataOf(type) {
  if (!EMPTY_DATA[type]) throw new Error(`No default data found for node type "${type}"`);
  return structuredClone(EMPTY_DATA[type]);
}

let counter = 0;
export const newId = (prefix = "n") => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

// IL's order of the states, the Start line's target first and then the other step and End nodes as authored, so a state
// index from IL maps to a node here.
export function orderedStateIdsOf(nodes, edges) {
  const starts = new Set(nodes.filter((n) => n.type === NodeType.START).map((n) => n.id));
  const first = edges.find((e) => starts.has(e.source))?.target;
  const states = nodes.filter((n) => n.type === NodeType.STEP || n.type === NodeType.END).map((n) => n.id);
  return [...states.filter((id) => id === first), ...states.filter((id) => id !== first)];
}

// The Move on rules, in menu order; the first is the default for a new line.
export const WHEN = [
  { value: "exchanges", label: "After N of the user's turns (the number you set)" },
  { value: "sentence", label: "When user uses keyword or says phrase" },
  { value: "answered", label: "When all questions are answered" },
  { value: "choice", label: "If the user chose... (one of the choices)" },
];
export const DEFAULT_WHEN = "exchanges";

// A choice line points at a choice by position, questionIndex and optionIndex into the source node's questions, and the
// text is read from the node. A line with no position, as in the templates, names its choice by its text in `option`.
// The "any other choice" slot is a typed thing on a question beside its written choices, never a choice the author typed.
// The slot stands for the user answering with something the list does not offer. A line points at it with optionIndex -1,
// and its label is the one dialogue_system_builder/compile.py gives IL.
export const ANY_OTHER = "any other choice";
export const ANY_OTHER_INDEX = -1;
export function hasAnyOther(q) {
  return !!q?.anyOther && Array.isArray(q?.options) && q.options.some((o) => (o || "").trim());
}

export function choiceOf(edge, sourceNode) {
  const d = edge?.data || {};
  const qs = sourceNode?.data?.questions || [];
  if (d.optionIndex != null) {
    const q = qs[d.questionIndex ?? 0];
    if (d.optionIndex === ANY_OTHER_INDEX) return hasAnyOther(q) ? ANY_OTHER : "";
    return (Array.isArray(q?.options) ? q.options : [])[d.optionIndex] ?? "";
  }
  return d.option || "";
}

// Every choice a node offers, by position; a question's "any other choice" slot comes last.
export function choicesOf(node) {
  return (node?.data?.questions || []).flatMap((q, questionIndex) => [
    ...(Array.isArray(q?.options) ? q.options : []).map((text, optionIndex) => ({ questionIndex, optionIndex, text }))
      .filter((c) => (c.text || "").trim()),
    ...(hasAnyOther(q) ? [{ questionIndex, optionIndex: ANY_OTHER_INDEX, text: ANY_OTHER, anyOther: true }] : []),
  ]);
}

// Nodes have no names, so where one must be referred to, the start of its prompt is used.
export function promptSnippet(node, words = 6) {
  const ws = (node?.data?.description || "").trim().split(/\s+/).filter(Boolean);
  if (!ws.length) return node?.type === NodeType.END ? "End" : node?.type === NodeType.START ? "Start" : "…";
  return ws.slice(0, words).join(" ") + (ws.length > words ? "…" : "");
}

// The label on an edge is derived from the edge's parameters and nothing else.
export function whenLabel(edge, sourceNode) {
  const d = edge.data || {};
  if (sourceNode?.type === NodeType.START) return "";
  const w = d.when || DEFAULT_WHEN;
  if (w === "sentence") return d.sentence ? `when user says "${d.sentence}"` : "when user says (no phrase yet)";
  if (w === "choice") {
    const c = choiceOf(edge, sourceNode);
    if (c === ANY_OTHER) return "if user wants any other choice";
    return c ? `if user chose "${c}"` : "if user chose (no choice yet)";
  }
  if (w === "exchanges") return `after ${Math.max(1, parseInt(d.turns, 10) || 1)} of the user's turn${(parseInt(d.turns, 10) || 1) === 1 ? "" : "s"}`;
  const n = (sourceNode?.data?.questions || []).filter((q) => (q?.text || "").trim()).length;
  return `when all ${n} question${n === 1 ? "" : "s"} ${n === 1 ? "is" : "are"} answered`;
}
