// The check behind every Start button, and the list of what it refused, shared by the editor (App.jsx) and a testing
// link's page (try.jsx). startCheck returns the function a button calls with its mode, which asks the server's
// /api/validate with IL's session start included and calls onAccepted only when the design may run.
import { api } from "./api";

export function startCheck(toDesign, setChecking, setFindings, onAccepted) {
  return async (startMode) => {
    setChecking(true);
    try {
      const checked = await api.validate(toDesign(), startMode);
      const list = [...(checked.findings || [])];
      if (checked.refusal) list.push({ level: "error", text: `The engine refused the design: ${checked.refusal}` });
      if (checked.ok) { setFindings([]); onAccepted(startMode); return; }
      setFindings(list.length ? list : [{ level: "error", text: "The design cannot run." }]);
    } catch (e) {
      setFindings([{ level: "error", text: String(e.message || e) }]);
    } finally { setChecking(false); }
  };
}

export function FindingsList({ findings }) {
  if (!findings.length) return null;
  return (
    <ul className="mb-3 space-y-1 text-xs" data-testid="findings">
      {findings.filter((f, i) => findings.findIndex((g) => g.text === f.text) === i).map((f, i) => (
        <li key={i} className={`rounded-lg border px-2 py-1.5 ${f.level === "error" ? "border-red-500/40 text-red-300" : "border-yellow-500/40 text-yellow-200"}`}>{f.text}</li>
      ))}
    </ul>
  );
}
