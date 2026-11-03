// Adding a shape, a small topology of empty nodes, on an existing line of the canvas. Pure functions of the store's
// state, and the caller sets what they return. placementPreview says where a shape would go and how the existing nodes
// move to make room, and applyShape applies exactly that, so the sidebar's hover preview and its click agree. The
// shapes themselves are data in Sidebar.jsx. Imported by slices/design.js, which is all that calls them.
import { NodeType, defaultDataOf, newId } from "../registry";
import { estimateHeight, loopEdges, placeShape, widthOf } from "../layout";

// A placement is {kind: "between", edgeId}, between the two ends of an existing line. The shape goes into new columns
// right after the line's source, everything to the right of the source moves right by that much and never left, and
// the shape's cells are centred on the source's middle line. Returns {position, fromId, toId, cells, links, entries,
// exits, backs, moves}, or null when the line is gone.
export function placementPreview(state, placement, shape) {
  const { nodes, edges, measured } = state;
  if (placement?.kind !== "between") return null;
  const line = edges.find((e) => e.id === placement.edgeId);
  const from = line && nodes.find((n) => n.id === line.source);
  const to = line && nodes.find((n) => n.id === line.target);
  if (!from || !to) return null;
  const rects = nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: widthOf(n), h: measured[n.id] || estimateHeight(n) }));
  const cellH = (c) => estimateHeight({ type: NodeType.STEP, data: { ...defaultDataOf(NodeType.STEP), ...(c.data || {}) } });
  const { cells, moves } = placeShape(rects, edges, loopEdges(nodes, edges), line, shape, cellH);
  const entries = cells.length ? (shape?.entries || [{ k: cells[0].k }]).map((e) => e.k) : [];
  return { position: cells.find((c) => c.k === entries[0]) || null, fromId: from.id, toId: to.id, cells,
    links: (shape?.links || []).map((l) => ({ from: l.from, to: l.to })), entries, exits: (shape?.exits || []).map((x) => x.k),
    backs: (shape?.backs || []).map((b) => b.k), moves };
}

const lineData = (data) => ({ when: "exchanges", turns: 1, sentence: "", rank: 0, ...(data || {}) });

// Returns {nodes, edges, focus, touched}, the canvas after the shape is added, the node to edit next, and the ids whose
// findings no longer hold, or null when the placement is gone. The line itself becomes the shape's first entry, keeping
// its rule unless the entry sets one, the other entries are new lines from the node before the place, and that node gets
// the shape's questions, where a choice at questionIndex "new" points at the first of them.
export function applyShape(state, shape, placement) {
  const preview = placementPreview(state, placement, shape);
  if (!preview) return null;
  const { nodes, edges } = state;
  const line = edges.find((e) => e.id === placement.edgeId);
  const source = nodes.find((n) => n.id === line.source);
  const had = (source.data?.questions || []).length;
  const resolve = (data) => (data?.questionIndex === "new" ? { ...data, questionIndex: had } : data);
  const sourceData = shape.source
    ? { ...source.data, questions: [...(source.data?.questions || []), ...structuredClone(shape.source.questions || [])] }
    : source.data;
  const cells = shape.cells || [];
  const ids = Object.fromEntries(cells.map((c) => [c.k, newId(NodeType.STEP)]));
  const newNodes = cells.map((c) => {
    const cell = preview.cells.find((p) => p.k === c.k);
    return { id: ids[c.k], type: NodeType.STEP, position: { x: cell.x, y: cell.y },
      data: { ...defaultDataOf(NodeType.STEP), ...structuredClone(c.data || {}) } };
  });
  const placedNodes = nodes.map((n) => {
    const moved = preview.moves[n.id] ? { ...n, position: preview.moves[n.id] } : n;
    return n.id === source.id ? { ...moved, data: sourceData } : moved;
  });
  const add = (sourceId, targetId, data) => ({ id: newId("e"), source: sourceId, target: targetId, type: "deletable", data: lineData(data) });
  let newEdges = [...edges];
  const entries = cells.length ? (shape.entries || [{ k: cells[0].k }]) : [];
  const outCount = edges.filter((e) => e.source === source.id).length;
  if (entries.length) {
    newEdges = newEdges.map((e) => (e.id === line.id
      ? { ...e, target: ids[entries[0].k], data: entries[0].data ? lineData({ ...resolve(entries[0].data), rank: e.data?.rank ?? 0 }) : e.data }
      : e));
    entries.slice(1).forEach((en, i) => newEdges.push(add(source.id, ids[en.k], { ...resolve(en.data), rank: outCount + i })));
  } else if (shape.line) {
    newEdges = newEdges.map((e) => (e.id === line.id ? { ...e, data: lineData({ ...shape.line, rank: e.data?.rank ?? 0 }) } : e));
  }
  (shape.links || []).forEach((l, i) => newEdges.push(add(ids[l.from], ids[l.to], { ...l.data, rank: i })));
  (shape.exits || []).forEach((x, i) => newEdges.push(add(ids[x.k], preview.toId, { ...x.data, rank: i })));
  (shape.backs || []).forEach((b, i) => newEdges.push(add(ids[b.k], source.id, { ...b.data, rank: (shape.exits || []).length + i })));
  return { nodes: [...placedNodes, ...newNodes], edges: newEdges, focus: entries.length ? ids[entries[0].k] : source.id,
    touched: [source.id, preview.toId, line.id] };
}
