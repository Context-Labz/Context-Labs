import { ResearchWorkspace } from "@/lib/types";

const statusStyle: Record<string, string> = {
  verified: "bg-emerald-50",
  unverified: "bg-amber-50",
  gap: "bg-rose-50",
};

export default function ComparisonTableView({ ws }: { ws: ResearchWorkspace }) {
  return (
    <section className="bg-white rounded-lg border p-4 overflow-x-auto">
      <h2 className="font-medium mb-2">Comparison table</h2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left p-2">Provider</th>
            {ws.table.columns.map((c) => <th key={c} className="text-left p-2">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {ws.table.rows.map((row) => (
            <tr key={row.provider} className="border-t">
              <td className="p-2 font-medium">{row.provider}</td>
              {ws.table.columns.map((col) => {
                const cell = row.cells[col];
                return (
                  <td key={col} className={`p-2 ${statusStyle[cell?.status ?? "gap"]}`}>
                    {cell?.value || <span className="text-zinc-400">—</span>}
                    {cell?.citations?.length ? (
                      <span title={cell.citations[0].quote} className="block text-[10px] text-zinc-500">"{cell.citations[0].quote.slice(0, 60)}…"</span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
          {ws.table.rows.length === 0 && (
            <tr><td colSpan={ws.table.columns.length + 1} className="p-4 text-zinc-400">Empty — ask the agent to fill it.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
