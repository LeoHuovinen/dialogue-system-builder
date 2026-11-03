// The server's answers to the editor's calls, each function calling one route of dialogue_system_builder/app.py and returning its
// JSON, or throwing the server's error text. The server checks a design at /api/validate, designs one from a description
// at /api/generate, lists voices at /api/voices, says what it can start at /api/capabilities, and compiles a flow file at
// /api/flow. Saved conversations live in this browser's localStorage only, as Sidebar.jsx says.
async function json(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status}`);
  return body;
}

export const api = {
  voices: () => fetch(`/api/voices`).then(json),
  generate: (description) =>
    fetch(`/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }) }).then(json),
  // mode "voice" needs a voice chosen, and mode "text" does not. quick leaves out IL's session start.
  validate: (design, mode = "voice", quick = false) =>
    fetch(`/api/validate?mode=${mode}${quick ? "&quick=1" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(design) }).then(json),
  // What the server can start, as {voice, text}. A server run on text alone answers false for voice.
  capabilities: () => fetch(`/api/capabilities`).then(json),
  // The design as IL's flow, as a file, returning the Response so the caller can save the blob.
  flow: (design) =>
    fetch(`/api/flow`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(design) }),
};
