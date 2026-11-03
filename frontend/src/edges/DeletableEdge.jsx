// The canvas's line component and the line drawn while a connection is dragged, shared by the editor and the viewer,
// imported and never copied. A line's route comes from flow/routes.js, which runs layout.js, and its label from
// registry.js. The component writes the store only in edit mode, for selecting and deleting. store.js lists the shared canvas parts.
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";
import { useStore } from "../store";
import { whenLabel } from "../registry";
import { roundedPath } from "../layout";
import { routeOf, routeTable } from "../flow/routes";

export function DeletableEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }) {
  const deleteEdge = useStore((s) => s.deleteEdge);
  const select = useStore((s) => s.select);
  const sourceNode = useStore((s) => s.nodes.find((n) => n.id === source));
  // Every line is routed by layout.js. A line between adjacent columns is a plain bezier, and a line
  // spanning several columns, or looping back, leaves its source into the gap, runs along a free
  // lane below the nodes it would otherwise cross, and comes up into its target, so no line ever
  // runs through a node and no label ever sits on one. Loops leave the source on its left side
  // and enter the target on its right side.
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const measured = useStore((s) => s.measured);
  const ghost = useStore((s) => s.ghost);
  const { route, loop } = routeOf(routeTable(nodes, edges, measured, ghost), { id, source, target });
  let path, labelX, labelY, align = "-50%"; // loop is a line back to an earlier node; the label is centred on its point unless the route anchors it beside an arc
  if (route?.kind === "route") {
    path = roundedPath(route.points, route.radius);
    labelX = route.label.x;
    labelY = route.label.y;
    align = route.label.align === "start" ? "0" : route.label.align === "end" ? "-100%" : "-50%";
  } else {
    [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  }
  const editing = useStore((s) => s.mode === "edit"); // in conversation mode the label is read-only and there is no delete
  const label = whenLabel({ data }, sourceNode);
  const vis = data?.vis || ""; // "" | dim | path | crossing — set by the canvas in conversation mode
  return (
    <>
      {loop && (
        // a return carries a chevron at both ends of the line, pointing the way it runs, one just
        // off the source where the line sets out and one with its tip on the target where it arrives
        <defs>
          <marker id={`loop-start-${id}`} viewBox="-8 -6 12 12" refX="-8" refY="0" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M -6 -4 L 0 0 L -6 4" fill="none" stroke="rgb(140,168,222)" strokeWidth="1.5" />
          </marker>
          <marker id={`loop-end-${id}`} viewBox="-8 -6 12 12" refX="0" refY="0" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M -6 -4 L 0 0 L -6 4" fill="none" stroke="rgb(140,168,222)" strokeWidth="1.5" />
          </marker>
        </defs>
      )}
      <BaseEdge id={id} path={path} className={loop ? "is-loop" : undefined}
        markerStart={loop ? `url(#loop-start-${id})` : undefined} markerEnd={loop ? `url(#loop-end-${id})` : undefined} />
      <EdgeLabelRenderer>
        <div className={`nodrag nopan group absolute flex items-center gap-1 edge-label ${loop ? "edge-label--loop" : ""} ${vis ? `edge-label--${vis}` : ""}`} data-testid={`edge-${id}`}
          style={{ transform: `translate(${align}, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: editing ? "all" : "none" }}>
          {label && (
            <button type="button" onClick={() => select({ kind: "edge", id })}
              className="edge-label__pill max-w-56 truncate rounded-full border px-2 py-0.5 text-xs"
              style={{ background: "rgb(31,31,31)", borderColor: selected ? "rgb(13,148,136)" : loop ? "rgb(90,115,165)" : "var(--line)" }}>
              {loop && <span className="mr-1">&lt;</span>}{label}
            </button>
          )}
          {editing && (
            <button type="button" aria-label="Delete" onClick={() => deleteEdge(id)}
              className="flex size-5 items-center justify-center rounded-full border text-[11px] transition hover:scale-90 hover:text-red-400"
              style={{ background: "rgb(31,31,31)", borderColor: "var(--line)" }}>
              ✕
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const edgeTypes = { deletable: DeletableEdge };

// The line drawn while a connection is being dragged. Over empty canvas it ends in a translucent
// empty node, and releasing there creates that node, as addNodeAt says. Over a node's handle the ghost
// disappears and the line snaps as usual. Dragged from an End there is no line at all, only a
// translucent End pill under the pointer, and releasing it on empty canvas makes another End there.
export function GhostConnectionLine({ fromX, fromY, toX, toY, fromPosition, toPosition, toHandle, fromNode }) {
  const [path] = getBezierPath({ sourceX: fromX, sourceY: fromY, targetX: toX, targetY: toY, sourcePosition: fromPosition, targetPosition: toPosition });
  // Start takes exactly one line out, so once it has one, a drag from it shows no ghost node.
  const startTaken = useStore((s) => fromNode?.type === "start" && s.edges.some((e) => e.source === fromNode.id));
  if (fromNode?.type === "end") {
    return (
      <g>
        {!toHandle && (
          <foreignObject x={toX} y={toY - 24} width={140} height={48} style={{ overflow: "visible", pointerEvents: "none" }}>
            <div className="pill ghost-node" data-testid="ghost-end" style={{ width: "fit-content" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mr-2 shrink-0"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              <span className="mr-1">End</span>
            </div>
          </foreignObject>
        )}
      </g>
    );
  }
  const ghost = !toHandle && !startTaken;
  return (
    <g>
      <path d={path} fill="none" stroke="rgba(253,253,253,.7)" strokeWidth={1.5} strokeDasharray={ghost ? "6 6" : undefined} />
      {ghost && (
        <foreignObject x={toX} y={toY - 40} width={240} height={80} style={{ overflow: "visible", pointerEvents: "none" }}>
          <div className="card ghost-node" data-testid="ghost-node">
            <div className="flex h-9 items-center px-3" style={{ background: "rgba(45,45,45,.5)" }} />
            <div className="px-3 py-2 text-sm"><span className="muted italic">New node</span></div>
          </div>
        </foreignObject>
      )}
    </g>
  );
}
