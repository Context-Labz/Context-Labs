# Context Labs — 0.2

Repositioned from a CopilotKit chat docked in a side panel to a quiet
browser-native research assistant.

- Highlights, tab switches, and link clicks feed the same workspace as
  captured pages. Recognition proposes; the analyst confirms before page
  body text is sent.
- Agent output is suggested reads, a standing plan, an optional comparison
  table, and an end-of-session summary of everything the panel showed —
  not a chat transcript.
- Backend playground at `/` so the loop can be tried without loading the
  unpacked extension.
- LLM and Exa keys are optional; a bundled corpus + keyword extractor
  keeps the demo alive without credentials.
- CopilotKit removed from the extension (it was ~17MB of unused chat UI).
