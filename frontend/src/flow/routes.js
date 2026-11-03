// The routes of every line on the canvas, computed once per change and shared. Each line component asks for the table,
// and the first to ask after a change of the nodes, the lines, the measured heights or the hover preview computes it,
// so a design with fifty lines computes one table and not fifty. Shared by the line component (edges/DeletableEdge.jsx)
// and the hover preview's lines (App.jsx), so a preview's lines take their lanes from the same list as the real ones.
import { CARD_W, estimateHeight, ghostEdgesOf, laneIndices, loopEdges, routeLine, widthOf } from "../layout";

let last = {};

// The table for these inputs, {rects, lanes}. While a placement is hovered the nodes stand where they would move to,
// and the preview's cells and lines are in the table too.
export function routeTable(nodes, edges, measured, ghost) {
  if (last.nodes === nodes && last.edges === edges && last.measured === measured && last.ghost === ghost) return last.table;
  const rects = nodes.map((n) => {
    const p = ghost?.moves?.[n.id] || n.position;
    return { id: n.id, x: p.x, y: p.y, w: widthOf(n), h: measured[n.id] || estimateHeight(n) };
  });
  (ghost?.cells || []).forEach((c) => rects.push({ id: `__cell__${c.k}`, x: c.x, y: c.y, w: CARD_W, h: estimateHeight({ type: "step", data: {} }) }));
  const lanes = laneIndices(rects, [...edges, ...ghostEdgesOf(ghost)], loopEdges(nodes, edges));
  const table = { rects, lanes };
  last = { nodes, edges, measured, ghost, table };
  return table;
}

// One line's route from the table, {kind: "bezier" | "route", ...}, and whether it is a loop back.
export function routeOf(table, line) {
  return { route: routeLine(table.rects, line.source, line.target, table.lanes[line.id]), loop: !!table.lanes[line.id]?.loop };
}
