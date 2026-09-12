import { ResearchWorkspace } from "@/lib/types";

// Emoji per line read as noise next to the rest of the panel, and seven
// different ones carried no system. A coloured dot keyed to the kind of event
// uses the palette already in play: teal for things recorded, pale teal for
// searching, warm for anything that needs a person.
export default function ActivityFeed({ ws }: { ws: ResearchWorkspace }) {
  const items = [...ws.activity].reverse();

  return (
    <ul className="space-y-2 max-h-56 overflow-y-auto">
      {items.map((a, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="dot" data-kind={a.icon} />
          <span
            className="t-meta"
            style={{ color: a.icon === "warn" ? "var(--conflict)" : "var(--ink-soft)" }}
          >
            {a.text}
          </span>
        </li>
      ))}
      {items.length === 0 && <li className="t-meta">Nothing yet.</li>}
    </ul>
  );
}
