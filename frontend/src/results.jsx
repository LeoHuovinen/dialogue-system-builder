// The page of the testers' conversations through one testing link, /results/<token>, the same box the editor's
// sidebar opens from "tried ×N", centred. The link is the access, so no saved conversation in this browser is needed.
// The runs come from the builder's /api/share/<token>/runs, which reads each finished session back through IL's
// read-only storage vendor.
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { RunsBox } from "./SharedRuns";

const token = location.pathname.split("/").filter(Boolean).pop() || "";

function ResultsApp() {
  const [label, setLabel] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/share/${token}/design`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("That testing link does not exist."))))
      .then((j) => setLabel(j.label || j.design?.title || ""))
      .catch((e) => setError(String(e.message || e)));
  }, []);
  return (
    <div className="flex h-full items-center justify-center" data-testid="results-page">
      {error
        ? <div className="rounded-lg border border-red-500/40 p-2 text-xs text-red-300" data-testid="results-error">{error}</div>
        : label !== null && <RunsBox token={token} label={label} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><ResultsApp /></React.StrictMode>);
