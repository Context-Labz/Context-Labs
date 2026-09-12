import { Objective, ResearchWorkspace } from "./types";

export const VC_DILIGENCE_OBJECTIVES: string[] = [
  "Market Size",
  "Competition",
  "Customer Demand",
  "Pricing",
  "Team & Execution",
  "Regulatory & Distribution Risk",
];

export const GENERAL_OBJECTIVES: string[] = [
  "Overview",
  "Key Players",
  "Evidence",
  "Comparison",
  "Risks",
  "Open Questions",
];

export function makeObjective(label: string): Objective {
  return {
    id: `obj_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    label,
    summary: "",
    confidence: "none",
    evidence: [],
    contradictions: [],
  };
}

function looksLikeDiligence(question: string): boolean {
  const q = question.toLowerCase();
  return /market|startup|diligence|competitor|pricing|tam|founder|vc|invest/.test(q);
}

export const seedWorkspace = (
  id: string,
  question: string,
  columns: string[],
  useVcTemplate: boolean = true,
): ResearchWorkspace => {
  const labels =
    useVcTemplate && (looksLikeDiligence(question) || !question)
      ? VC_DILIGENCE_OBJECTIVES
      : question
        ? GENERAL_OBJECTIVES
        : VC_DILIGENCE_OBJECTIVES;

  return {
    id,
    question,
    sources: [],
    table: { columns, rows: [] },
    objectives: labels.map(makeObjective),
    gaps: [],
    activity: [
      {
        icon: "spark",
        text: question
          ? `Workspace ready for “${question}”. Browse, highlight, or capture pages.`
          : "Workspace created. Type a topic, then browse — highlights, tabs, and clicks feed the agent.",
        ts: new Date().toISOString(),
      },
    ],
    notes: [],
    events: [],
    suggestions: [],
    report: "",
    summary: "",
    status: "active",
  };
};
