// A karaoke and live transcript, drawn into any number of boxes at once: one karaoke, the same in every view.
//
//   import { Karaoke } from "./karaoke.js";
//   const karaoke = Karaoke([...document.querySelectorAll(".karaoke")]);   // each box gets the same lines
//   views: [karaoke]                                                        // in ConnectConversation: a view on either mount
//
// It reads only what the press-to-speak and Pipecat voice mounts both give a view: the reply before it is said (botMessage),
// each word at the moment it is said (botWordSaid), the phase, and the person's line as it is recognised (userMessage).
// So it draws the same on both. The voice mount's script turns Pipecat's raw RTVI events into botMessage and botWordSaid.
//
// The assistant's line: the spoken-so-far words bright, the upcoming words dim, advancing word by word in sync with the
// audio. Timing comes from the mount: on Pipecat its bot-output events, one per played word at its true playback
// moment; on press-to-speak the word offsets the server sends with the reply, counted from the start of its audio. One sentence at a time; cleared a second after the assistant stops. The person's line: partials
// overwrite the growing line as they speak; a final fades out after 2.5 s.
// Each box sizes its text to its own width (container query units), never to the window, up to the page's font size, and
// takes the page's colours, so the words contrast with what is behind them in that box:
//   Karaoke(boxes, { botFontSize, botWordsColour, botTextOutline, personFontSize, personWordsColour, personTextOutline })
// The assistant's words not yet said take the assistant's colour mixed a third of the way toward grey: slightly dimmer, less saturated.

const css = `
.karaoke{container-type:inline-size;position:absolute;left:0;right:0;bottom:6px;z-index:2;pointer-events:none;padding:0 8px;text-align:center}
.karaoke .bot{font-weight:700;line-height:1.25;font-size:clamp(11px,4.2cqw,var(--karaoke-bot-font-size,22px));text-shadow:var(--karaoke-bot-text-outline,0 1px 6px #000000a6)}
.karaoke .bot .spoken{color:var(--karaoke-bot-words-colour,#84f5e6)} .karaoke .bot .upcoming{color:color-mix(in oklab,var(--karaoke-bot-words-colour,#84f5e6) 67%,gray)}
.karaoke .user{font-family:ui-monospace,monospace;font-weight:700;font-size:clamp(11px,4.2cqw,var(--karaoke-person-font-size,22px));color:var(--karaoke-person-words-colour,#94ffb7);text-shadow:var(--karaoke-person-text-outline,0 1px 6px #00000099);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;

export function Karaoke(boxes, { botFontSize, botWordsColour, botTextOutline, personFontSize, personWordsColour, personTextOutline } = {}) {
  const pageSettings = {
    "--karaoke-bot-font-size": botFontSize, "--karaoke-bot-words-colour": botWordsColour, "--karaoke-bot-text-outline": botTextOutline,
    "--karaoke-person-font-size": personFontSize, "--karaoke-person-words-colour": personWordsColour, "--karaoke-person-text-outline": personTextOutline,
  };
  for (const box of boxes) for (const [name, value] of Object.entries(pageSettings)) if (value) box.style.setProperty(name, value);
  if (!document.getElementById("karaoke-css")) document.head.append(Object.assign(document.createElement("style"), { id: "karaoke-css", textContent: css }));
  for (const b of boxes) { b.classList.add("karaoke"); b.innerHTML = '<div class="user"></div><div class="bot"><span class="spoken"></span> <span class="upcoming"></span></div>'; }
  let spoken = "", upcoming = "", full = "", boundary = 0, clearTimer = 0, userText = "", userTimer = 0;

  const strip = (t) => t.replace(/\*+/g, "");
  const render = () => {
    // One sentence at a time: the sentence the playback point is in, split at the point.
    let sSpoken = "", sUpcoming = "";
    if (spoken || upcoming) {
      const all = spoken + upcoming, point = spoken.length, ranges = [];
      let s = 0, m; const re = /[.!?]/g;
      while ((m = re.exec(all)) !== null) { ranges.push([s, m.index + 1]); s = m.index + 1; }
      if (s < all.length) ranges.push([s, all.length]);
      const [aStart, aEnd] = [...ranges].reverse().find(([a]) => point > a) || ranges[0] || [0, all.length];
      const cut = Math.max(aStart, Math.min(point, aEnd));
      sSpoken = strip(all.slice(aStart, cut).trim()); sUpcoming = strip(all.slice(cut, aEnd).trim());
    }
    for (const b of boxes) {
      b.querySelector(".spoken").textContent = sSpoken;
      b.querySelector(".upcoming").textContent = sUpcoming;
      b.querySelector(".user").textContent = userText;
    }
  };
  const scheduleClear = () => {
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { spoken = ""; upcoming = ""; full = ""; boundary = 0; render(); }, 1000);
  };

  return {
    // Every method takes what the press-to-speak and Pipecat voice mounts both deliver, so it draws the same on either.
    botMessage(text) {                                  // the reply, or its next sentence, before it is said
      const line = (text || "").toString();
      if (line.trim()) clearTimeout(clearTimer);
      const midPlayback = full && boundary < full.length;
      if (!midPlayback) { full = ""; boundary = 0; }
      full = full ? `${full} ${line}` : line;
      spoken = full.slice(0, boundary); upcoming = full.slice(boundary); render();
    },
    botWordSaid(said) {                                 // a word of it, at the moment it is said
      const word = (said || "").toString().trim();
      if (!word || !full) return;
      const position = full.indexOf(word, boundary);
      boundary = position >= 0 ? position + word.length : Math.min(boundary + word.length + 1, full.length);
      spoken = full.slice(0, boundary); upcoming = full.slice(boundary); render();
    },
    phase(phase) {                                      // the assistant has stopped: its line goes a second later
      if (phase === "listening") scheduleClear();
    },
    userMessage(text, final) {                          // the person's line: interim transcriptions while they speak, then the final one
      const line = (text ?? "").trim();
      if (!line) return;
      clearTimeout(userTimer); userText = line; render();
      if (final !== false) userTimer = setTimeout(() => { userText = ""; render(); }, 2500);
    },
  };
}
