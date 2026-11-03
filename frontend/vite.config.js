// The whole builder's build, `npm run build`, four pages from one source tree into dist/, which the server in
// dialogue_system_builder/app.py serves and which is published with the repository, so running it needs no Node. index.html is the
// editor, viewer.html the flow viewer alone, the same canvas in conversation mode, try.html a testing link's page and
// results.html its testers' conversations. The code they share lands in shared chunks, and public/il/ holds IL's page
// scripts, copied as they are into dist/il/, which the server serves at /il/. The two separable views have builds of their
// own, `npm run build:viewer` with vite.viewer.config.js into dist-viewer/ and `npm run build:chat` with
// vite.chat.config.js into dist-chat/.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync } from "node:fs";

// flow-viewer.js, the embed wrapper, goes beside the built pages in whatever folder the build writes to.
const copyFlowViewerJs = () => { let out; return { name: "flow-viewer-js", configResolved(c) { out = c.build.outDir; }, closeBundle() { copyFileSync("public-flow-viewer.js", `${out}/flow-viewer.js`); } }; };

export default defineConfig({
  plugins: [react(), tailwindcss(), copyFlowViewerJs()],
  build: { rollupOptions: { input: { builder: "index.html", viewer: "viewer.html", try: "try.html", results: "results.html" } } },
  server: { proxy: { "/api": "http://127.0.0.1:8200" } },
});
