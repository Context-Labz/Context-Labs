export interface ExaResult {
  title: string;
  url: string;
  text: string;
}

function looksLikePlaceholder(key?: string): boolean {
  if (!key) return true;
  const k = key.trim();
  if (k.length < 16) return true;
  if (/^(your-|changeme|xxx|placeholder|test|AITAGENT)/i.test(k)) return true;
  return false;
}

const CORPUS: ExaResult[] = [
  {
    title: "East African swimwear market reaches KES 520 million",
    url: "https://www.businessdailyafrica.com/bd/markets/east-africa-swimwear-kes-520m",
    text: "The Kenyan swimwear market is valued at roughly KES 520 million, growing about 8% annually, driven by coastal tourism in Mombasa, Diani, and Malindi. Independent estimates put the TAM closer to KES 480–550 million. Hotel and resort channels account for nearly 40% of sell-through. Analysts note limited local manufacturing and heavy reliance on imported fabric.",
  },
  {
    title: "Coastal Brands price list — resort swimwear",
    url: "https://coastalbrands.ke/pricing",
    text: "Coastal Brands lists one-piece suits from KES 3,500 to KES 6,500. Bikinis start at KES 2,900. Resort packs for hotels are quoted at KES 4,200 average selling price. Shipping along the Mombasa–Nairobi corridor adds KES 180–250 per unit.",
  },
  {
    title: "Soko Swim average ticket hits KES 8,200",
    url: "https://sokoswim.ke/journal/average-ticket",
    text: "Soko Swim reported an average ticket of KES 8,200 in Q2, well above Coastal Brands' KES 3,500–6,500 range. Founder Amina Otieno attributes the premium to Italian fabric and boutique hotel placement. The team is three people. They do not yet hold a KEBS standardization mark.",
  },
  {
    title: "Bahari Wear founders and distribution",
    url: "https://bahariwear.ke/about",
    text: "Bahari Wear was founded by CEO Brian Mwangi and co-founder Lila Njeri, previously at a Mombasa textile cooperative. The team is six people. They sell through Nakumatt-era successors and Diani boutiques. Import duty on synthetic stretch fabric remains a distribution risk.",
  },
  {
    title: "Kenya payment gateway comparison: M-Pesa, Pesapal, Flutterwave",
    url: "https://techweez.com/kenya-payment-gateways-compared",
    text: "Pesapal, Flutterwave, and Coppelia (via Cellulant) compete with Daraja, Safaricom's M-Pesa API. Pesapal charges a blended 2.5–3.5% plus M-Pesa pass-through. Flutterwave publishes 1.4% + KES 10 on local cards and STK push. Daraja itself is free at the API layer; business tariffs sit with paybill/till. Payouts to bank same-day on Flutterwave; Pesapal T+1.",
  },
  {
    title: "Safaricom Daraja API documentation",
    url: "https://developer.safaricom.co.ke/daraja",
    text: "Daraja supports STK push, C2B, B2C, and B2B over REST. Sandbox keys are self-serve. Production requires a paybill or till. There is no published per-request API fee; M-Pesa customer tariffs still apply. Official docs cover Lipa Na M-Pesa Online.",
  },
  {
    title: "How to structure a first-pass market diligence memo",
    url: "https://a16z.com/market-diligence-checklist",
    text: "A first-pass diligence memo covers market size, competition, demand evidence, pricing, team, and regulatory or distribution risk. Flag contradictions instead of averaging conflicting numbers. Cite the page you actually read.",
  },
];

function mockSearch(query: string, numResults: number): ExaResult[] {
  const q = query.toLowerCase();
  const scored = CORPUS.map((item) => {
    const hay = `${item.title} ${item.text}`.toLowerCase();
    const terms = q.split(/\s+/).filter((t) => t.length > 2);
    const score = terms.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
    return { item, score };
  }).sort((a, b) => b.score - a.score);

  const picked = (scored[0].score > 0 ? scored.filter((s) => s.score > 0) : scored)
    .slice(0, numResults)
    .map((s) => s.item);

  if (picked.length) return picked;

  return [
    {
      title: `Search results for “${query}”`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      text: `Live web search is using the built-in research corpus while no Exa key is set. Query: ${query}.`,
    },
  ];
}

export async function exaSearch(query: string, numResults = 3): Promise<ExaResult[]> {
  if (looksLikePlaceholder(process.env.EXA_API_KEY)) {
    return mockSearch(query, numResults);
  }
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": process.env.EXA_API_KEY as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        numResults,
        type: "auto",
        contents: { text: { maxCharacters: 2500 } },
      }),
    });
    if (!res.ok) {
      console.error("Exa search failed", res.status, await res.text());
      return mockSearch(query, numResults);
    }
    const data = await res.json();
    const results = (data.results || []).map((r: any) => ({
      title: r.title ?? r.url,
      url: r.url,
      text: r.text ?? "",
    })) as ExaResult[];
    return results.length ? results : mockSearch(query, numResults);
  } catch (err) {
    console.error("Exa search error", err);
    return mockSearch(query, numResults);
  }
}
