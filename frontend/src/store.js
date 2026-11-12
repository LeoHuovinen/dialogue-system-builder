// The page's one store, made of three slices. slices/design.js holds the conversation on the canvas, slices/editor.js
// what the editor shows around it, and slices/live.js where a running conversation stands. The rules they share are
// pure functions, in registry.js for the design's data, in flow/shapes.js for adding a shape, and in flow/live.js for
// the live view. The editor, the viewer and a testing link's page all import this store, and the chat does not.
import { create } from "zustand";
import { designSlice } from "./slices/design";
import { editorSlice } from "./slices/editor";
import { liveSlice } from "./slices/live";

export const useStore = create((set, get) => ({
  ...designSlice(set, get),
  ...editorSlice(set, get),
  ...liveSlice(set, get),
}));

// The starting canvas counts as unchanged until it is edited.
useStore.getState().markClean();
