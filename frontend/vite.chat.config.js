// The chat alone, as the testing link's tester page shows it, for embedding beside the flow viewer or anywhere else.
// `npm run build:chat` writes dist-chat/ with chat.html, its assets and flow-chat.js, and vite.config.js lists the other
// builds.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync } from "node:fs";

// flow-chat.js, the embed wrapper, goes beside the built page in whatever folder the build writes to.
const copyFlowChatJs = () => { let out; return { name: "flow-chat-js", configResolved(c) { out = c.build.outDir; }, closeBundle() { copyFileSync("public-flow-chat.js", `${out}/flow-chat.js`); } }; };

export default defineConfig({
  base: "./",
  publicDir: false,   // IL's page scripts are for the whole builder, and a page embedding this has its own
  plugins: [react(), tailwindcss(), copyFlowChatJs()],
  build: { outDir: "dist-chat", emptyOutDir: true, rollupOptions: { input: "chat.html" } },
});
