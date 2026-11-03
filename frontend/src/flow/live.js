// The live view of a conversation on the flow, which nodes and lines are lit and how a state change and the assistant's
// first words move them, shared by the editor through App.jsx and Conversation.jsx and by the viewer through
// viewer/FlowViewer.jsx. These are pure functions of the store's state, and the caller sets what they return.

// In conversation mode the walked nodes and lines carry is-path, the node the assistant is speaking from is-live, and the
// line IL just took is-crossing. Only what can no longer be reached from where the conversation is (the branches not
// taken) is dimmed; everything still ahead looks exactly as in edit mode.
export function liveIds(live, orderedIds) {
  const liveId = live.index == null ? null : orderedIds[live.index];
  const headId = live.pending == null ? liveId : orderedIds[live.pending];
  return { liveId, headId };
}

export function reachableFrom(headId, edges) {
  if (!headId) return null; // nothing walked yet, so nothing is out of reach
  const seen = new Set();
  const stack = [headId];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    edges.forEach((e) => { if (e.source === id) stack.push(e.target); });
  }
  return seen;
}

// The node's classes, is-live, is-path and is-dim, to which the editor adds has-error and is-hovered.
export function nodeLiveClass(n, { liveId, pathNodes, reachable, editing }) {
  const onPath = pathNodes.has(n.id) || n.id === liveId;
  const dim = !editing && reachable && !onPath && !reachable.has(n.id);
  return [n.id === liveId ? "is-live" : "", onPath ? "is-path" : "", dim ? "is-dim" : ""];
}

// The line's look, "crossing", "path", "dim" or an empty string.
export function edgeLiveVis(e, { crossing, pathEdges, reachable, editing }) {
  const dim = !editing && reachable && !pathEdges.has(e.id) && e.id !== crossing && !reachable.has(e.source);
  return e.id === crossing ? "crossing" : pathEdges.has(e.id) ? "path" : dim ? "dim" : "";
}

// Two separate moments. The state change lands the moment IL moves, before the reply exists, so only the crossed line
// lights then. The node itself lights when the assistant's audio starts there, in the phase "speaking".
export function advancePatch(s, msg) {
  const ids = s.orderedStateIds();
  const toId = msg.step_index == null ? null : ids[msg.step_index];
  const fromId = msg.previous_index == null ? s.nodes.find((n) => n.type === "start")?.id : ids[msg.previous_index];
  const crossed = s.edges.find((e) => e.source === fromId && e.target === toId);
  const path = s.live.path || { nodes: [], edges: [] };
  const nodes = fromId && !path.nodes.includes(fromId) ? [...path.nodes, fromId] : path.nodes;
  const edges = crossed && !path.edges.includes(crossed.id) ? [...path.edges, crossed.id] : path.edges;
  return { pending: msg.step_index, done: !!msg.done, path: { nodes, edges }, crossing: crossed?.id || null };
}

export function speakingPatch(s) {
  const { pending, path } = s.live;
  if (pending == null) return { phase: "speaking" };
  const id = s.orderedStateIds()[pending];
  const nodes = id && !path.nodes.includes(id) ? [...path.nodes, id] : path.nodes;
  return { phase: "speaking", index: pending, pending: null, path: { ...path, nodes } };
}
