import { ResearchWorkspace } from "@/lib/types";

// The memo is prose the agent wrote, so it's set in the reading face rather
// than the <pre> block it used to be — a monospace dump made a finished
// deliverable look like console output.
export default function ReportView({ ws }: { ws: ResearchWorkspace }) {
  if (!ws.report) {
    return <p className="t-meta">The memo drafts itself once objectives have evidence behind them.</p>;
  }
  return (
    <div
      className="t-summary whitespace-pre-wrap"
      style={{ color: "var(--ink)", fontSize: "14px", lineHeight: 1.6 }}
    >
      {ws.report}
    </div>
  );
}
