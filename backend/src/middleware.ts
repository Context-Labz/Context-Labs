import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// CORS for the browser-extension side panel. The extension runs on its own
// chrome-extension:// origin, so every /api/* response needs these headers —
// doing it once here beats sprinkling headers through every route file.
//
// Default is "*" because this backend holds no cookies/session (Auth0 was
// cut from scope), so a wildcard is safe. Set EXTENSION_ORIGIN to lock it
// down to your published extension's chrome-extension://<id> origin later.
const ALLOWED_ORIGIN = process.env.EXTENSION_ORIGIN || "*";

function corsHeaders(req: NextRequest): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    // PATCH is here for /api/workspace (setting the research question); DELETE
    // and PUT for the CopilotKit runtime's thread/memory routes. A cross-origin
    // request with any of these is never a "simple request", so the browser
    // always preflights — a method missing here fails the OPTIONS check before
    // the route is ever reached.
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    // Echo back whatever the browser says it wants to send, rather than a fixed
    // list. The CopilotKit client sets its own headers and the list would drift
    // — one unlisted header silently fails the preflight and the chat just
    // stops working with nothing in the network tab but a red OPTIONS.
    "Access-Control-Allow-Headers":
      req.headers.get("access-control-request-headers") || "Content-Type",
    // Streaming responses: let the client read the headers it needs.
    "Access-Control-Expose-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}

export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders(req))) res.headers.set(k, v);
  return res;
}

export const config = { matcher: "/api/:path*" };
