// The editor's three popups, the microphone check before a voice conversation, the page's own confirm, and the intro to
// the main menu. Imported by App.jsx, and each reads the store or takes its callbacks and holds no conversation.
import { useEffect, useRef, useState } from "react";
import { useStore } from "./store";

// The popup before a voice conversation, a small microphone check. An AnalyserNode over getUserMedia gives the root mean
// square of the time-domain samples, and speaking is above 0.045 for a few frames in a row. Start unlocks once the
// microphone has been heard, and the check's microphone and audio context are released before the real session opens its
// own, because two holders of the microphone kill the connection.
const RMS_SPEAKING = 0.045;
export function VoiceStartDialog({ onStart, onCancel }) {
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const [micError, setMicError] = useState("");
  const stopRef = useRef(null);
  useEffect(() => {
    let raf = 0, over = 0, stopped = false;
    (async () => {
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch { setMicError("The microphone could not be opened."); return; }
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        if (stopped) return;
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        setLevel(rms);
        if (rms > RMS_SPEAKING) { if (++over >= 4) setHeard(true); } else over = 0;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      stopRef.current = () => {
        stopped = true;
        cancelAnimationFrame(raf);
        if (ctx.state !== "closed") ctx.close().catch(() => {});   // close() is a promise, and the context may already be closed
        stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      };
    })();
    return () => stopRef.current?.();
  }, []);
  const start = () => { stopRef.current?.(); onStart(); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "var(--scrim)" }} data-testid="voice-dialog">
      <div className="flex w-96 flex-col gap-4 border p-5" style={{ background: "var(--dialog)", borderColor: "var(--line)" }}>
        <div className="text-base font-medium">Start with voice</div>
        <div>
          <div className="mb-1 text-xs muted">Microphone</div>
          <div className="h-3 w-full" style={{ background: "rgb(27,27,27)" }}>
            <div className="h-3" style={{ width: `${Math.min(100, (level / 0.15) * 100)}%`, background: level > RMS_SPEAKING ? "rgb(45,212,191)" : "rgb(90,90,90)", transition: "width 60ms linear" }} data-testid="mic-level" />
          </div>
          <div className="mt-1 text-xs" style={{ color: micError ? "var(--error)" : heard ? "rgb(45,212,191)" : "rgba(253,253,253,.6)" }} data-testid="mic-status">
            {micError || (heard ? "Microphone works." : "Say a few words…")}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn text-sm" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-teal text-sm" onClick={start} disabled={!heard} style={{ opacity: heard ? 1 : 0.5 }} data-testid="voice-start">Start</button>
        </div>
      </div>
    </div>
  );
}

// A design drawn small, one solid grey box per node at its stored position and one grey line per edge, from the right
// side of its source to the left side of its target as on the canvas. The design stores no sizes, so the boxes are the
// typical sizes of each kind.
const THUMB_SIZE = { start: [120, 48], end: [120, 48], step: [240, 110] };
export function FlowThumb({ design, label }) {
  const nodes = (design?.nodes || []).filter((n) => n?.position);
  const size = (n) => THUMB_SIZE[n.type] || THUMB_SIZE.step;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const xs = nodes.flatMap((n) => [n.position.x, n.position.x + size(n)[0]]);
  const ys = nodes.flatMap((n) => [n.position.y, n.position.y + size(n)[1]]);
  const pad = 40;
  const box = nodes.length
    ? [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad]
    : [0, 0, 100, 100];
  return (
    <figure className="flex flex-col items-center gap-1" data-testid="flow-thumb">
      <svg width="160" height="100" viewBox={box.join(" ")} preserveAspectRatio="xMidYMid meet"
        className="rounded-lg border" style={{ borderColor: "var(--line)", background: "rgb(31,31,31)" }}>
        {(design?.edges || []).map((e) => {
          const a = byId[e.source], b = byId[e.target];
          if (!a || !b) return null;
          const [sx, sy] = [a.position.x + size(a)[0], a.position.y + size(a)[1] / 2];
          const [tx, ty] = [b.position.x, b.position.y + size(b)[1] / 2];
          const bend = Math.max(40, Math.abs(tx - sx) / 2);
          return <path key={e.id} d={`M${sx},${sy} C${sx + bend},${sy} ${tx - bend},${ty} ${tx},${ty}`}
            fill="none" stroke="rgb(150,150,150)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />;
        })}
        {nodes.map((n) => (
          <rect key={n.id} x={n.position.x} y={n.position.y} width={size(n)[0]} height={size(n)[1]} rx="14" fill="rgb(105,105,105)" />
        ))}
      </svg>
      {label && <figcaption className="text-xs muted">{label}</figcaption>}
    </figure>
  );
}

// The page's own confirm popup, in the same style as the voice popup; never the browser's. Before the canvas is replaced
// it shows the current canvas and the design that replaces it as thumbnails, and when the canvas has unsaved changes it
// offers to save them first.
export function ConfirmDialog() {
  const confirm = useStore((s) => s.confirm);
  const answerConfirm = useStore((s) => s.answerConfirm);
  if (!confirm) return null;
  const thumbs = confirm.current && confirm.next;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "var(--scrim)" }} data-testid="confirm-dialog">
      <div className={`flex ${thumbs ? "w-[28rem]" : "w-96"} flex-col gap-4 border p-5`} style={{ background: "var(--dialog)", borderColor: "var(--line)" }}>
        <div className="text-sm">{confirm.text}</div>
        {thumbs && (
          <div className="flex items-center justify-center gap-3" data-testid="confirm-thumbs">
            <FlowThumb design={confirm.current} label="On the canvas now" />
            <span className="muted" aria-hidden="true">→</span>
            <FlowThumb design={confirm.next} label="Opening" />
          </div>
        )}
        {confirm.dirty && <div className="text-xs muted" data-testid="confirm-unsaved">The canvas has changes that are not saved.</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn text-sm" onClick={() => answerConfirm(false)} data-testid="confirm-cancel">Cancel</button>
          {confirm.dirty ? (
            <>
              <button type="button" className="btn text-sm" onClick={() => answerConfirm("discard")} data-testid="confirm-discard">Don't save</button>
              <button type="button" className="btn btn-teal text-sm" onClick={() => answerConfirm("save")} data-testid="confirm-save">Save and open</button>
            </>
          ) : (
            <button type="button" className="btn btn-teal text-sm" onClick={() => answerConfirm(true)} data-testid="confirm-ok">OK</button>
          )}
        </div>
      </div>
    </div>
  );
}

// The main menu's sections, each with its colour and at most six words. The intro popup lists
// them, and while it is open each section on the sidebar is outlined in its colour (styles.css,
// under [data-intro="1"]).
const INTRO_ITEMS = [
  { key: "voice", name: "Voice settings", color: "rgb(181,174,201)", text: "The voice and the system prompt. Choose a voice and write how it speaks." },
  { key: "add", name: "Add a node", color: "rgb(182,167,129)", text: "Insert a node or branch shape. Pick the line the new node goes after." },
  { key: "describe", name: "Describe a conversation", color: "rgb(137,171,185)", text: "Write prompt to AI conversation designer, get a whole design. Confirm to replace the current design.",
    bold: "This is the best place to start, try out any conversational idea here." },
  { key: "templates", name: "Conversation templates", color: "rgb(196,164,181)", text: "Load a ready made example. Each one replaces the current design after a confirm." },
  { key: "saved", name: "Saved conversations", color: "rgb(152,169,125)", text: "Keep designs in this browser. Save the current design or save it as new." },
  { key: "start", name: "Start", color: "rgb(123,165,160)", text: "Run the conversation, voice or text. The conversation goes exactly as designed." },
];

// The intro popup, 800px wide, over the canvas only so the glowing sidebar stays in view. A click
// anywhere outside its box, the dimmed canvas or the sidebar alike, closes it.
export function IntroDialog() {
  const setIntro = useStore((s) => s.setIntro);
  const boxRef = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setIntro(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [setIntro]);
  return (
    <div className="fixed inset-y-0 left-0 z-50 flex items-center justify-center" style={{ right: "26rem", background: "var(--scrim)" }} data-testid="intro-dialog">
      <div ref={boxRef} className="flex flex-col gap-4 border p-5" style={{ width: 800, maxWidth: "calc(100% - 2rem)", background: "var(--dialog)", borderColor: "var(--line)" }}>
        <div className="text-base font-medium">The main menu, on the right</div>
        <ul className="flex flex-col" style={{ gap: 12 }}>
          {INTRO_ITEMS.map((it) => (
            <li key={it.key} className="flex items-center gap-3 text-sm" data-testid={`intro-${it.key}`}>
              <span className="inline-block size-3 shrink-0 rounded-full" style={{ background: it.color, boxShadow: `0 0 10px ${it.color}` }} />
              <span className="w-52 shrink-0 font-medium" style={{ color: it.color }}>{it.name}</span>
              <span style={{ color: "var(--text)" }}>{it.text}{it.bold && <> <strong>{it.bold}</strong></>}</span>
            </li>
          ))}
        </ul>
        <div className="text-sm" style={{ color: "var(--text)" }} data-testid="intro-drag">You can also add a new node by dragging from a node's round endpoint with the cursor onto an empty spot. Dragging from End's endpoint makes another End, so different branches can close separately.</div>
        <div className="flex justify-end">
          <button type="button" className="btn btn-teal text-sm" onClick={() => setIntro(false)} data-testid="intro-close">Got it</button>
        </div>
      </div>
    </div>
  );
}
