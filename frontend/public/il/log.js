// The two log streams in the browser console: one import on any page, nothing on the page itself. Each mount's browser
// script hands every log line it receives (on the mount's own socket marked log, or over WebRTC as an RTVI server message)
// to the window as one of two events, never as one: RecordedEventLog for the recorded events (the save of the cards, with
// turns, streams and prompt) and AdapterCallbackLog for the adapter callbacks (state changes, answered questions,
// incremental phrase picks). They are different things and drive different things; each is printed on its own.
window.addEventListener("RecordedEventLog", (m) => console.log("%c[recorded event]", "color:#1a7f37;font-weight:bold", m.detail.type, m.detail));
window.addEventListener("AdapterCallbackLog", (m) => console.log("%c[adapter callback]", "color:#0969da;font-weight:bold", m.detail.type, m.detail));
