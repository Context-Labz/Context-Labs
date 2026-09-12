// Retrying fetch for the LLM providers.
//
// WHY THIS EXISTS: measured from this network, calls to openrouter.ai stall
// roughly half the time — the connection opens, the request uploads, and then
// ZERO bytes come back until the client gives up. Both of Cloudflare's edge IPs
// behave the same, while api.exa.ai was 4/4 over the same period, so it is
// specific to that host rather than general flakiness.
//
// A stalled request is indistinguishable from a slow one without a deadline,
// so the default behaviour is to hang for however long the caller allows —
// which on the demo path means the sidebar sits there with no response and no
// error. Capping the wait for RESPONSE HEADERS and retrying converts a ~50%
// hang rate into a recoverable few seconds.
//
// The timeout deliberately covers headers only. fetch() resolves as soon as
// headers arrive, so the timer is cleared at that point and the body — which
// for a streamed completion is the whole answer, arriving over many seconds —
// is never interrupted. Timing out the full response instead would truncate
// every long generation.

export interface RetryingFetchOptions {
  attempts?: number;
  headerTimeoutMs?: number;
}

export function createRetryingFetch(opts: RetryingFetchOptions = {}) {
  const attempts = opts.attempts ?? 4;
  // Healthy responses return headers in 1-2s (measured), so 10s is ~5x
  // headroom and still bounds the worst case at ~43s rather than forever.
  const headerTimeoutMs = opts.headerTimeoutMs ?? 10_000;

  return async function retryingFetch(
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), headerTimeoutMs);

      // Respect a caller-supplied signal (the AI SDK passes one for cancelled
      // runs) while still applying our own deadline.
      const signal = init?.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal;

      try {
        const res = await fetch(input, { ...init, signal });
        clearTimeout(timer); // headers are in — let the body stream uninterrupted
        return res;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;

        // A cancellation from the CALLER is intentional — never retry it.
        if (init?.signal?.aborted) throw err;

        if (attempt < attempts) {
          const backoff = 400 * attempt;
          console.warn(
            `[research-room] ${describe(input)} stalled or failed ` +
              `(attempt ${attempt}/${attempts}); retrying in ${backoff}ms`
          );
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    throw new Error(
      `${describe(input)} failed after ${attempts} attempts (last error: ` +
        `${lastError instanceof Error ? lastError.message : String(lastError)}). ` +
        `This is usually the network path to the provider, not a bad key.`
    );
  };
}

function describe(input: string | URL | Request): string {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(url).host;
  } catch {
    return "upstream request";
  }
}
