// Enforcement for the project's one hard rule: no claim without a source.
//
// Until now that rule was only ever PROMPTED ("every claim MUST have a
// verbatim quote"). Nothing checked, and a small model paraphrases under
// compression — so a cell could carry a confident citation whose quote does
// not literally appear on the cited page. That's the exact claim a judge is
// most likely to spot-check, so it's checked here instead of hoped for.

// Models normalise punctuation even when asked for verbatim text: curly
// quotes become straight, en-dashes become hyphens, runs of whitespace
// collapse. Those rewrites don't make a quote fabricated, so normalise both
// sides before comparing rather than rejecting honest evidence on a typographic
// difference.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A quote shorter than this can't meaningfully ground a claim — "KES" or
// "growing" would match almost any page by accident.
const MIN_QUOTE_LENGTH = 12;

/**
 * True if `quote` genuinely appears in `sourceText`.
 *
 * IMPORTANT: pass the SAME text that was sent to the model. Every caller
 * truncates (`.slice(0, 4000)`) before prompting, and checking against the
 * untruncated original would accept a quote the model could not have seen.
 */
export function quoteIsGrounded(sourceText: string, quote: string): boolean {
  const needle = normalize(quote ?? "");
  if (needle.length < MIN_QUOTE_LENGTH) return false;
  return normalize(sourceText ?? "").includes(needle);
}
