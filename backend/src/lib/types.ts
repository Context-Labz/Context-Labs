export interface Citation {
  sourceId: string;
  quote: string;
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

export type ObjectiveConfidence = "none" | "low" | "medium" | "high";

export interface ObjectiveEvidence {
  sourceId: string;
  quote: string;
  value: string;
}

export interface Contradiction {
  id: string;
  note: string;
  evidenceA: ObjectiveEvidence;
  evidenceB: ObjectiveEvidence;
  status: "open" | "resolved";
}

export interface Objective {
  id: string;
  label: string;
  summary: string;
  confidence: ObjectiveConfidence;
  evidence: ObjectiveEvidence[];
  contradictions: Contradiction[];
}

export interface ActivityItem {
  icon: string;
  text: string;
  ts: string;
}

export interface ComparisonTable {
  columns: string[];
  rows: { provider: string; cells: Record<string, TableCell> }[];
}

export type BrowserEventType =
  | "highlight"
  | "tab_switch"
  | "link_click"
  | "search"
  | "page_view"
  | "capture";

export interface BrowserEvent {
  id: string;
  type: BrowserEventType;
  title: string;
  url: string;
  text?: string;
  ts: string;
}

export interface SuggestedLink {
  id: string;
  title: string;
  url: string;
  reason: string;
  snippet: string;
}

export interface ResearchNote {
  id: string;
  text: string;
  url: string;
  title: string;
  ts: string;
  objectiveId?: string;
}

export type WorkspaceStatus = "active" | "completed";

export interface ResearchWorkspace {
  id: string;
  question: string;
  sources: Source[];
  table: ComparisonTable;
  objectives: Objective[];
  gaps: Gap[];
  activity: ActivityItem[];
  notes: ResearchNote[];
  events: BrowserEvent[];
  suggestions: SuggestedLink[];
  report: string;
  summary: string;
  status: WorkspaceStatus;
}
