// The browser half of PressToSpeakAdapterWebsocketMount. Imported by ConnectConversation.js for way "press".
// The press-to-speak half: the microphone is streamed only between talk(true) and talk(false), as 16 kHz PCM frames on
// the socket between a HoldStart and a HoldEnd message, so the server recognises the speech while it is spoken and the
// incremental phrase analyzers run during the hold. What is heard comes back on every interim transcription (onUserText); the reply comes
// back as its text (onBotText) and then one audio frame, played, measured for onLevel and handed on as a track (onBotTrack); while it plays, each word is
// handed on at the moment it is said (onBotWordSaid), from the timing the server sends with the text.
// Call this from a click or a tap: Safari and iOS play audio and open the microphone only after a user gesture.
export async function Connect(on, { path = "/ws", allowInterrupt = false } = {}) {
  on("onPhase", "connecting");
  const context = new AudioContext();
  const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  // The recorder runs on the audio thread, so a page busy drawing (a VRM, say) cannot make it drop samples.
  await context.audioWorklet.addModule(URL.createObjectURL(new Blob([RECORDER], { type: "text/javascript" })));
  const recorder = new AudioWorkletNode(context, "il-recorder");
  context.createMediaStreamSource(microphone).connect(recorder);
  let holding = false;                               // true between talk(true) and talk(false): every block is sent at once
  recorder.port.onmessage = (m) => { if (holding && socket.readyState === WebSocket.OPEN) socket.send(pcm16k(m.data, context.sampleRate)); };

  const analyser = context.createAnalyser(); analyser.fftSize = 1024;
  analyser.connect(context.destination);
  const botAudio = context.createMediaStreamDestination(); analyser.connect(botAudio);   // the assistant's audio as a track too, as Pipecat gives it
  on("onBotTrack", botAudio.stream.getAudioTracks()[0]);
  const samples = new Uint8Array(analyser.fftSize);
  let level = 0, playing = null, speaking = false;
  let replyWords = [], wordTimers = [];             // the reply's words with their offsets into its audio, and their timers
  (function measure() {
    analyser.getByteTimeDomainData(samples);
    let sum = 0; for (const v of samples) { const x = (v - 128) / 128; sum += x * x; }
    level = level * 0.7 + Math.min(1, Math.sqrt(sum / samples.length) * 6) * 0.3;
    on("onLevel", level);
    requestAnimationFrame(measure);
  })();

  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${scheme}://${location.host}${path}`);
  socket.binaryType = "arraybuffer";
  socket.onmessage = async (m) => {
    if (typeof m.data !== "string") {               // the reply's audio
      const buffer = await context.decodeAudioData(m.data);
      playing = context.createBufferSource(); playing.buffer = buffer; playing.connect(analyser);
      playing.onended = () => { playing = null; speaking = false; on("onPhase", "listening"); };
      speaking = true; on("onPhase", "speaking"); playing.start();
      wordTimers = replyWords.map((word) => setTimeout(() => on("onBotWordSaid", word.text), word.offset_ms || 0)); replyWords = [];
      return;
    }
    const event = JSON.parse(m.data);
    if (event.log) { window.dispatchEvent(new CustomEvent(event.log === "event" ? "RecordedEventLog" : "AdapterCallbackLog", { detail: event })); return; }   // the log stream, to ./log.js, never to the page
    if (event.type === "PressToSpeakHeardText") { on("onUserText", event.text, event.final); if (event.final && !event.text) on("onPhase", "listening"); return; }
    if (event.type === "PressToSpeakReplyText") { if (event.text) { on("onBotText", event.text); replyWords = event.words || []; } speaking = event.audio; if (!event.audio) on("onPhase", "listening"); return; }
    on("onAdapterCallback", event);
  };
  socket.onclose = () => { microphone.getTracks().forEach((t) => t.stop()); on("onPhase", "closed"); };
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  on("onPhase", "thinking");                         // the assistant opens; its first words are on their way

  const talk = (open) => {
    if (open) {
      if (holding) return;
      if (speaking && !allowInterrupt) return;       // the assistant is never spoken over unless the page allows it
      if (playing) { playing.onended = null; playing.stop(); playing = null; speaking = false; wordTimers.forEach(clearTimeout); wordTimers = []; }
      context.resume(); socket.send(JSON.stringify({ type: "PressToSpeakHoldStart" })); holding = true; on("onPhase", "listening");
      return;
    }
    if (!holding) return;
    holding = false; socket.send(JSON.stringify({ type: "PressToSpeakHoldEnd" })); on("onPhase", "thinking");
  };
  return {
    sendText: (text) => { socket.send(text); on("onPhase", "thinking"); },
    talk,
    close: () => socket.close(),
  };
}

// The audio-thread half of the recorder: every block of microphone samples, posted to the page as it comes.
const RECORDER = `registerProcessor("il-recorder", class extends AudioWorkletProcessor {
  process(inputs) { if (inputs[0]?.[0]) this.port.postMessage(inputs[0][0].slice()); return true; }
});`;

// One block of float samples at the context's rate to 16 kHz, 16-bit, mono PCM, the frame the streaming recognizer takes.
function pcm16k(block, rate) {
  const step = rate / 16000, count = Math.floor(block.length / step);
  const view = new DataView(new ArrayBuffer(count * 2));
  for (let i = 0; i < count; i++) {                 // the mean of each step's samples, so nothing above 8 kHz folds back
    const from = Math.floor(i * step), to = Math.max(from + 1, Math.floor((i + 1) * step));
    let sum = 0; for (let j = from; j < to; j++) sum += block[j];
    const x = Math.max(-1, Math.min(1, sum / (to - from)));
    view.setInt16(i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return view.buffer;
}
