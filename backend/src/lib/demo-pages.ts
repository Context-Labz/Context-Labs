export type DemoPage = {
  id: string;
  tab: string;
  url: string;
  title: string;
  kind: "search" | "article";
  body: string;
  links?: { label: string; href: string; pageId?: string }[];
};

export const DEMO_PAGES: DemoPage[] = [
  {
    id: "search",
    tab: "Search",
    url: "https://www.google.com/search?q=Kenya+swimwear+market+size",
    title: "Kenya swimwear market size — Search",
    kind: "search",
    body: "Results for Kenya swimwear market size",
    links: [
      { label: "East African swimwear market reaches KES 520 million", pageId: "market", href: "https://www.businessdailyafrica.com/bd/markets/east-africa-swimwear-kes-520m" },
      { label: "Coastal Brands price list — resort swimwear", pageId: "pricing", href: "https://coastalbrands.ke/pricing" },
      { label: "Soko Swim average ticket hits KES 8,200", pageId: "soko", href: "https://sokoswim.ke/journal/average-ticket" },
      { label: "Bahari Wear founders and distribution", pageId: "team", href: "https://bahariwear.ke/about" },
    ],
  },
  {
    id: "market",
    tab: "Business Daily",
    url: "https://www.businessdailyafrica.com/bd/markets/east-africa-swimwear-kes-520m",
    title: "East African swimwear market reaches KES 520 million",
    kind: "article",
    body: `The Kenyan swimwear market is valued at roughly KES 520 million, growing about 8% annually, driven by coastal tourism in Mombasa, Diani, and Malindi.

Independent estimates put the TAM closer to KES 480–550 million. Hotel and resort channels account for nearly 40% of sell-through.

Analysts note limited local manufacturing and heavy reliance on imported fabric from Turkey and China. Demand spikes November through March, tracking the high season on the south coast.

A handful of Diani and Watamu boutiques still import finished goods rather than cutting locally. That import path is the main reason landed cost moves with the shilling.`,
    links: [
      { label: "Coastal Brands pricing", pageId: "pricing", href: "https://coastalbrands.ke/pricing" },
      { label: "Soko Swim ticket", pageId: "soko", href: "https://sokoswim.ke/journal/average-ticket" },
    ],
  },
  {
    id: "pricing",
    tab: "Coastal Brands",
    url: "https://coastalbrands.ke/pricing",
    title: "Coastal Brands price list — resort swimwear",
    kind: "article",
    body: `Coastal Brands lists one-piece suits from KES 3,500 to KES 6,500. Bikinis start at KES 2,900.

Resort packs for hotels are quoted at KES 4,200 average selling price. Shipping along the Mombasa–Nairobi corridor adds KES 180–250 per unit.

Wholesale terms are net-30 for properties that take 40+ units a season. The brand does not publish a subscription or membership fee — this is a product business, not SaaS.

A competing Diani label, Soko Swim, is often cited by buyers as sitting well above this range.`,
    links: [
      { label: "Soko Swim journal", pageId: "soko", href: "https://sokoswim.ke/journal/average-ticket" },
    ],
  },
  {
    id: "soko",
    tab: "Soko Swim",
    url: "https://sokoswim.ke/journal/average-ticket",
    title: "Soko Swim average ticket hits KES 8,200",
    kind: "article",
    body: `Soko Swim reported an average ticket of KES 8,200 in Q2, well above Coastal Brands' KES 3,500–6,500 range.

Founder Amina Otieno attributes the premium to Italian fabric and boutique hotel placement. The team is three people. They do not yet hold a KEBS standardization mark.

Otieno says repeat hotel orders now make up 55% of revenue. Walk-in Diani traffic is the remainder. She flags fabric lead times as the operational bottleneck, not demand.

That pricing gap against Coastal Brands is the disagreement a diligence memo should not paper over.`,
    links: [
      { label: "Bahari Wear about", pageId: "team", href: "https://bahariwear.ke/about" },
    ],
  },
  {
    id: "team",
    tab: "Bahari Wear",
    url: "https://bahariwear.ke/about",
    title: "Bahari Wear founders and distribution",
    kind: "article",
    body: `Bahari Wear was founded by CEO Brian Mwangi and co-founder Lila Njeri, previously at a Mombasa textile cooperative. The team is six people.

They sell through Nakumatt-era successors and Diani boutiques. Import duty on synthetic stretch fabric remains a distribution risk.

Mwangi previously ran a school-uniform cut-and-sew line. Njeri handled export documentation at the cooperative. Neither has raised institutional capital. They are currently talking to a Mombasa family office.

KEBS marking is in progress. Until it lands, supermarket distribution stays blocked.`,
    links: [
      { label: "Market size article", pageId: "market", href: "https://www.businessdailyafrica.com/bd/markets/east-africa-swimwear-kes-520m" },
    ],
  },
];

export function pageByUrl(url: string): DemoPage | undefined {
  return DEMO_PAGES.find((p) => p.url === url);
}
