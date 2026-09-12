// Design preview harness — renders the real panel components against fixed
// sample state so the layout can be reviewed in a plain browser, without an
// extension host or a running backend. Not referenced by the manifest, so it
// is never bundled into the shipped extension.
//
// Run: npx vite --config vite.preview.config.ts   →   /src/sidepanel/preview.html
import { createRoot } from "react-dom/client";
import { ResearchWorkspace } from "@/lib/types";
import ResearchHeader from "./components/ResearchHeader";
import ResearchPlanView from "./components/ResearchPlanView";
import SourcesPanel from "./components/SourcesPanel";
import ActivityFeed from "./components/ActivityFeed";
import ReportView from "./components/ReportView";
import ComparisonTableView from "./components/ComparisonTableView";
import GapBanner from "./components/GapBanner";
import "./styles.css";

const ts = new Date().toISOString();

const ws: ResearchWorkspace = {
  id: "ws_preview",
  question: "Is there a market for premium swimwear in Kenya?",
  sources: [
    {
      id: "src_1",
      title: "Kenya Swimwear Market (2022–2031) | Forecast & Trends",
      url: "https://www.6wresearch.com/industry-report/kenya-swimwear-market",
      excerpt:
        "Kenya swimwear market is projected to grow steadily, driven by coastal tourism along the Mombasa corridor and rising disposable income in Nairobi.",
      fetchedAt: ts,
      claims: [],
    },
    {
      id: "src_2",
      title: "Nairobi boutique pricing survey — apparel retail",
      url: "https://example.co.ke/apparel-pricing",
      excerpt: "Comparable premium swimwear sells for KES 6,500 in Nairobi boutiques.",
      fetchedAt: ts,
      claims: [],
    },
  ],
  table: {
    columns: ["Price", "Materials", "Distribution"],
    rows: [
      {
        provider: "Kiko Romeo",
        cells: {
          Price: {
            value: "KES 4,200",
            citations: [{ sourceId: "src_2", quote: "priced from KES 4,200 for the core line" }],
            status: "verified",
          },
          Materials: { value: "", citations: [], status: "gap" },
          Distribution: {
            value: "Own stores + online",
            citations: [{ sourceId: "src_2", quote: "sold through its Nairobi stores and website" }],
            status: "verified",
          },
        },
      },
      {
        provider: "Sandstorm",
        cells: {
          Price: {
            value: "see source",
            citations: [{ sourceId: "src_1", quote: "pricing varies by season and outlet" }],
            status: "unverified",
          },
          Materials: { value: "Recycled nylon", citations: [], status: "verified" },
          Distribution: { value: "", citations: [], status: "gap" },
        },
      },
    ],
  },
  objectives: [
    {
      id: "obj_market_size",
      label: "Market Size",
      summary:
        "Coastal tourism is the main demand driver, but no credible figure for total market value has been corroborated yet.",
      confidence: "low",
      evidence: [{ sourceId: "src_1", quote: "driven by coastal tourism", value: "tourism-led demand" }],
      contradictions: [],
    },
    {
      id: "obj_competition",
      label: "Competition",
      summary: "",
      confidence: "none",
      evidence: [],
      contradictions: [],
    },
    {
      id: "obj_customer_demand",
      label: "Customer Demand",
      summary:
        "Rising disposable income in Nairobi and steady Mombasa tourist volume both point to real demand at the premium tier.",
      confidence: "high",
      evidence: [
        { sourceId: "src_1", quote: "rising disposable income in Nairobi", value: "income growth" },
        { sourceId: "src_2", quote: "steady demand through the December season", value: "seasonal demand" },
      ],
      contradictions: [],
    },
    {
      id: "obj_pricing",
      label: "Pricing",
      summary: "Priced at KES 3,500.",
      confidence: "medium",
      evidence: [
        { sourceId: "src_1", quote: "retail at KES 3,500 each", value: "KES 3,500" },
        { sourceId: "src_2", quote: "sells for KES 6,500 in Nairobi boutiques", value: "KES 6,500" },
      ],
      contradictions: [
        {
          id: "contra_1",
          note: "One source says KES 3,500, another says KES 6,500 for comparable pieces.",
          evidenceA: { sourceId: "src_1", quote: "retail at KES 3,500 each", value: "KES 3,500" },
          evidenceB: {
            sourceId: "src_2",
            quote: "sells for KES 6,500 in Nairobi boutiques",
            value: "KES 6,500",
          },
          status: "open",
        },
      ],
    },
    {
      id: "obj_team_execution",
      label: "Team & Execution",
      summary: "",
      confidence: "none",
      evidence: [],
      contradictions: [],
    },
    {
      id: "obj_regulatory_distribution_risk",
      label: "Regulatory & Distribution Risk",
      summary: "Import duty on finished textiles is the main cost risk flagged so far.",
      confidence: "low",
      evidence: [{ sourceId: "src_1", quote: "import duty on finished textiles", value: "duty exposure" }],
      contradictions: [],
    },
  ],
  gaps: [
    {
      id: "gap_1",
      provider: "Kiko Romeo",
      column: "Materials",
      reason: "The quoted fabric composition couldn't be found anywhere in the cited page.",
      status: "open",
    },
  ],
  activity: [
    { icon: "spark", text: "Workspace created. Awaiting research task.", ts },
    { icon: "search", text: "Searching: Kenya swimwear market size", ts },
    { icon: "search", text: "Source added: Kenya Swimwear Market (2022–2031)", ts },
    { icon: "table", text: "Customer Demand: high confidence from captured page", ts },
    { icon: "warn", text: "Discarded an unsupported claim for Market Size — the quote isn't on the page.", ts },
    { icon: "warn", text: "Contradiction on Pricing: one source says KES 3,500, another KES 6,500.", ts },
    { icon: "human", text: "Pricing: kept \"KES 6,500\" over the conflicting value.", ts },
  ],
  notes: [],
  report:
    "Premium swimwear in Kenya shows genuine demand at the top of the market, driven by coastal tourism and rising Nairobi incomes. Pricing remains unsettled: two sources disagree by nearly 2x, and that gap is unresolved. No evidence has been gathered on competition or founding team, so this is not yet a complete first-pass view.",
};

function noop() {}

createRoot(document.getElementById("root")!).render(
  <div className="pb-8">
    <ResearchHeader ws={ws} onQuestionSaved={noop} />
    <div
      className="rule-top px-4 py-3"
      style={{ background: "var(--evidence-wash)", borderLeft: "3px solid var(--evidence)" }}
    >
      <p className="t-meta">This page looks like evidence for</p>
      <p className="t-summary mt-0.5" style={{ color: "var(--ink)" }}>
        Pricing
      </p>
      <div className="flex gap-1.5 mt-2">
        <button className="btn btn-primary">Save this page</button>
        <button className="btn btn-quiet">Not this one</button>
      </div>
    </div>
    <ResearchPlanView ws={ws} onResolved={noop} />
    <div className="rule-top px-4 py-3">
      <button className="btn btn-primary w-full">Save this page as evidence</button>
      <button className="t-meta mt-2 block">Name a company for the comparison table</button>
    </div>
    <GapBanner ws={ws} onResolved={noop} />
    <div className="rule-top px-4 py-3">
      <p className="t-section mb-2">Sources</p>
      <SourcesPanel ws={ws} />
    </div>
    <div className="rule-top px-4 py-3">
      <p className="t-section mb-2">Memo</p>
      <ReportView ws={ws} />
    </div>
    <div className="rule-top px-4 py-3">
      <p className="t-section mb-2">Comparison table</p>
      <ComparisonTableView ws={ws} />
    </div>
    <div className="rule-top px-4 py-3">
      <p className="t-section mb-2">What the agent did</p>
      <ActivityFeed ws={ws} />
    </div>
  </div>
);
