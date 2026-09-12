import { ResearchWorkspace } from "@/lib/types";

// Cell status uses the same vocabulary as the objectives board: verified cells
// carry the evidence hue, anything a person still needs to look at is warm,
// and an unfilled cell is simply empty rather than shouting in red — an
// unanswered question isn't an error.
const statusStyle: Record<string, { color: string; background: string }> = {
  verified: { color: "var(--ink)", background: "transparent" },
  unverified: { color: "var(--conflict)", background: "var(--conflict-wash)" },
  gap: { color: "var(--ink-faint)", background: "transparent" },
};

export default function ComparisonTableView({ ws }: { ws: ResearchWorkspace }) {
  if (!ws.table.rows.length) {
    return (
      <p className="t-meta">
        Empty. Set a question above and run it, or name a company when you save a page.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full" style={{ borderCollapse: "collapse", fontSize: "12.5px" }}>
        <thead>
          <tr>
            <th className="t-meta text-left px-1 pb-1.5">Company</th>
            {ws.table.columns.map((c) => (
              <th key={c} className="t-meta text-left px-1 pb-1.5">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ws.table.rows.map((row) => (
            <tr key={row.provider} style={{ borderTop: "1px solid var(--rule)" }}>
              <td className="t-label px-1 py-2 align-top" style={{ fontSize: "12.5px" }}>
                {row.provider}
              </td>
              {ws.table.columns.map((col) => {
                const cell = row.cells[col];
                const s = statusStyle[cell?.status ?? "gap"];
                return (
                  <td
                    key={col}
                    className="px-1 py-2 align-top"
                    style={{ color: s.color, background: s.background }}
                  >
                    {cell?.value || "—"}
                    {cell?.citations?.length ? (
                      <span
                        title={cell.citations[0].quote}
                        className="t-meta block mt-1"
                        style={{ fontFamily: "var(--font-read)" }}
                      >
                        “{cell.citations[0].quote.slice(0, 60)}…”
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
