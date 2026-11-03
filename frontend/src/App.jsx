// The editor's page, the canvas on the left and the one sidebar on the right, rendered by main.jsx into index.html. The
// dialogue system builder is made to run with Illocutionary Lifecycles (IL), which it cannot run without, and in it a person draws
// a conversation as steps and lines on a canvas, compiles it to the flow IL runs, and talks to it through IL's mounts,
// and this file holds the editor together. The editor's own parts are Sidebar.jsx for the main menu, Panes.jsx for the
// selected node or line, Conversation.jsx for talking, SharedRuns.jsx for the testing links, StartCheck.jsx for the check
// behind Start and Dialogs.jsx for the popups. The shared canvas parts it imports are listed in store.js, and
// dialogue_system_builder/__init__.py is the map of the whole repository. A press of Start checks the design at the server first,
// and Conversation.jsx is mounted only for a design that passed. Conversation.jsx is also hosted by try.jsx. This file
// reads and writes only the store, and reaches the server through api.js and StartCheck.jsx.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider, ViewportPortal, getBezierPath, useReactFlow } from "@xyflow/react";
import { CARD_W, ghostEdgesOf, roundedPath } from "./layout";
import { routeOf, routeTable } from "./flow/routes";
import { Toaster } from "sonner";
import { useStore } from "./store";
import { api } from "./api";
import { nodeTypes } from "./nodes/nodes";
import { GhostConnectionLine, edgeTypes } from "./edges/DeletableEdge";
import { DesignHeader, NodesPanel } from "./Sidebar";
import { EdgePane, NodePane } from "./Panes";
import { Conversation } from "./Conversation";
import { ConfirmDialog, IntroDialog, VoiceStartDialog } from "./Dialogs";
import { FindingsList, startCheck } from "./StartCheck";
import { edgeLiveVis, liveIds, nodeLiveClass, reachableFrom } from "./flow/live";
import { useMeasuredHeights } from "./flow/useMeasuredHeights";
import { useZoomToNode } from "./flow/useZoomToNode";

function Canvas() {
  const editing = useStore((s) => s.mode === "edit"); // in conversation mode the canvas is dimmed and locked
  const storeNodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const liveIndex = useStore((s) => s.live.index);
  const pendingIndex = useStore((s) => s.live.pending);
  const livePath = useStore((s) => s.live.path);
  const crossing = useStore((s) => s.live.crossing);
  const orderedStateIds = useStore((s) => s.orderedStateIds);
  const findings = useStore((s) => s.findings);
  // The node the conversation is at right now carries the is-live class, and the nodes and edges a
  // refused Start named carry has-error; the store's nodes and edges are untouched.
  const badNodes = useMemo(() => new Set(findings.filter((f) => f.level === "error" && f.node).map((f) => f.node)), [findings]);
  const badEdges = useMemo(() => new Set(findings.filter((f) => f.level === "error" && f.edge).map((f) => f.edge)), [findings]);
  // In conversation mode the walked path, the live node and the line just taken are lit (flow/live.js, shared with the viewer).
  const { liveId, headId } = liveIds({ index: liveIndex, pending: pendingIndex }, orderedStateIds());
  const pathNodes = useMemo(() => new Set(livePath?.nodes || []), [livePath]);
  const pathEdges = useMemo(() => new Set(livePath?.edges || []), [livePath]);
  const reachable = useMemo(() => reachableFrom(headId, edges), [headId, edges]);
  const ghost = useStore((s) => s.ghost); // the sidebar's hover preview of a placement
  const nodes = useMemo(() => {
    return storeNodes.map((n0) => {
      // while a placement is hovered, the neighbours are shown where they would move to
      const n = editing && ghost?.moves?.[n0.id] ? { ...n0, position: ghost.moves[n0.id] } : n0;
      const cls = [...nodeLiveClass(n, { liveId, pathNodes, reachable, editing }),
        badNodes.has(n.id) ? "has-error" : ""].filter(Boolean).join(" ");
      // Start and End are never selectable and never deletable, from the keyboard either.
      const fixed = n.type === "start" || n.type === "end" ? { selectable: false, deletable: false } : {};
      // Outside edit mode nothing is selected, so the teal editing pulse never survives into a conversation.
      return { ...n, ...fixed, className: cls, ...(editing ? {} : { selected: false }) };
    });
  }, [storeNodes, edges, liveId, pathNodes, reachable, editing, badNodes, ghost]);
  const markedEdges = useMemo(() => edges.map((e) => {
    const vis = edgeLiveVis(e, { crossing, pathEdges, reachable, editing });
    const cls = [vis ? `is-${vis}` : "", badEdges.has(e.id) ? "has-error" : ""].filter(Boolean).join(" ");
    return { ...e, className: cls, data: { ...(e.data || {}), vis }, ...(editing ? {} : { selected: false }) };
  }), [edges, badEdges, crossing, pathEdges, reachable, editing]);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const onConnect = useStore((s) => s.onConnect);
  const isValidConnection = useStore((s) => s.isValidConnection);
  const select = useStore((s) => s.select);
  const openPrompt = useStore((s) => s.openPrompt);
  const addNodeAt = useStore((s) => s.addNodeAt);
  const rf = useReactFlow();
  const measured = useMeasuredHeights(storeNodes);   // flow/useMeasuredHeights.js, shared with the viewer
  // The ghost is dashed translucent cards where the shape's nodes would land, with every line they
  // would get, routed the same way the real lines are, into the entry, between the cells, and from the
  // exits to the old target. Existing nodes are taken at their moved positions.
  const ghostView = useMemo(() => {
    if (!ghost || !editing) return null;
    const table = routeTable(storeNodes, edges, measured, ghost);
    const { rects } = table;
    const lines = ghostEdgesOf(ghost).map((e) => {
      const r = routeOf(table, e).route;
      if (!r) return null;
      return r.kind === "bezier"
        ? getBezierPath({ sourceX: r.sx, sourceY: r.sy, sourcePosition: "right", targetX: r.tx, targetY: r.ty, targetPosition: "left" })[0]
        : roundedPath(r.points, r.radius);
    }).filter(Boolean);
    // Everything, moved nodes and new cells, is brought on screen the moment the place is hovered.
    const x1 = Math.min(...rects.map((r) => r.x)), y1 = Math.min(...rects.map((r) => r.y));
    const x2 = Math.max(...rects.map((r) => r.x + r.w)), y2 = Math.max(...rects.map((r) => r.y + r.h));
    return { cells: ghost.cells, W: CARD_W, lines, bounds: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } };
  }, [ghost, editing, storeNodes, edges, measured]);
  useEffect(() => {
    if (ghostView?.bounds) rf.fitBounds(ghostView.bounds, { padding: 0.15, duration: 250 });
  }, [ghostView?.bounds?.x, ghostView?.bounds?.y, ghostView?.bounds?.width, ghostView?.bounds?.height, rf]);
  // A connection released on empty canvas becomes a new node there, connected from where it began.
  const onConnectEnd = useCallback((event, state) => {
    if (!state?.fromNode || state.toNode || state.toHandle) return;
    const p = "changedTouches" in event ? event.changedTouches[0] : event;
    addNodeAt(rf.screenToFlowPosition({ x: p.clientX, y: p.clientY }), state.fromNode.id);
  }, [rf, addNodeAt]);
  // After a design is loaded, zoom out so the whole conversation is in view.
  const fitTick = useStore((s) => s.fitTick);
  useEffect(() => {
    if (!fitTick) return;
    const t = setTimeout(() => rf.fitView({ padding: 0.12, duration: 300 }), 250);   // once the new nodes are measured
    return () => clearTimeout(t);
  }, [fitTick, rf]);

  // The arrow keys pan the canvas whenever no field has the keyboard; Shift pans further.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const step = e.shiftKey ? 240 : 80;
      const d = { ArrowLeft: { x: step, y: 0 }, ArrowRight: { x: -step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } }[e.key];
      if (!d) return;
      e.preventDefault();
      const v = rf.getViewport();
      rf.setViewport({ x: v.x + d.x, y: v.y + d.y, zoom: v.zoom });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rf]);
  // A double-click centres the view on the node (flow/useZoomToNode.js, shared with the viewer).
  const canvasRef = useRef(null);
  const zoomToNode = useZoomToNode(canvasRef);

  // In conversation mode the view follows the conversation, so each move to a new node centres on
  // it exactly as a double-click would, at half the speed.
  useEffect(() => {
    if (editing || !headId) return;
    const n = storeNodes.find((x) => x.id === headId);
    if (n) zoomToNode(n, 600);
  }, [headId, editing]); // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <div ref={canvasRef} className="relative h-full min-w-0 flex-1" data-testid="canvas" data-locked={editing ? "false" : "true"}>
      <div className="pointer-events-none absolute left-4 top-3 z-10 select-none text-base font-semibold" style={{ color: "rgba(253,253,253,.9)" }} data-testid="course-badge">
        Dialogue System Builder
      </div>
      <ReactFlow
        nodes={nodes} edges={markedEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={editing ? onNodesChange : undefined} onEdgesChange={editing ? onEdgesChange : undefined}
        onConnect={editing ? onConnect : undefined} onConnectEnd={editing ? onConnectEnd : undefined}
        connectionLineComponent={GhostConnectionLine}
        isValidConnection={isValidConnection}
        onNodeClick={editing ? (_, n) => { if (n.type === "step") select({ kind: "node", id: n.id }); } : undefined}
        onNodeDoubleClick={(_, n) => { zoomToNode(n); if (editing && n.type === "step") openPrompt(n.id); }}
        onEdgeClick={editing ? (_, e) => select({ kind: "edge", id: e.id }) : undefined}
        nodesDraggable={editing} nodesConnectable={editing} elementsSelectable={editing}
        deleteKeyCode={editing ? ["Delete", "Backspace"] : null} snapToGrid snapGrid={[16, 16]} zoomOnDoubleClick={false} disableKeyboardA11y
        fitView proOptions={{ hideAttribution: true }}>
        <Background variant={BackgroundVariant.Dots} gap={32} color="rgba(255,255,255,0.25)" />
        <Controls showInteractive={false} />
        {ghostView && (
          <ViewportPortal>
            <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }} data-testid="ghost-lines">
              {ghostView.lines.map((d, i) => <path key={i} d={d} fill="none" stroke="rgba(253,253,253,.6)" strokeWidth={1.5} strokeDasharray="6 6" />)}
            </svg>
            {ghostView.cells.map((c) => (
              <div key={c.k} className="card ghost-node" data-testid="ghost-placement"
                style={{ position: "absolute", transform: `translate(${c.x}px, ${c.y}px)`, width: ghostView.W, pointerEvents: "none" }}>
                <div className="flex h-9 items-center px-3" style={{ background: "rgba(45,45,45,.5)" }} />
                <div className="px-3 py-2 text-sm"><span className="muted italic">New node</span></div>
              </div>
            ))}
          </ViewportPortal>
        )}
      </ReactFlow>
    </div>
  );
}

// The one sidebar, on the right. In edit mode it shows the nodes panel or the selected node's or
// edge's properties, with the two Start buttons pinned to the bottom, always visible.
// The Conversation is mounted only in conversation mode, which only those buttons enter.
function RightSidebar() {
  const mode = useStore((s) => s.mode);
  const panel = useStore((s) => s.panel);
  const selected = useStore((s) => s.selected);
  const setPanel = useStore((s) => s.setPanel);
  const setMode = useStore((s) => s.setMode);
  const node = useStore((s) => (selected?.kind === "node" ? s.nodes.find((n) => n.id === selected.id) : null));
  const edge = useStore((s) => (selected?.kind === "edge" ? s.edges.find((e) => e.id === selected.id) : null));
  const showProperties = panel === "properties" && (node || edge);
  const toDesign = useStore((s) => s.toDesign);
  const findings = useStore((s) => s.findings); // shown only after a press of Start that was refused
  const setFindings = useStore((s) => s.setFindings);
  const [checking, setChecking] = useState(false);
  // A quiet background check colours the button, green when the canvas would be accepted and grey
  // when not. The messages appear only when Start is pressed and refused.
  const storeNodes = useStore((s) => s.nodes);
  const storeEdges = useStore((s) => s.edges);
  const style = useStore((s) => s.style);
  // The quiet colouring ignores the voice, so both buttons turn green once the design itself is
  // accepted, voice chosen or not. Pressing Start with voice still checks in voice mode, so a
  // missing voice is refused with its red finding at that moment.
  const [accepted, setAccepted] = useState(null); // null = not known yet
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await api.validate(toDesign(), "text", true);
        if (live) setAccepted(!!r.ok);
      } catch { if (live) setAccepted(null); }
    }, 500);
    return () => { live = false; clearTimeout(t); };
  }, [storeNodes, storeEdges, style, toDesign]);
  // Start checks the canvas first and enters conversation mode only when the check is clean.
  // The checks run first, for either button, and only an accepted design goes on. Text starts at
  // once, and voice opens the popup, a small microphone check, whose Start enters the conversation.
  const [voiceDialog, setVoiceDialog] = useState(false);
  // What this server can start. A server without Pipecat answers false for voice, and Start with voice is greyed out.
  // Until the answer comes, both buttons are live.
  const [caps, setCaps] = useState({ voice: true, text: true });
  useEffect(() => { let live = true; api.capabilities().then((c) => { if (live && c) setCaps({ voice: c.voice !== false, text: c.text !== false }); }).catch(() => {}); return () => { live = false; }; }, []);
  const tryStart = startCheck(toDesign, setChecking, setFindings, (startMode) => {
    if (startMode === "voice") setVoiceDialog(true); else setMode("conversation", startMode);
  });
  if (mode === "conversation") {
    return (
      <aside className="flex w-[26rem] shrink-0 select-none flex-col overflow-y-auto border-l" style={{ borderColor: "var(--raised)" }} data-testid="sidebar">
        <Conversation />
      </aside>
    );
  }
  return (
    <aside className="flex w-[26rem] shrink-0 select-none flex-col border-l" style={{ borderColor: "var(--raised)" }} data-testid="sidebar">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {showProperties ? (
          <div data-testid="properties">
            {/* The conversation's settings sit exactly where they sit in the main menu, on the same lighter ground; the way back is under them. */}
            <div className="border-b p-4" style={{ background: "rgb(48,48,48)", borderColor: "var(--line)" }}><DesignHeader /></div>
            <div className="px-4 pt-3">
              <button type="button" className="btn w-full justify-center py-2 text-sm font-medium" onClick={() => setPanel("nodes")} data-testid="nodes">
                ← Back to the main menu
              </button>
            </div>
            {node ? <NodePane node={node} /> : <EdgePane edge={edge} />}
          </div>
        ) : <NodesPanel />}
      </div>
      <div className="shrink-0 border-t p-3" style={{ borderColor: "var(--raised)" }} data-testid="start-slot">
        <FindingsList findings={findings} />
        <div className="flex gap-2">
          <button type="button" className={`action-btn action-btn--solid flex-1 ${accepted && caps.voice ? "start--accepted" : ""}`} onClick={() => tryStart("voice")} disabled={checking || !caps.voice}
            style={caps.voice ? undefined : { opacity: 0.45 }} title={caps.voice ? undefined : "This server runs without voice"}
            data-testid="start" data-accepted={accepted === null ? "unknown" : String(accepted)} data-available={String(caps.voice)}>
            {checking ? "Checking…" : "Start with voice"}
          </button>
          <button type="button" className={`action-btn action-btn--solid flex-1 ${accepted && caps.text ? "start--accepted" : ""}`} onClick={() => tryStart("text")} disabled={checking || !caps.text} data-testid="start-text"
            style={caps.text ? undefined : { opacity: 0.45 }} title={caps.text ? undefined : "This server runs without text"}
            data-accepted={accepted === null ? "unknown" : String(accepted)} data-available={String(caps.text)}>
            {checking ? "Checking…" : "Start with text only"}
          </button>
        </div>
      </div>
      {voiceDialog && <VoiceStartDialog onCancel={() => setVoiceDialog(false)} onStart={() => { setVoiceDialog(false); setMode("conversation", "voice"); }} />}
    </aside>
  );
}

export default function App() {
  const mode = useStore((s) => s.mode);
  const phase = useStore((s) => s.live.phase);
  const panel = useStore((s) => s.panel);
  const intro = useStore((s) => s.intro);
  const setIntro = useStore((s) => s.setIntro);
  const mainMenu = mode === "edit" && panel === "nodes";
  return (
    <ReactFlowProvider>
      <div className={`flex h-full mode-${mode} phase-${phase || "idle"}`} data-mode={mode} data-phase={phase} data-intro={intro && mainMenu ? "1" : "0"}>
        <Canvas />
        <RightSidebar />
      </div>
      {/* "?" at the bottom left, in the main menu only, reopens the intro, and is hidden while the intro is open. */}
      {mainMenu && !intro && (
        <button type="button" aria-label="Help" onClick={() => setIntro(true)} data-testid="intro-help"
          className="fixed bottom-4 z-40 flex size-9 items-center justify-center rounded-full border text-base font-medium"
          style={{ left: 76, background: "var(--dialog)", borderColor: "var(--line)", color: "var(--text)" }}>?</button>
      )}
      {intro && mainMenu && <IntroDialog />}
      <ConfirmDialog />
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </ReactFlowProvider>
  );
}
