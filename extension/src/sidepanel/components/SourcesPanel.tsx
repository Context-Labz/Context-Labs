import { ResearchWorkspace } from "@/lib/types";

export default function SourcesPanel({ ws }: { ws: ResearchWorkspace }) {
  return (
    <ul className="space-y-2.5">
      {ws.sources.map((s) => (
        <li key={s.id}>
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="t-label hover:underline block truncate"
            style={{ color: "var(--evidence)" }}
          >
            {s.title}
          </a>
          <p className="t-meta line-clamp-2 mt-0.5">{s.excerpt}</p>
        </li>
      ))}
      {ws.sources.length === 0 && (
        <li className="t-meta">Pages you save show up here, with what was taken from each.</li>
      )}
    </ul>
  );
}
