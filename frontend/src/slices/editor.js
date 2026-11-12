// The editing part of the store, what the editor's page shows around the design, the selection, the sidebar's panel, the
// findings of a refused Start, the saved conversations, the popups and the hover preview. One of the store's three
// slices, as store.js says. The viewer and the chat read none of it.
import { initialLive } from "./live";

export const editorSlice = (set, get) => ({
  selected: null, // {kind: "node" | "edge", id}
  select: (selected) => set({ selected, panel: selected ? "properties" : "nodes" }),
  panel: "nodes", // in edit mode, the one thing the sidebar shows, "nodes" or "properties"
  setPanel: (panel) => set({ panel }),
  mode: "edit", // "edit" or "conversation", two states of the whole page, never mixed
  startMode: "voice", // how the conversation was started, "voice" with the microphone on and typing too, or "text" with typing only
  setMode: (mode, startMode) => set(mode === "conversation"
    ? { mode, startMode: startMode || "voice", selected: null, live: { ...initialLive } }
    : { mode, panel: "nodes", live: { ...initialLive } }),
  findings: [], // the checks that refused the last press of Start; a node's or line's own go the moment it is edited
  setFindings: (findings) => set({ findings }),
  dropFindings: (ids) => set({ findings: get().findings.filter((f) => !ids.includes(f.node) && !ids.includes(f.edge)) }),
  currentSavedId: null, // the saved conversation the canvas came from; Save overwrites it
  setCurrentSavedId: (currentSavedId) => set({ currentSavedId }),
  saved: [], // the saved conversations of this browser, [{id, savedAt, label, design}]; the sidebar fills it
  setSaved: (saved) => set({ saved }),
  settingsOpen: true, // the conversation's settings section at the top of the sidebar, open or collapsed
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  // The intro popup, open on the first visit of this browser and whenever "?" is pressed. Closing it remembers.
  intro: (() => { try { return !localStorage.getItem("course-intro-seen"); } catch { return true; } })(),
  setIntro: (intro) => { if (!intro) { try { localStorage.setItem("course-intro-seen", "1"); } catch {} } set({ intro }); },
  focusTick: 0, // bumped by a double-click on a node, so the pane focuses its prompt
  openPrompt: (id) => set({ selected: { kind: "node", id }, panel: "properties", focusTick: get().focusTick + 1 }),
  // The page's own confirm popup, never the browser's, {text, resolve} while one is open.
  confirm: null,
  // Opens that popup. ``extra`` may hold ``current`` and ``next``, two designs drawn as thumbnails, and ``dirty``, which
  // adds the buttons Save and open and Don't save. With ``dirty`` the promise resolves to "save", "discard" or false,
  // and without it to true or false.
  askConfirm: (text, extra = {}) => new Promise((resolve) => set({ confirm: { text, resolve, ...extra } })),
  answerConfirm: (ok) => { const c = get().confirm; set({ confirm: null }); c?.resolve(ok); },
  ghost: null, // the hover preview of a placement, what placementPreview returns, or null
  setGhost: (ghost) => set({ ghost }),
});
