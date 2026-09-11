import { ResearchWorkspace } from "@/lib/types";

const icon: Record<string, string> = {
  spark: "✨", plan: "🧭", search: "🔎", table: "📊", warn: "⚠️", human: "👤", report: "📝",
};

export default function ActivityFeed({ ws }: { ws: ResearchWorkspace }) {
  return (
    <section className="bg-white rounded-lg border p-4">
      <h2 className="font-medium mb-2">Agent activity</h2>
      <ul className="space-y-1 text-sm text-zinc-700 max-h-64 overflow-y-auto">
        {[...ws.activity].reverse().map((a, i) => (
          <li key={i}>{icon[a.icon] ?? "•"} {a.text}</li>
        ))}
      </ul>
    </section>
  );
}
