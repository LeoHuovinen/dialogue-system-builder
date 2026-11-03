// The live part of the store, where a running conversation stands on the flow. One of the store's three slices, as
// store.js says. Written from IL's adapter callbacks and phases, by Conversation.jsx and the viewer, through the pure
// functions in flow/live.js.

// index = the state whose node is lit; pending = the state IL has moved to whose node lights when its reply starts;
// done = the conversation is in an End step; answers = what the question checker accepted; path = the nodes and lines
// walked so far; crossing = the line just taken; phase = listening | thinking | speaking | idle.
export const initialLive = { index: null, pending: null, done: false, answers: [], path: { nodes: [], edges: [] }, crossing: null, phase: "idle" };

export const liveSlice = (set, get) => ({
  live: { ...initialLive },
  setLive: (patch) => set({ live: { ...get().live, ...patch } }),
});
