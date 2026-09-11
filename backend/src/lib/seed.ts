import { Objective, ResearchWorkspace } from "./types";

// VC-diligence objective template — the default research plan for the
// primary positioning ("first-pass diligence on a startup idea while you
// browse"). Fixed categories are what make "research plan" a concrete,
// buildable thing instead of an open-ended graph: an evidence-mapping
// target is exactly a checklist item, not a general knowledge graph.
export const VC_DILIGENCE_OBJECTIVES: string[] = [
  "Market Size",
  "Competition",
  "Customer Demand",
  "Pricing",
  "Team & Execution",
  "Regulatory & Distribution Risk",
];

function makeObjective(label: string): Objective {
  return {
    id: `obj_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    label,
    summary: "",
    confidence: "none",
    evidence: [],
    contradictions: [],
  };
}

// Pre-seeded workspace so the UI never looks empty and the demo has a
// believable mid-research state. Real Exa results replace/extend this at
// runtime. `useVcTemplate` defaults to true — VC diligence is the primary
// positioning now; pass false for the general open-ended comparison mode
// (the original "compare N named providers on M columns" flow), which
// still works unchanged via `table`.
export const seedWorkspace = (
  id: string,
  question: string,
  columns: string[],
  useVcTemplate: boolean = true,
): ResearchWorkspace => ({
  id,
  question,
  sources: [
    {
      id: "src_seed_1",
      title: "Safaricom Daraja API docs",
      url: "https://developer.safaricom.co.ke",
      excerpt: "M-Pesa integration via REST APIs; paybill, till, and STK push flows.",
      fetchedAt: new Date().toISOString(),
      claims: ["Daraja supports M-Pesa"],
    },
  ],
  table: { columns, rows: [] },
  objectives: useVcTemplate ? VC_DILIGENCE_OBJECTIVES.map(makeObjective) : [],
  gaps: [],
  activity: [{ icon: "spark", text: "Workspace created. Awaiting research task.", ts: new Date().toISOString() }],
  notes: [],
  report: "",
});
