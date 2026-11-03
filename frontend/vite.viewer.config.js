// The flow viewer alone, for embedding elsewhere, with no sidebar, no editor and no Pipecat client, from the same source
// tree as the builder. `npm run build:viewer` writes dist-viewer/ with viewer.html, its assets and flow-viewer.js, and
// vite.config.js lists the other builds.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync } from "node:fs";

// flow-viewer.js, the embed wrapper, goes beside the built pages in whatever folder the build writes to.
const copyFlowViewerJs = () => { let out; return { name: "flow-viewer-js", configResolved(c) { out = c.build.outDir; }, closeBundle() { copyFileSync("public-flow-viewer.js", `${out}/flow-viewer.js`); } }; };

export default defineConfig({
  base: "./",
  publicDir: false,   // IL's page scripts are for the whole builder, and a page embedding this has its own
  plugins: [react(), tailwindcss(), copyFlowViewerJs()],
  build: { outDir: "dist-viewer", emptyOutDir: true, rollupOptions: { input: "viewer.html" } },
});
