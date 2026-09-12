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

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Workspace-Id",
  };
}

export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders())) res.headers.set(k, v);
  return res;
}

export const config = { matcher: "/api/:path*" };
