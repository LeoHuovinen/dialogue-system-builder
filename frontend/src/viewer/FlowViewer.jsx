// The viewer, the builder's canvas in conversation mode alone, with no editor around it. The component draws with the builder's node
// and line components, lights and follows the conversation with the builder's live view in flow/, and reads the store
// that viewer/main.jsx fills, so it looks and moves exactly as the builder's canvas does while a conversation runs there.
// Nothing in it edits, and store.js lists the shared canvas parts.
import { useEffect, useMemo, useRef } from "react";
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { useStore } from "../store";
import { nodeTypes } from "../nodes/nodes";
import { edgeTypes } from "../edges/DeletableEdge";
import { edgeLiveVis, liveIds, nodeLiveClass, reachableFrom } from "../flow/live";
import { useMeasuredHeights } from "../flow/useMeasuredHeights";
import { useZoomToNode } from "../flow/useZoomToNode";

function ViewerCanvas() {
  const storeNodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const live = useStore((s) => s.live);
  const orderedStateIds = useStore((s) => s.orderedStateIds);
  const { liveId, headId } = liveIds(live, orderedStateIds());
  const pathNodes = useMemo(() => new Set(live.path?.nodes || []), [live.path]);
  const pathEdges = useMemo(() => new Set(live.path?.edges || []), [live.path]);
  const reachable = useMemo(() => reachableFrom(headId, edges), [headId, edges]);
  const nodes = useMemo(() => storeNodes.map((n) => ({
    ...n, selectable: false, deletable: false, selected: false,
    className: nodeLiveClass(n, { liveId, pathNodes, reachable, editing: false }).filter(Boolean).join(" "),
  })), [storeNodes, liveId, pathNodes, reachable]);
  const markedEdges = useMemo(() => edges.map((e) => {
    const vis = edgeLiveVis(e, { crossing: live.crossing, pathEdges, reachable, editing: false });
    return { ...e, selected: false, className: vis ? `is-${vis}` : "", data: { ...(e.data || {}), vis } };
  }), [edges, live.crossing, pathEdges, reachable]);
  useMeasuredHeights(storeNodes);
  const canvasRef = useRef(null);
  const zoomToNode = useZoomToNode(canvasRef);
  // A design arrives after the first render, so the whole of it is brought in view once its nodes are measured.
  const rf = useReactFlow();
  const fitTick = useStore((s) => s.fitTick);
  useEffect(() => {
    if (!fitTick) return undefined;
    const t = setTimeout(() => rf.fitView({ padding: 0.12, duration: 300 }), 250);
    return () => clearTimeout(t);
  }, [fitTick, rf]);
  // The view follows the conversation exactly as the builder's does, so each move to a new node centres on it.
  useEffect(() => {
    const n = headId && storeNodes.find((x) => x.id === headId);
    if (n) zoomToNode(n, 600);
  }, [headId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={canvasRef} className="relative h-full w-full">
      <ReactFlow nodes={nodes} edges={markedEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} deleteKeyCode={null}
        zoomOnDoubleClick={false} disableKeyboardA11y fitView proOptions={{ hideAttribution: true }}>
        <Background variant={BackgroundVariant.Dots} gap={32} color="rgba(255,255,255,0.25)" />
      </ReactFlow>
    </div>
  );
}

export function FlowViewer() {
  const phase = useStore((s) => s.live.phase);
  return (
    <ReactFlowProvider>
      <div className={`h-full mode-conversation phase-${phase || "idle"}`} data-mode="conversation" data-phase={phase}>
        <ViewerCanvas />
      </div>
    </ReactFlowProvider>
  );
}
