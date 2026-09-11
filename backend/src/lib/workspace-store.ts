// In-memory workspace store. Deliberately boring: the demo lives in one process.
// SWAP LATER (stretch): Prisma + Postgres — schema sketched in prisma/schema.prisma.
//
// FIX (was gap #2 in the review): nothing used to call putWorkspace before a
// workspace was read, so getWorkspace() threw "not found" the first time
// anything touched it. POST /api/workspace is now the one explicit creation
// point the extension calls on side-panel open, before anything else runs.
//
// FIX (found by actually running the dev server and curling it, not just
// reading the code): a plain `const store = new Map()` at module scope is
// NOT a reliable cross-route singleton in Next.js dev mode. Confirmed by
// testing directly — a workspace created via POST /api/workspace 404'd when
// read from /api/research/add-source's copy of this module, because Next
// dev compiles each route as its own bundle and doesn't always share one
// module instance between them. This would have silently defeated the
// gap #1 fix (chat path and Exa path sharing "one store") the moment two
// different route files needed the same workspace.
//
// Standard fix (same pattern used for Prisma client singletons in
// Next.js): stash the Map on `globalThis`, which genuinely is one object
// for the whole process regardless of how many separate module instances
// get created. Verified this resolves it — see CHANGELOG.md for the
// before/after curl output.
import { ResearchWorkspace } from "./types";

const g = globalThis as unknown as { __researchRoomStore?: Map<string, ResearchWorkspace> };
const store = g.__researchRoomStore ?? (g.__researchRoomStore = new Map<string, ResearchWorkspace>());

export function getWorkspace(id: string): ResearchWorkspace {
  const ws = store.get(id);
  if (!ws) throw new Error(`Workspace not found: ${id}`);
  return ws;
}

export function putWorkspace(ws: ResearchWorkspace): void {
  store.set(ws.id, ws);
}

export function logActivity(ws: ResearchWorkspace, icon: string, text: string) {
  ws.activity.push({ icon, text, ts: new Date().toISOString() });
}

export function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
