import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Project ref from the Trigger.dev dashboard, e.g. "proj_abc123"
  project: process.env.TRIGGER_PROJECT ?? "<your-project-ref>",
  dirs: ["./src/trigger"],
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10000, factor: 2, randomize: true },
  },
  maxDuration: 600,
});
