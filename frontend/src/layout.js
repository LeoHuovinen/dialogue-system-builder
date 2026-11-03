// The canvas geometry, the sizes of the cards and pills, which lines are loops, the routes of the lines around the
// nodes, and the places of a new shape spliced into a line. These are pure functions with no React, and they read and
// write nothing but their arguments. Imported by the shared canvas parts, as store.js lists them, through
// flow/routes.js and flow/shapes.js.
//
// The nodes stand where the person or a placed shape put them, in columns COL apart with rows ROW_GAP apart. A line
// back to an earlier node is a loop, found by a depth-first search from Start. Heights come from a measure the caller
// supplies, in which the page hands the measured card heights, and anything unmeasured is estimated from its text.

export const CARD_W = 320;   // .card width (20rem)
export const PILL_W = 110;   // the Start and End pill, about this wide
export const PILL_H = 48;
export const COL_GAP = 260;  // room between columns for the line labels, a label being at most 224 wide
export const ROW_GAP = 70;   // room between stacked cards
export const ROW_BAND = 120; // the least room between two rows, a lane band with one or two lines
export const COL = CARD_W + COL_GAP;

export function estimateHeight(node) {
  if (node.type === "start" || node.type === "end") return PILL_H;
  const d = node.data || {};
  const prompt = (d.description || "").trim();
  let h = 36; // header strip
  h += 8 + (prompt ? linesOf(prompt, 3) * 21 : 21) + 8;
  const qs = (d.questions || []).filter((q) => (q?.text || "").trim());
  if (qs.length) h += 8 + qs.length * 18 + 8;
  return h;
}

function linesOf(text, max) {
  const perLine = 40; // ~296px of 14px text
  const words = String(text).split(/\s+/);
  let lines = 1, col = 0;
  for (const w of words) {
    if (col + w.length + 1 > perLine) { lines += 1; col = w.length; } else col += w.length + 1;
  }
  return Math.min(max, lines);
}

export function widthOf(node) {
  return node.type === "start" || node.type === "end" ? PILL_W : CARD_W;
}

// ── loops ─────────────────────────────────────────────────────────────────────────────────

function forwardEdges(nodes, edges) {
  const back = loopEdges(nodes, edges);
  const ids = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => !back.has(e.id) && ids.has(e.source) && ids.has(e.target));
}

// Returns the ids of the loops. A depth-first search runs from Start, and a line to a node on the current stack is a loop.
export function loopEdges(nodes, edges) {
  const out = new Map(nodes.map((n) => [n.id, []]));
  edges.forEach((e) => { if (out.has(e.source) && out.has(e.target)) out.get(e.source).push(e); });
  const start = nodes.find((n) => n.type === "start");
  const onStack = new Set(), seen = new Set(), back = new Set();
  const visit = (id) => {
    seen.add(id); onStack.add(id);
    for (const e of out.get(id) || []) {
      if (onStack.has(e.target)) back.add(e.id);
      else if (!seen.has(e.target)) visit(e.target);
    }
    onStack.delete(id);
  };
  if (start) visit(start.id);
  nodes.forEach((n) => { if (!seen.has(n.id)) visit(n.id); });
  return back;
}


// ── checks──────────────────────────────────────


export function overlaps(a, b, margin = 0) {
  return a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin;
}

// ── line routing ─────────────────────────────────────────────────────────────────────────────
// A line between adjacent columns of the same row is a plain bezier from the source's right to
// the target's left and its label sits at the midpoint, inside the column gap. Every other line,
// one spanning several columns, one wrapping to the next row, or one looping back, is routed, so it
// leaves the source horizontally into the gap, drops to a free lane in the band below the
// source's row, runs along the lane, and goes up or down the gap beside its target into it. Its
// label sits on the lane. Lanes are counted per band so two routed lines never share one. A loop
// leaves the source on its left side and enters the target on its right side, which is what
// marks it as a loop, and is drawn with corners as round as its stubs allow, so it reads as one
// circuit rather than a box. On the layout grid the gaps between columns are
// node-free, but nodes can be dragged anywhere, so every long piece of a routed line is checked
// against the nodes and slid to the nearest free place, a lane down and a vertical piece
// sideways, until it touches nothing. No line runs under a node.

export const LANE_GAP = 36;
export const STUB = 30;   // how far a routed line goes into the gap before turning
export const CLEAR = 12;  // the least distance between a routed line and a node it is not attached to
export const LOOP_R = 60; // the corner radius of a loop; forward routed lines keep a small one

// Whether a horizontal piece at y from xa to xb, or a vertical piece at x from ya to yb, comes
// within CLEAR of any node.
function hitsH(rects, y, xa, xb) {
  const l = Math.min(xa, xb), r = Math.max(xa, xb);
  return rects.some((o) => y > o.y - CLEAR && y < o.y + o.h + CLEAR && r > o.x - CLEAR && l < o.x + o.w + CLEAR);
}
function hitsV(rects, x, ya, yb) {
  const t = Math.min(ya, yb), b = Math.max(ya, yb);
  return rects.some((o) => x > o.x - CLEAR && x < o.x + o.w + CLEAR && b > o.y - CLEAR && t < o.y + o.h + CLEAR);
}
// The nearest value to v at which hit(v) is false, tried in steps of 8 in direction dir first
// and, when both is set, in the other direction too. v itself when nothing free is found.
function slide(v, dir, hit, limit, both = false) {
  if (!hit(v)) return v;
  for (let d = 8; d <= limit; d += 8) {
    if (!hit(v + dir * d)) return v + dir * d;
    if (both && !hit(v - dir * d)) return v - dir * d;
  }
  return v;
}

// The rows, read off the rects, as intervals of y where nodes are, split wherever the gap between
// what is above and what is below is more than the stacking gap, that is at every band.
export function rowBands(rects) {
  const bands = [];
  [...rects].sort((a, b) => a.y - b.y).forEach((r) => {
    const last = bands[bands.length - 1];
    if (last && r.y <= last.bottom + ROW_GAP + 40) last.bottom = Math.max(last.bottom, r.y + r.h);
    else bands.push({ top: r.y, bottom: r.y + r.h });
  });
  return bands;
}

export function rowOf(rect, bands) {
  const i = bands.findIndex((b) => rect.y >= b.top && rect.y <= b.bottom);
  return i < 0 ? 0 : i;
}

// Adjacent = the same row and the next column, measured from left edge to left edge, so a narrow
// pill (Start, End) counts like a card and never sends its line down into a lane. When rects are
// given, a node dragged into the strip between the two ends makes them not adjacent, so the line
// is routed around it instead of drawn straight through it.
export function isAdjacent(s, t, bands, rects = []) {
  if (!(rowOf(s, bands) === rowOf(t, bands) && t.x > s.x && t.x - s.x < COL + 100)) return false;
  const y1 = Math.min(s.y + s.h / 2, t.y + t.h / 2), y2 = Math.max(s.y + s.h / 2, t.y + t.h / 2);
  const strip = { x: s.x + s.w, y: y1, w: Math.max(0, t.x - s.x - s.w), h: y2 - y1 };
  return !rects.some((o) => o.id !== s.id && o.id !== t.id && overlaps(o, strip, CLEAR));
}


// ── the ring around a stacked pair ───────────────────────────────────────────────────────────
// A forward line and its return between two stacked nodes make one ring. The forward is the right arc, out of the
// source's right side and into the target's right side, and the return is the left arc, out of the source's left side and
// into the target's left side. So at either node the forward and the return are never on the same horizontal side, and
// the two arcs lie in the two gaps beside the column, so they cannot overlap anywhere. The ports depend on the line's role
// only, never on where the nodes are. The forward arc leaves at the upper quarter of the source's right side and enters at
// the lower quarter of the target's right side, and the return leaves at the lower quarter of the source's left side and
// enters at the upper quarter of the target's left side. Moving a node changes the path between the ports, never the
// ports. The arc hugs the cards, going out by ARC_D, vertical and back in, with corners of radius ARC_D, and k steps arcs
// that share a gap apart. The labels stand inside the ring, in the room between the two cards, the forward's a
// little above the middle against the right arc and the return's a little below it against the
// left arc, so the ring takes no room beyond the arcs themselves.
export const ARC_D = 36;
function arcRoute(rects, s, t, { arc, k = 0 }) {
  const right = arc === "R", dir = right ? 1 : -1;
  const sy = s.y + (right ? s.h / 4 : 3 * s.h / 4), ty = t.y + (right ? 3 * t.h / 4 : t.h / 4);
  const x1 = right ? s.x + s.w : s.x, x2 = right ? t.x + t.w : t.x;
  const edge = right ? Math.max(x1, x2) : Math.min(x1, x2);
  let xm = edge + dir * (ARC_D + k * 12);
  xm = slide(xm, dir, (x) => hitsV(rects, x, sy, ty), COL);
  const points = [{ x: x1, y: sy }, { x: xm, y: sy }, { x: xm, y: ty }, { x: x2, y: ty }];
  const mid = (sy + ty) / 2;
  return { kind: "route", points, radius: Math.abs(xm - edge),
    label: { x: xm - dir * 8, y: right ? mid - 14 : mid + 14, align: right ? "end" : "start" } };
}

// The lines a hovered placement would draw, into the entry, between the cells, and exits to the old
// target. Real lines and ghost lines share one lane list so no two ever run along the same lane.
export function ghostEdgesOf(ghost) {
  if (!ghost) return [];
  return [
    ...(ghost.entries || []).map((k, i) => ({ id: `g-in${i}`, source: ghost.fromId, target: `__cell__${k}` })),
    ...ghost.links.map((l, i) => ({ id: `g-l${i}`, source: `__cell__${l.from}`, target: `__cell__${l.to}` })),
    ...ghost.exits.map((k, i) => ({ id: `g-x${i}`, source: `__cell__${k}`, target: ghost.toId })),
    ...(ghost.backs || []).map((k, i) => ({ id: `g-b${i}`, source: `__cell__${k}`, target: ghost.fromId, loop: true })),
  ];
}

// The parameter rects lists {id, x, y, w, h} of every node. Returns {kind: "bezier"} or {kind: "route", points, label}.
// A routed line's lane runs in the band below the source's row for a loop, and for any other line
// below whichever of its two rows is higher, that is between them when they differ.
export function laneBand(s, t, loop, bands) {
  const sr = rowOf(s, bands), tr = rowOf(t, bands);
  return loop ? sr : Math.min(sr, tr);
}

// The parameter slot is {lane, band, out, into, loop} from laneIndices, the line's lane in its band, the band,
// its number among the routed lines leaving its side of its column, its number among those
// entering its side of the target's column, and whether it is a loop back.
export function routeLine(rects, sourceId, targetId, slot = {}) {
  const s = rects.find((r) => r.id === sourceId), t = rects.find((r) => r.id === targetId);
  if (!s || !t) return null;
  const { lane = 0, out = 0, into = 0, loop = false } = typeof slot === "number" ? { lane: slot } : (slot || {});
  if (slot?.arc) return arcRoute(rects, s, t, slot);
  const bands = rowBands(rects);
  const sMid = s.y + s.h / 2, tMid = t.y + t.h / 2;
  if (!loop && isAdjacent(s, t, bands, rects)) return { kind: "bezier", sx: s.x + s.w, sy: sMid, tx: t.x, ty: tMid };
  // a line onward leaves the source's right side and enters the target's left, wherever the
  // target is, and a loop back leaves the left side and enters the target's right, which is what
  // shows it as a loop and lets it close as one circuit
  const forward = !loop;
  const band = slot.band ?? laneBand(s, t, loop, bands);
  // each lane in a band has its own height
  let laneY = bands[band].bottom + 50 + lane * LANE_GAP;
  // a loop leaves low on the source's left side and enters low on the target's right side, clear
  // of the lines that enter and leave at the middle
  const sy = forward ? sMid : s.y + s.h - 16, ty = forward ? tMid : t.y + t.h - 16;
  const x1 = forward ? s.x + s.w : s.x;             // where the line leaves the source
  const x2 = forward ? t.x : t.x + t.w;             // where it enters the target
  const dir = forward ? 1 : -1;                     // which way it goes out; it comes in the other way
  // in the gaps, every line leaving a node and every line entering one gets its own x (exits at
  // 35, 45, …, entries at 30, 40, …), so no two vertical pieces ever lie on each other
  let xa = x1 + dir * (STUB + 5 + out * 10), xb = x2 - dir * (STUB + into * 10); // where it drops, where it rises
  // slide each long piece clear of the nodes, the lane down, the drop further out from the
  // source, the rise further out from the target, and then the lane once more at its final extent
  laneY = slide(laneY, 1, (y) => hitsH(rects, y, xa, xb), 800);
  xa = slide(xa, dir, (x) => hitsV(rects, x, sy, laneY), COL, true);
  xb = slide(xb, -dir, (x) => hitsV(rects, x, laneY, ty), COL, true);
  laneY = slide(laneY, 1, (y) => hitsH(rects, y, xa, xb), 800);
  const points = [
    { x: x1, y: sy }, { x: xa, y: sy }, { x: xa, y: laneY },
    { x: xb, y: laneY }, { x: xb, y: ty }, { x: x2, y: ty },
  ];
  return { kind: "route", points, radius: loop ? LOOP_R : 14, label: { x: (xa + xb) / 2, y: laneY } };
}

// An SVG path through the points with rounded corners. A corner takes up to r from each of its
// two segments; a segment between two corners gives each half of itself, and the first and last
// segments, with one corner only, can be taken whole, so a large r turns a short stub into one
// continuous curve.
export function roundedPath(points, r = 14) {
  if (points.length < 2) return "";
  const len = (a, b) => Math.abs(b.x - a.x) + Math.abs(b.y - a.y); // axis-aligned, one term is 0
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1], c = points[i], n = points[i + 1];
    const inx = Math.sign(c.x - p.x), iny = Math.sign(c.y - p.y);
    const outx = Math.sign(n.x - c.x), outy = Math.sign(n.y - c.y);
    // the first and last segment keep 1px straight so an arrowhead at either end has a direction
    const inMax = i === 1 ? len(p, c) - 1 : len(p, c) / 2;
    const outMax = i === points.length - 2 ? len(c, n) - 1 : len(c, n) / 2;
    const rr = Math.max(0, Math.min(r, inMax, outMax));
    d += ` L ${c.x - inx * rr} ${c.y - iny * rr} Q ${c.x} ${c.y} ${c.x + outx * rr} ${c.y + outy * rr}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}


// Every non-adjacent line gets a lane, in the order of the edges. Each gets
// {lane, out, into}, its lane within the band below its source's row, its number among the routed
// lines leaving from the same side of the same column, and its number among the routed lines
// entering the same side of the same column, so the vertical pieces in one gap never coincide.
export function laneIndices(rects, edges, loops = new Set()) {
  const bands = rowBands(rects);
  const lanes = {};
  const used = {}, outs = {}, ins = {}, arcs = {};
  const reverse = new Set(edges.map((e) => `${e.target}>${e.source}`)); // "a>b" when b→a exists
  edges.forEach((e) => {
    const s = rects.find((r) => r.id === e.source), t = rects.find((r) => r.id === e.target);
    if (!s || !t) return;
    const loop = loops.has(e.id) || !!e.loop;
    // every return is the left arc of a ring; the forward line of the same pair, when there is a
    // direct one, is its right arc. Decided by role alone, never by where the nodes are, so the
    // ports never move when a node is dragged. Arcs sharing a gap are counted apart.
    if (loop || reverse.has(`${e.source}>${e.target}`)) {
      const arc = loop ? "L" : "R";
      const key = `${arc}${Math.round((arc === "L" ? Math.min(s.x, t.x) : Math.max(s.x + s.w, t.x + t.w)) / 8)}`;
      lanes[e.id] = { arc, k: arcs[key] = (arcs[key] ?? -1) + 1, loop };
      return;
    }
    if (!loop && isAdjacent(s, t, bands, rects)) return;
    const band = laneBand(s, t, loop, bands);
    const outKey = loop ? `l${s.x}` : `r${s.x + s.w}`, inKey = loop ? `r${t.x + t.w}` : `l${t.x}`;
    lanes[e.id] = { lane: used[band] = (used[band] ?? -1) + 1, band, loop,
      out: outs[outKey] = (outs[outKey] ?? -1) + 1, into: ins[inKey] = (ins[inKey] ?? -1) + 1 };
  });
  return lanes;
}

// ── placing a shape ──────────────────────────────────────────────────────────────────────────
// A shape goes between the two ends of a line. The existing nodes keep their places, so the shape's
// cells go into new columns right after the line's source, everything to the right of the source
// moves right by that much (never left), and the cells are centred on the source's middle line,
// spread above and below it equally. Where the shape stands taller than its row, the rows above
// move up and the rows below move down by the overflow on each side; where a band needs more
// room for its lanes, the rows under it move down.
// The parameter rects lists the existing nodes, edges and loops the existing lines and which are loops, line the line the
// shape splices into, and cellH(cell) gives a cell's height. Returns {cells: [{k, x, y}], moves: {id: {x, y}}}, where the
// moves are only the nodes that move.
export function placeShape(rects, edges, loops, line, shape, cellH) {
  const X = rects.find((r) => r.id === line.source);
  const bands = rowBands(rects);
  const row = bands[rowOf(X, bands)];
  const cells0 = shape ? (shape.cells || []) : [{ k: "a", dx: 0, dy: 0, data: {} }];
  if (!cells0.length) return { cells: [], moves: {} }; // the shape only changes the node before and its line
  const tempId = (k) => `__cell__${k}`;
  // one column per distinct dx, each stacked with the row gap and centred on the middle line
  const columns = [...new Set(cells0.map((c) => c.dx || 0))].sort((a, b) => a - b);
  const colCells = columns.map((dx) => cells0.filter((c) => (c.dx || 0) === dx));
  const colH = colCells.map((cs) => cs.reduce((s, c, i) => s + cellH(c) + (i ? ROW_GAP : 0), 0));
  const blockH = Math.max(...colH), blockW = columns.length * COL - COL_GAP;
  const mid = X.y + X.h / 2;
  const cells = [];
  const moves = {};
  const moved = (r) => moves[r.id] || { x: r.x, y: r.y };
  if (shape?.place === "column") {
    // This moves vertically only, above and below equally. The cells stack under the node before the place in
    // its own column, and the whole stack is centred on that node's original middle line. The
    // node moves up by half the added height and the cells sit below it; everything above the row
    // moves up by that half and everything below moves down by it. Nothing moves right.
    const added = colH[0] + ROW_GAP;
    const half = Math.round(added / 2);
    moves[X.id] = { x: X.x, y: X.y - half };
    let cur = X.y - half + X.h + ROW_GAP;
    cells0.forEach((c) => { cells.push({ k: c.k, x: X.x, y: Math.round(cur), h: cellH(c) }); cur += cellH(c) + ROW_GAP; });
    rects.forEach((r) => {
      if (r.id === X.id) return;
      const sameColumn = Math.abs(r.x - X.x) < COL / 2 && r.y >= row.top && r.y <= row.bottom;
      if (r.y + r.h <= row.top || (sameColumn && r.y < X.y)) moves[r.id] = { x: r.x, y: r.y - half };
      else if (r.y >= row.bottom || (sameColumn && r.y > X.y)) moves[r.id] = { x: r.x, y: r.y + half };
    });
  } else {
    const x0 = X.x + COL;
    colCells.forEach((cs, ci) => {
      let cur = mid - colH[ci] / 2;
      cs.forEach((c) => { cells.push({ k: c.k, x: x0 + ci * COL, y: Math.round(cur), h: cellH(c) }); cur += cellH(c) + ROW_GAP; });
    });
    // everything right of the source's column moves right so the new columns are free
    const shifted = rects.filter((r) => r.x > X.x + 40);
    const shift = shifted.length ? Math.max(0, x0 + blockW + COL_GAP - Math.min(...shifted.map((r) => r.x))) : 0;
    shifted.forEach((r) => { moves[r.id] = { x: r.x + shift, y: r.y }; });
    // what the block overflows on each side of its row pushes the rows on that side outward
    const up = Math.max(0, row.top - (mid - blockH / 2)), down = Math.max(0, (mid + blockH / 2) - row.bottom);
    rects.forEach((r) => {
      if (up && r.y + r.h <= row.top) moves[r.id] = { ...moved(r), y: moved(r).y - up };
      if (down && r.y >= row.bottom) moves[r.id] = { ...moved(r), y: moved(r).y + down };
    });
  }
  // room for the lanes
  const entries = shape?.entries || [{ k: cells0[0].k }];
  const tempEdges = [
    ...edges.map((e) => (e.id === line.id ? { ...e, target: tempId(entries[0].k) } : e)),
    ...entries.slice(1).map((en, i) => ({ id: `__in${i}`, source: line.source, target: tempId(en.k) })),
    ...(shape?.links || []).map((l, i) => ({ id: `__l${i}`, source: tempId(l.from), target: tempId(l.to) })),
    ...(shape?.exits || []).map((x, i) => ({ id: `__x${i}`, source: tempId(x.k), target: line.target })),
    ...(shape?.backs || []).map((b, i) => ({ id: `__b${i}`, source: tempId(b.k), target: line.source, loop: true })),
  ];
  const all = [
    ...rects.map((r) => ({ ...r, ...moved(r) })),
    ...cells.map((c) => ({ id: tempId(c.k), x: c.x, y: c.y, w: CARD_W, h: c.h })),
  ];
  const dy = laneRoom(all, tempEdges, loops);
  rects.forEach((r) => { if (dy[r.id]) moves[r.id] = { ...moved(r), y: moved(r).y + dy[r.id] }; });
  cells.forEach((c) => { if (dy[tempId(c.k)]) c.y += dy[tempId(c.k)]; });
  Object.keys(moves).forEach((id) => {
    const r = rects.find((x) => x.id === id);
    if (moves[id].x === r.x && moves[id].y === r.y) delete moves[id];
  });
  return { cells: cells.map(({ k, x, y }) => ({ k, x, y })), moves };
}

// Room for the lanes, since every band must be at least 50 + lanes × LANE_GAP + 40 tall. Where one is
// not, everything in the rows below it moves down by what is missing, never left. Returns
// {id: dy} for the nodes that move.
export function laneRoom(rects, edges, loops = new Set()) {
  const bands = rowBands(rects);
  const lanes = laneIndices(rects, edges, loops);
  const count = [];
  Object.values(lanes).forEach((l) => { if (l.band != null) count[l.band] = Math.max(count[l.band] || 0, l.lane + 1); }); // arcs take no lane
  const dy = {};
  let acc = 0;
  bands.forEach((b, i) => {
    const next = bands[i + 1];
    if (!next) return;
    const need = Math.max(ROW_BAND, 50 + (count[i] || 0) * LANE_GAP + 40);
    acc += Math.max(0, need - (next.top - b.bottom));
    if (acc) rects.filter((r) => r.y >= next.top && r.y <= next.bottom).forEach((r) => { dy[r.id] = acc; });
  });
  return dy;
}
