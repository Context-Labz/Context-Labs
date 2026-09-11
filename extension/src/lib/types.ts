// Copy of the backend's ResearchWorkspace shape (kept in sync manually —
// see the note in the original version of this file / CHANGELOG.md).

export interface Citation {
  sourceId: string;
  quote: string; // verbatim excerpt — the "no claim without a source" rule
}

export interface Source {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  fetchedAt: string;
  claims: string[];
}

export type CellStatus = "verified" | "unverified" | "gap";

export interface TableCell {
  value: string;
  citations: Citation[];
  status: CellStatus;
}

export type GapStatus = "open" | "resolved_blank" | "resolved_secondary";

export interface Gap {
  id: string;
  provider: string;
  column: string;
  reason: string;
  status: GapStatus;
}

// Research plan layer (VC-diligence framing): a fixed list of objectives —
// "Market Size", "Competition", "Team", etc. — that evidence gets mapped
// into as the user browses, instead of answering one open-ended question.
// This is what lets the agent say "strong on demand, weak on manufacturing"
// instead of just returning a single synthesized answer — the thing a
// standalone chatbox can't do because it has no persistent plan to map
// evidence into across separate browsing sessions/tabs.
export type ObjectiveConfidence = "none" | "low" | "medium" | "high";

export interface ObjectiveEvidence {
  sourceId: string;
  quote: string;
  value: string; // the specific claim this piece of evidence supports, e.g. "KES 3,500–6,500"
}

export interface Contradiction {
  id: string;
  note: string; // what conflicts, in plain language
  evidenceA: ObjectiveEvidence;
  evidenceB: ObjectiveEvidence;
  status: "open" | "resolved";
}

export interface Objective {
  id: string;
  label: string; // "Market Size", "Pricing", "Competition", ...
  summary: string; // current best synthesis, empty until evidence exists
  confidence: ObjectiveConfidence;
  evidence: ObjectiveEvidence[];
  contradictions: Contradiction[];
}

export interface ActivityItem {
  icon: string; // e.g. "search" | "table" | "warn" | "report"
  text: string;
  ts: string;
}

export interface ComparisonTable {
  columns: string[];
  rows: { provider: string; cells: Record<string, TableCell> }[];
}

export interface ResearchWorkspace {
  id: string;
  question: string;
  sources: Source[];
  table: ComparisonTable;
  objectives: Objective[];
  gaps: Gap[];
  activity: ActivityItem[];
  notes: string[];
  report: string;
}
