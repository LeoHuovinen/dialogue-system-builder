// The canvas's three node components, Start, a step and End, shared by the editor and the viewer, imported and never
// copied. They read the store and write it only through a node's delete button, which shows only in edit mode, so the
// viewer shows none. store.js lists the shared canvas parts.
import { Handle, Position } from "@xyflow/react";
import { useStore } from "../store";
import { ANY_OTHER, hasAnyOther } from "../registry";

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mr-2 shrink-0">
    <path d="M7 5v14l11-7z" />
  </svg>
);
const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mr-2 shrink-0">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);
const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

export function StartNode({ selected }) {
  return (
    <>
      <div className="pill" data-selected={selected} data-testid="node-start">
        <PlayIcon /><span className="mr-1">Start</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
}

// End is a pill like Start, with no prompt, and the assistant's last planned words are an ordinary node before it.
// There may be several Ends. A drag from an End's right-hand endpoint onto empty canvas makes another End there and never
// a line, since End has no lines out. An End can be deleted while another End remains, and the last one never can.
// With more than one End the pills read "End 1", "End 2" and so on in canvas order, and a single End is "End".
export function EndNode({ id, selected }) {
  const deleteNode = useStore((s) => s.deleteNode);
  const ends = useStore((s) => s.nodes.filter((n) => n.type === "end").map((n) => n.id).join("\n"));
  const ids = ends.split("\n");
  const spare = ids.length > 1;
  const editing = useStore((s) => s.mode === "edit");
  const label = spare ? `End ${ids.indexOf(id) + 1}` : "End";
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div className="pill" data-selected={selected} data-testid="node-end">
        <StopIcon /><span className="mr-1">{label}</span>
        {spare && editing && (
          <button type="button" className="nodrag ml-1 rounded p-0.5 text-red-400 hover:bg-red-500/10" title="Delete this End"
            aria-label="Delete this End" data-testid="delete-end" onClick={(e) => { e.stopPropagation(); deleteNode(id); }}>
            <TrashIcon />
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
}

export function StepNode({ id, data, selected }) {
  const deleteNode = useStore((s) => s.deleteNode);
  const editing = useStore((s) => s.mode === "edit");
  // True only while a refused Start has this node in red and its prompt is still empty.
  const needsPrompt = useStore((s) => !(data.description || "").trim() && s.findings.some((f) => f.level === "error" && f.node === id));
  const questions = (data.questions || []).filter((q) => (q.text || "").trim());
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div className="card" data-selected={selected} data-testid="node-step">
        <div className="relative" style={{ background: "rgba(45,45,45,.5)" }}>
          <div className="absolute inset-0"><div className="absolute h-full w-3/5 bg-gradient-to-r from-teal-900/20 to-transparent" /></div>
          <div className="relative flex h-9 items-center justify-between gap-x-4 px-2">
            <div />
            {editing && (
              <button type="button" className="rounded p-1 text-red-400 hover:bg-red-500/10" title="Delete step"
                aria-label="Delete step" onClick={(e) => { e.stopPropagation(); deleteNode(id); }}>
                <TrashIcon />
              </button>
            )}
          </div>
        </div>
        <div className="px-3 py-2">
          <div className="text-sm">
            {data.description ? <span className="line-clamp-3" style={{ color: "rgba(253,253,253,.78)" }}>“{data.description}”</span>
              : needsPrompt ? <span className="italic" style={{ color: "var(--error)" }} data-testid="needs-prompt">Please add prompt</span>
              : <span className="muted italic">No prompt yet</span>}
          </div>
        </div>
        {questions.length > 0 && (
          <ul className="space-y-1 px-3 py-2 text-xs">
            {questions.map((q, i) => (
              <li key={i}>
                <span className="font-medium" style={{ color: "rgba(253,253,253,.62)" }}>“{q.text}”</span>
                {Array.isArray(q.options) && q.options.some((o) => (o || "").trim())
                  ? <span className="muted"> ({q.options.filter((o) => (o || "").trim()).map((o) => `“${o}”`).join(" / ")}
                    {hasAnyOther(q) ? <> / <span className="text-other">{ANY_OTHER}</span></> : null})</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </>
  );
}

export const nodeTypes = { start: StartNode, step: StepNode, end: EndNode };
