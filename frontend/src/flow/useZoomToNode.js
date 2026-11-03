// Centring the view on a node, shared by the builder's canvas and the viewer.
// The zoom goes to one level, the one that shows 75% of the whole conversation, and when the view is already at that level
// or closer, the zoom stays as it is and only the centring happens. The centre is held within the conversation's own
// edges, so the view never runs into empty space beyond Start or End, or above or below. For a conversation 1000px wide or
// less, nothing moves at all.
import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { estimateHeight, widthOf } from "../layout";

export function useZoomToNode(canvasRef) {
  const rf = useReactFlow();
  return useCallback((n, duration = 300) => {
    const el = canvasRef.current;
    const b = rf.getNodesBounds(rf.getNodes());
    if (!el || !b.width || !b.height || b.width <= 1000) return;
    const cap = Math.min(el.clientWidth / (0.75 * b.width), el.clientHeight / (0.75 * b.height));
    const zoom = Math.max(rf.getViewport().zoom, cap);
    const m = rf.getInternalNode(n.id)?.measured;
    const w = m?.width || widthOf(n), h = m?.height || estimateHeight(n);
    // the furthest the centre may go in each direction, half a view in from the edges
    const within = (v, lo, hi) => (hi < lo ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));
    const halfW = el.clientWidth / (2 * zoom), halfH = el.clientHeight / (2 * zoom);
    const cx = within(n.position.x + w / 2, b.x + halfW, b.x + b.width - halfW);
    const cy = within(n.position.y + h / 2, b.y + halfH, b.y + b.height - halfH);
    rf.setCenter(cx, cy, { zoom, duration });
  }, [rf, canvasRef]);
}
