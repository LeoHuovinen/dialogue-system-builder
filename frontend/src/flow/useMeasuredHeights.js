// The measured card heights go to the store after every render, so the layout and the routed lines use real sizes.
// Shared by the builder's canvas and the viewer.
import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useStore } from "../store";

export function useMeasuredHeights(storeNodes) {
  const rf = useReactFlow();
  const measured = useStore((s) => s.measured);
  const setMeasured = useStore((s) => s.setMeasured);
  useEffect(() => {
    const m = {};
    storeNodes.forEach((n) => { const h = rf.getInternalNode(n.id)?.measured?.height; if (h) m[n.id] = Math.round(h); });
    if (JSON.stringify(m) !== JSON.stringify(measured)) setMeasured(m);
  });
  return measured;
}
