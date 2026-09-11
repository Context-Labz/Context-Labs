// The same research loop, packaged as a Trigger.dev background job.
// Story for judges: "research continues even if you close the tab."
import { task } from "@trigger.dev/sdk";
import { runResearch } from "@/lib/agent/run-research";

export const deepResearch = task({
  id: "deep-research",
  run: async (payload: { workspaceId: string; question: string; columns: string[] }) => {
    // TODO(day-of): stream per-provider progress back to the UI via
    // ws activity log or Trigger.dev realtime. Keep it simple first.
    const summary = await runResearch(payload);
    return { ok: true, ...summary };
  },
});
