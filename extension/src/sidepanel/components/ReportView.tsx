import { ResearchWorkspace } from "@/lib/types";

export default function ReportView({ ws }: { ws: ResearchWorkspace }) {
  return (
    <section className="bg-white rounded-lg border p-4">
      <h2 className="font-medium mb-2">Report</h2>
      {ws.report ? (
        <pre className="whitespace-pre-wrap text-sm text-zinc-800">{ws.report}</pre>
      ) : (
        <p className="text-sm text-zinc-400">Report appears here once research completes.</p>
      )}
    </section>
  );
}
