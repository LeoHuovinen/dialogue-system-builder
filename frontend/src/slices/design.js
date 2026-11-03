// The design part of the store, the conversation on the canvas, its nodes, lines and settings, and every edit of them.
// One of the store's three slices, beside slices/editor.js and slices/live.js, as store.js says. The viewer reads this
// slice's nodes and lines, and only the editor changes them.
import { addEdge, applyEdgeChanges, applyNodeChanges } from "@xyflow/react";
import { NodeType, defaultDataOf, newId, orderedStateIdsOf } from "../registry";
import { applyShape, placementPreview } from "../flow/shapes";

const makeNode = (type, position) => ({ id: newId(type), type, position, data: defaultDataOf(type) });
const newLineData = (rank) => ({ when: "exchanges", turns: 1, sentence: "", rank });

const start = makeNode(NodeType.START, { x: 0, y: 100 });
const step = makeNode(NodeType.STEP, { x: 300, y: 50 });
const end = makeNode(NodeType.END, { x: 900, y: 100 });

export const designSlice = (set, get) => ({
  title: "Untitled conversation",
  style: "",
  memory: true,
  voice: "", // the TTS voice by Azure short name
  nodes: [start, step, end],
  edges: [
    { id: newId("e"), source: start.id, target: step.id, type: "deletable", data: {} },
    { id: newId("e"), source: step.id, target: end.id, type: "deletable", data: newLineData(0) },
  ],
  fitTick: 0, // bumped when the canvas should zoom out to show everything
  // The measured heights of the cards on the canvas, published by flow/useMeasuredHeights.js, so the layout works with
  // real sizes; anything unmeasured is estimated from its text.
  measured: {},
  setMeasured: (measured) => set({ measured }),

  // Choosing a voice clears the finding that asked for one the moment it is chosen, like a node's own.
  setDesignField: (name, value) => set({ [name]: value,
    findings: name === "voice" && value ? get().findings.filter((f) => f.code !== "choose-voice") : get().findings }),
  orderedStateIds: () => orderedStateIdsOf(get().nodes, get().edges),

  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (connection) => {
    const { nodes, edges } = get();
    const source = nodes.find((n) => n.id === connection.source);
    const rank = edges.filter((e) => e.source === connection.source).length;
    get().dropFindings([connection.source, connection.target]);
    set({ edges: addEdge({ ...connection, id: newId("e"), type: "deletable", data: source?.type === NodeType.START ? {} : newLineData(rank) }, edges) });
  },
  isValidConnection: (c) => {
    const { nodes, edges } = get();
    if (!c.source || !c.target || c.source === c.target) return false;
    const source = nodes.find((n) => n.id === c.source);
    if (!source || source.type === NodeType.END) return false;
    return !(source.type === NodeType.START && edges.some((e) => e.source === c.source));
  },
  // A line dragged from a node's handle and released on empty canvas makes a new empty node appear there, connected from
  // that node, or, dragged from an End, another End joined to nothing. Start takes exactly one line out.
  addNodeAt: (position, fromId) => {
    const { nodes, edges } = get();
    const from = nodes.find((n) => n.id === fromId);
    if (!from) return;
    if (from.type === NodeType.END) {
      set({ nodes: [...nodes, makeNode(NodeType.END, { x: position.x, y: position.y - 24 })] });
      return;
    }
    if (from.type === NodeType.START && edges.some((e) => e.source === from.id)) return;
    const node = makeNode(NodeType.STEP, { x: position.x, y: position.y - 40 });
    const data = from.type === NodeType.START ? {} : newLineData(edges.filter((e) => e.source === from.id).length);
    get().dropFindings([from.id]);
    set({ nodes: [...nodes, node], edges: [...edges, { id: newId("e"), source: from.id, target: node.id, type: "deletable", data }],
      selected: { kind: "node", id: node.id }, panel: "properties", focusTick: get().focusTick + 1 });
  },
  placementPreview: (placement, shape) => placementPreview(get(), placement, shape),
  addShape: (shape, placement) => {
    const applied = applyShape(get(), shape, placement);
    if (!applied) return;
    get().dropFindings(applied.touched);
    set({ nodes: applied.nodes, edges: applied.edges, selected: { kind: "node", id: applied.focus }, panel: "properties", ghost: null,
      focusTick: get().focusTick + 1, fitTick: get().fitTick + 1 });
  },
  updateNodeData: (id, patch) => {
    get().dropFindings([id]);
    set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) });
  },
  // Start can never be deleted. An End can go while another End remains, and the last End never can.
  deleteNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node || node.type === NodeType.START) return;
    if (node.type === NodeType.END && get().nodes.filter((n) => n.type === NodeType.END).length < 2) return;
    get().dropFindings([id, ...get().edges.filter((e) => e.target === id).map((e) => e.source)]);
    set({ nodes: get().nodes.filter((n) => n.id !== id), edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selected: null, panel: "nodes" });
  },
  updateEdgeData: (id, patch) => {
    get().dropFindings([id]);
    set({ edges: get().edges.map((e) => (e.id === id ? { ...e, data: { ...(e.data || {}), ...patch } } : e)) });
  },
  deleteEdge: (id) => {
    get().dropFindings([id, get().edges.find((e) => e.id === id)?.source]);
    set({ edges: get().edges.filter((e) => e.id !== id), selected: null, panel: "nodes" });
  },

  // The design as the server, the saved conversations and Export design all take it.
  toDesign: () => {
    const { title, style, memory, voice, nodes, edges } = get();
    return { title, style, memory, voice: voice || "",
      nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
      edges: edges.map(({ id, source, target, data }) => ({ id, source, target, type: "deletable", data: data || {} })) };
  },
  loadDesign: (design) => {
    if (!design || !Array.isArray(design.nodes)) return;
    set({ fitTick: get().fitTick + 1,
      currentSavedId: null, // a loaded design is nobody's saved copy until the sidebar says which
      title: design.title || "Untitled conversation", style: design.style || "", memory: design.memory !== false,
      voice: typeof design.voice === "string" ? design.voice : "",
      nodes: design.nodes.map((n) => ({ ...n, data: { ...defaultDataOf(n.type), ...(n.data || {}) } })),
      edges: (design.edges || []).map((e) => ({ ...e, type: "deletable", data: e.data || {} })),
      selected: null, panel: "nodes" });
  },
});
