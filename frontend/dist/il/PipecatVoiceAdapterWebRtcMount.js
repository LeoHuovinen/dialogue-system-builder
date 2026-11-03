// The browser half of PipecatVoiceAdapterWebRtcMount: the Pipecat client over WebRTC, its RTVI events turned into
// the callbacks. Imported by ConnectConversation.js for way "voice". Everything the text and press-to-speak mounts give a
// page, this gives too: typed turns (sendText, an RTVI client message of type "user"), the person's line, the assistant's reply
// sentence by sentence, each word as it is said (onBotWordSaid), the phase and the level; and beyond them the assistant's audio
// track and the raw RTVI events.
// The Pipecat client, bundled beside this script in the page's folder, so a page needs no internet beyond the server.
const PIPECAT_CLIENT = "./pipecat-client.js";

// Call this from a click or a tap: Safari and iOS play audio and open the microphone only after a user gesture.
export async function Connect(on, { pushToTalk = false, requestData = null } = {}) {
  const { PipecatClient, RTVIEvent, SmallWebRTCTransport } = await import(PIPECAT_CLIENT);
  const client = new PipecatClient({
    // requestData goes with the offer and reaches the server's choose(body), which may pick this session's conversation and voice.
    transport: new SmallWebRTCTransport({ webrtcRequestParams: { endpoint: `${location.origin}/api/offer`, ...(requestData ? { requestData } : {}) } }),
    enableMic: !pushToTalk, enableCam: false,      // push to talk: the microphone stays closed until talk(true)
  });
  client.on(RTVIEvent.TrackStarted, (track, participant) => {
    if (participant?.local || track.kind !== "audio") return;
    on("onBotTrack", track);
    const stream = new MediaStream([track]);
    const audio = new Audio(); audio.srcObject = stream; audio.play().catch(() => {});
    const context = new AudioContext();
    const analyser = context.createAnalyser(); analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let level = 0;
    (function measure() {
      analyser.getByteTimeDomainData(samples);
      let sum = 0; for (const v of samples) { const x = (v - 128) / 128; sum += x * x; }
      level = level * 0.7 + Math.min(1, Math.sqrt(sum / samples.length) * 6) * 0.3;
      on("onLevel", level);
      requestAnimationFrame(measure);
    })();
  });
  client.on(RTVIEvent.BotReady, () => on("onPhase", "listening"));
  client.on(RTVIEvent.UserStartedSpeaking, () => on("onPhase", "listening"));
  client.on(RTVIEvent.UserStoppedSpeaking, () => on("onPhase", "thinking"));
  client.on(RTVIEvent.BotStartedSpeaking, () => on("onPhase", "speaking"));
  client.on(RTVIEvent.BotStoppedSpeaking, () => on("onPhase", "listening"));
  client.on(RTVIEvent.Disconnected, () => on("onPhase", "closed"));
  client.on(RTVIEvent.UserTranscript, (d) => on("onUserText", d?.text ?? "", !!d?.final));   // every interim transcription, final flagged, as the press-to-speak script does
  const sentencesShown = new Set();                 // the assistant's reply as whole sentences, each once: bot-output carries every
  const wordsSaidPerSentence = new Map();           // sentence with its segment_id, again as its words are spoken; bot-tts-text carries single words
  client.on(RTVIEvent.BotOutput, (d) => {
    // Each word as it is said: the word events of the older RTVI protocol, or the said-so-far text of the newer one.
    if (d?.aggregated_by === "word" && d?.spoken === true && d?.text) { on("onBotWordSaid", String(d.text).trim()); return; }
    const saidSoFar = ["in-progress", "completed"].includes(d?.spoken_status) ? d?.spoken_progress?.accumulated_text : null;
    if (saidSoFar != null && sentencesShown.has(d.segment_id)) {
      const words = saidSoFar.trim().split(/\s+/).filter(Boolean), before = wordsSaidPerSentence.get(d.segment_id) || 0;
      words.slice(before).forEach((word) => on("onBotWordSaid", word)); wordsSaidPerSentence.set(d.segment_id, words.length);
      return;
    }
    if (d?.aggregated_by !== "sentence" || !d?.text || sentencesShown.has(d.segment_id)) return;
    sentencesShown.add(d.segment_id); on("onBotText", d.text);
  });
  client.on(RTVIEvent.ServerMessage, (m) => { const d = m?.data ?? m; if (d?.type === "PipecatVoiceHeardText") { on("onUserText", d.text, true); return; } if (d?.log) window.dispatchEvent(new CustomEvent(d.log === "event" ? "RecordedEventLog" : "AdapterCallbackLog", { detail: d })); else on("onAdapterCallback", d); });   // log lines to ./log.js, the rest to the page
  // Every RTVI event as it comes, by name, for a page that keeps its own turn logic and needs the
  // partial transcripts and the TTS events, which the phases above fold away.
  for (const name of ["UserStartedSpeaking", "UserStoppedSpeaking", "UserTranscript", "BotStartedSpeaking", "BotStoppedSpeaking",
                      "BotOutput", "BotTtsText", "BotTtsStarted", "BotTtsStopped", "ServerMessage"])
    if (RTVIEvent[name]) client.on(RTVIEvent[name], (data) => on("onRtvi", name, data));
  on("onPhase", "connecting");
  await client.connect();
  return {
    sendText: (text) => { client.sendClientMessage("user", { text }); on("onPhase", "thinking"); },   // a typed turn, over WebRTC
    talk: (open) => client.enableMic(!!open),       // push to talk: open the microphone while a button is held
    close: () => client.disconnect(),
  };
}

