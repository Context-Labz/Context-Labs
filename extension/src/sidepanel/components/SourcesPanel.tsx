import { ResearchWorkspace } from "@/lib/types";

export default function SourcesPanel({ ws }: { ws: ResearchWorkspace }) {
  return (
    <section className="bg-white rounded-lg border p-4">
      <h2 className="font-medium mb-2">Sources ({ws.sources.length})</h2>
      <ul className="space-y-2 text-sm">
        {ws.sources.map((s) => (
          <li key={s.id} className="border-l-2 border-zinc-300 pl-2">
            <a href={s.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-medium">{s.title}</a>
            <p className="text-zinc-600 line-clamp-2">{s.excerpt}</p>
          </li>
        ))}
        {ws.sources.length === 0 && <li className="text-zinc-400">No sources yet.</li>}
      </ul>
    </section>
  );
}
