// The browser half of the adapter mounts, over the way the page names. A page gives its two message handlers and names
// what it has; the script does the wiring. Nothing is fetched: the way is named on the page.
//
//   import { ConnectConversation } from "./ConnectConversation.js";
//   ConnectConversation({
//     way: "text",                                  // "text" (the text mount), "press" (the press-to-speak mount), "voice" (the Pipecat voice mount)
//     onUserMessage: (text) => ...,                 // the user's line, when the session takes it
//     onBotMessage: (text) => ...,                  // the assistant's reply; on the Pipecat voice mount one whole sentence at a time
//     input: "#box",                                // every mount: an input whose Enter sends the typed line
//     talk: "#talk",                                // press-to-speak mount: a button that records the microphone while it is held
//     clickTalk: "#click-talk",                     // press-to-speak mount: a button that records from one click to the next
//     phase: "#phase",                              // press-to-speak and Pipecat voice mounts: an element whose text follows the phase
//     phaseClass: "body",                           // press-to-speak and Pipecat voice mounts: an element whose class follows the phase
//     level: "#orb",                                // press-to-speak and Pipecat voice mounts: an element whose CSS variable --level follows the assistant's audio level, 0..1
//     views: [pictures, plasma, label],             // view objects; each method below is called when the object has it
//   });
//
// What each mount gives a page, each the whole of the one before and more:
//   the text mount:            views get start(), adapterCallback(dict) (state changes, answered questions,
//                              incremental phrases; never messages), userMessage(text, final) and botMessage(text); the
//                              connection has sendText(text) and close().
//   the press-to-speak mount:  all of that, and phase(p) (listening | thinking | speaking), level(l) (the assistant's audio
//                              level, 0..1), track(mediaStreamTrack) (the assistant's audio), botWordSaid(word) (each word of
//                              the reply at the moment it is said), and talk(open) on the connection.
//   the Pipecat voice mount:   all of that, and rtvi(name, data) (the raw RTVI events).
// So a page written for one mount runs on every mount after it. On the press-to-speak and Pipecat voice mounts typed text
// and speech are one thing: a typed line joins the speech into the turn being spoken, or the one waiting
// for the assistant to finish, and the two go to the session as one turn.
// The log streams (recorded events and adapter callbacks, each on its own) never reach a page; import ./log.js to print them
// in the console. On the press-to-speak and Pipecat voice mounts, call ConnectConversation from a click or a tap: Safari and
// iOS play audio and open the microphone only after a user gesture.
// Other options: expect (the way the page was written for; a mismatch is warned in the console), path (text and
// press-to-speak mounts: the socket's path, default /ws), hello (text mount: a JSON message sent first), allowInterrupt
// (press-to-speak mount: a new press stops the assistant's playback), pushToTalk (Pipecat voice mount: the microphone is open only
// while talk(true)), requestData (Pipecat voice mount: a JSON object sent with the offer). A mobile app, a robot or
// any other client speaks the wire directly; the mounts' docstrings give it.

const MOUNT_SCRIPTS = {                              // one browser script per mount, beside this one in the page's folder
  text: "./TextAdapterWebsocketMount.js",
  press: "./PressToSpeakAdapterWebsocketMount.js",
  voice: "./PipecatVoiceAdapterWebRtcMount.js",
};

export async function ConnectConversation(page = {}) {
  const el = (x) => (typeof x === "string" ? document.querySelector(x) : x || null);
  const views = page.views || [];
  const each = (method, ...args) => views.forEach((v) => { try { v[method]?.(...args); } catch (e) { console.warn(method, e); } });
  const phase = el(page.phase), phaseClass = el(page.phaseClass), level = el(page.level);
  // The two microphone buttons: hold to speak (talk), and click to start, click again to finish (clickTalk). Both show
  // "Loading…" and are greyed out from Start until the mount first listens (the assistant's opening has been spoken, or there was
  // none), so no recording starts before the opening and gets talked over by it. While the assistant speaks a press would be ignored, so both are greyed out then; each is
  // greyed out while the other one is in use. A button in use is never greyed out under the person's finger.
  const holdButton = el(page.talk), clickButton = el(page.clickTalk);
  const microphone = { ready: false, botSpeaking: false, holding: false, clicked: false };
  const refreshButtons = () => {
    const loading = !microphone.ready;
    if (holdButton) {
      holdButton.disabled = loading || (!microphone.holding && (microphone.botSpeaking || microphone.clicked));
      holdButton.textContent = loading ? "Loading…" : microphone.holding ? "Release to send" : "Hold to speak";
    }
    if (clickButton) {
      clickButton.disabled = loading || (!microphone.clicked && (microphone.botSpeaking || microphone.holding));
      clickButton.textContent = loading ? "Loading…" : microphone.clicked ? "Click to finish" : "Click to speak";
    }
  };
  refreshButtons();
  const handlers = {
    onUserText: (text, final) => { if (final !== false) page.onUserMessage?.(text); each("userMessage", text, final); },
    onBotText: (text) => { microphone.botSpeaking = true; refreshButtons(); page.onBotMessage?.(text); each("botMessage", text); },   // its audio follows at once
    onPhase: (p) => { if (phase) phase.textContent = p; if (phaseClass) phaseClass.className = p; microphone.botSpeaking = p === "speaking"; if (p === "listening") microphone.ready = true; refreshButtons(); each("phase", p); },
    onLevel: (l) => { if (level) level.style.setProperty("--level", l); each("level", l); },
    onBotTrack: (track) => each("track", track),
    onRtvi: (name, data) => each("rtvi", name, data),
    onAdapterCallback: (callback) => each("adapterCallback", callback),
    onBotWordSaid: (word) => each("botWordSaid", word),
    onWarning: (text) => console.warn(text),
  };
  const on = (name, ...args) => { try { handlers[name]?.(...args); } catch (e) { console.warn(name, e); } };
  const way = page.way || page.expect || "text";
  if (page.expect && page.expect !== way) on("onWarning", `this page is set for the ${page.expect} way, but names ${way}`);
  // Inside examples/8-side-by-side the parent page holds the one connection, and this page joins it instead of opening its own.
  const sideBySide = (() => { try { return window.parent !== window ? window.parent.SideBySideConversation : null; } catch { return null; } })();
  const mount = sideBySide || await import(MOUNT_SCRIPTS[way] || MOUNT_SCRIPTS.text);
  const conversation = await mount.Connect(on, page);   // the press-to-speak mount and the Pipecat voice mount connect asynchronously
  const input = el(page.input);
  if (input) input.onchange = () => { conversation.sendText(input.value); input.value = ""; };
  if (holdButton) {                                  // the microphone is recorded only while the button is held
    for (const down of ["mousedown", "touchstart"]) holdButton.addEventListener(down, (ev) => {
      ev.preventDefault(); if (holdButton.disabled || microphone.holding) return;
      microphone.holding = true; refreshButtons(); conversation.talk(true);
    });
    for (const up of ["mouseup", "mouseleave", "touchend"]) holdButton.addEventListener(up, () => {
      if (!microphone.holding) return;
      microphone.holding = false; refreshButtons(); conversation.talk(false);
    });
  }
  if (clickButton) clickButton.addEventListener("click", () => {   // the microphone is recorded from one click to the next
    microphone.clicked = !microphone.clicked; refreshButtons(); conversation.talk(microphone.clicked);
  });
  each("start");
  return conversation;
}
