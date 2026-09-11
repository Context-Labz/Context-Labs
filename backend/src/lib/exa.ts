// Thin typed wrapper around Exa — the agent's eyes on the live web.
export interface ExaResult {
  title: string;
  url: string;
  text: string;
}

export async function exaSearch(query: string, numResults = 3): Promise<ExaResult[]> {
  if (!process.env.EXA_API_KEY) {
    throw new Error("EXA_API_KEY missing — copy .env.example to .env.local");
  }
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": process.env.EXA_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      numResults,
      type: "auto",
      contents: { text: { maxCharacters: 2500 } },
    }),
  });
  if (!res.ok) throw new Error(`Exa search failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.results || []).map((r: any) => ({
    title: r.title ?? r.url,
    url: r.url,
    text: r.text ?? "",
  }));
}
