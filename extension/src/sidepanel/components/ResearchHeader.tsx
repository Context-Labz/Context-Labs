import { ResearchWorkspace } from "@/lib/types";

export default function ResearchHeader({ ws }: { ws: ResearchWorkspace }) {
  return (
    <header className="border-b pb-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">Research Room</p>
      <h1 className="text-xl font-semibold">{ws.question || "Untitled research"}</h1>
    </header>
  );
}
