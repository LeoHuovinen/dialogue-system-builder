// Helpers for the frame showing a multimodal element. The builder serves each one's index.html from IL's examples
// folder at /multimodal-element/<name>/index.html. try.jsx uses these helpers for the frame above the chat, and
// SharedRuns.jsx for the tiles in the testing link window.

// The address of the index.html for ``name``.
export const multimodalElementPage = (name) => `/multimodal-element/${name}/index.html`;

// Frame height above the chat, per name. Rive characters are drawn whole and get more room than the Plasma animation
// or the VRM character, whose camera shows only head and shoulders.
export const MULTIMODAL_ELEMENT_HEIGHTS = { plasma: "18rem", vrm: "18rem", rive: "22rem" };

// The background colour behind the animation or character, taken from IL's Plasma file.
export const MULTIMODAL_ELEMENT_BACKGROUND = "#1f2937";

// Call from the frame's onLoad. Hides IL's #top (Start button and phase word), .kara (karaoke), #turnlabel (turn label)
// and every select (character menu), because the chat already shows words and phase and testers should not swap
// characters. Also paints the background MULTIMODAL_ELEMENT_BACKGROUND, replacing the Rive file's light grey. Those ids
// come from IL, so an IL change can bring the hidden parts back. Does nothing while the frame is absent or still
// loading.
export function hideExamplePageExtras(frame) {
  const doc = frame?.contentDocument;
  if (!doc?.head) return;
  const style = doc.createElement("style");
  style.textContent = `#top,.kara,#turnlabel,select{display:none!important}html,body{background:${MULTIMODAL_ELEMENT_BACKGROUND}!important}`;
  doc.head.append(style);
}
