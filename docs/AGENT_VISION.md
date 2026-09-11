# What we're building — as of tonight (11 Sept 2026)

This is a planning/vision doc, not code. Living document — expected to
change once the official hackathon handbook is released tomorrow; treat
everything below as our current best answer, not a locked spec.

## The problem

"AI research browser extension" is a crowded category — TabMate, Weft,
FolioLM, TabScribe, Kepler, and Beaver all already collect pages, save
sources, and answer research questions with citations. Perplexity's
Research mode makes "search many sources, synthesize, cite" table stakes,
not a differentiator. So the question we're answering isn't "can an agent
research inside a browser" — it's already been answered by several
products — but "what does the browser give the agent that a standalone
chatbox structurally can't."

## Our answer

Our answer, as implemented tonight: **a standing research plan the browser
feeds evidence into, that flags disagreement instead of silently
synthesizing over it.**

Concretely, that means the agent maintains state across a browsing session
— which objectives are still open, what's already been found, where two
sources conflict — that a stateless chatbox has no way to carry. Pasting
one page into ChatGPT gets you a summary of that page. It doesn't get you
"this contradicts something you captured three tabs ago, against an
objective you set at the start of the session."

## Primary vertical: startup / market diligence

We're fine-tuning the general "research agent" idea toward VC-style
first-pass diligence specifically, partly because a VC firm is one of the
hackathon's funders, and partly because it's what makes "research plan"
concrete: a fixed diligence checklist (market size, competition, demand,
pricing, team, regulatory risk) is a known, buildable shape, where a fully
open-ended research graph is not — not in one hackathon day.

The general/open-ended comparison mode (compare N named things on M
columns — e.g. "compare 5 payment gateways") still exists underneath as a
secondary mode, since it was the original build and works independently.
Whether to keep both modes visible in the final pitch, or narrow entirely
to the diligence framing, is still open — leaning toward keeping diligence
as the primary, default experience and comparison as a clearly secondary
option.

## The agent we're actually building — ambient, not chat-first

Decision (late 11 Sept): the primary interface is NOT the chat sidebar.
It's the analyst doing normal diligence browsing, with the agent noticing
and filing as they go. Chat stays as a secondary way to ask for something
directly. This is where the Innovation score lives — "a pattern whose
central value could not be reproduced in a standalone chatbox."

What the agent does without being asked:

1. **Recognizes what you're searching.** Google/Bing search URLs carry
   the query (`?q=`). The content script reads it (no AI) and maps it to an
   objective: "You searched *Kenya swimwear market size* — tracking under
   Market Size." Repeated searches with nothing saved → nudge: "Still no
   evidence for Market Size — want me to search for it?"
2. **Recognizes what page you're on.** On page load, plain keyword match
   against a small per-objective vocabulary (Pricing: price/plans/KES/per
   month; Team: founder/CEO/co-founder; Competition: vs/alternative/
   competitor). No LLM call. Side panel shows a badge: "Looks like evidence
   for **Pricing** — save it?" Only after the analyst confirms does the
   real LLM extraction (already built in `add-source`) run.
3. **Notes from highlights.** Right-click selected text → "Save to Research
   Room → <objective>" submenu via `chrome.contextMenus`. The analyst's own
   annotation, stored separately from agent-extracted evidence.
4. **Keeps the research trail.** Every relevant page/search logged against
   its objective with a timestamp — the audit trail for "where did that
   number come from?"
5. **Notices what you haven't looked at.** Deterministic rule over
   objective state ("5 competitor pages, 0 demand evidence") + a button
   that runs the existing Exa auto-research for that ONE objective.
6. **Keeps a running memo.** As evidence lands, the draft diligence memo
   updates (`set_report` already exists). Finish browsing → first draft is
   already there.

Plus, already built tonight: confidence per objective, contradiction
flagging instead of silent overwriting, human-in-the-loop resolution.

**Design principle (product AND rubric):** the agent proposes, the analyst
confirms. Recognition only runs while the side panel is open ("research
mode"); page text only goes to the backend after a badge is confirmed;
everything captured is visible. VC deal flow is confidential — this is a
real product decision, and it's also the "clear and controllable" line in
the Usefulness criterion.

## Build order for tomorrow (< 5 hours)

- **0:00–0:45 — first real run.** Real keys, run `TESTING_AND_DEPLOYMENT.md`
  end-to-end, fix what breaks. The agent has never actually executed; this
  IS building it.
- **0:45–2:15 — MUST (no AI, most browser-native):** #1 search
  recognition, #2 keyword badge + confirm-to-capture, #4 trail. Also the
  two small fixes from the judge review: a field to set the research
  question, and a `text.includes(quote)` check before accepting evidence.
- **2:15–3:00 — SHOULD (if on track):** #3 highlight-to-note, #5 gap
  nudge. #3 is a great five-second visual in the video.
- **3:00–4:15 — record + write.** Find the two conflicting pricing pages
  BEFORE filming. Description, repo push (commit the built `extension/dist`
  so judges don't need to build).
- **4:15–4:45 — social post, submit, buffer.**
- **Skip, write as "what's next":** LinkedIn/Crunchbase structured parsing,
  multi-session memory, shared team workspaces (Auth0).

## The video (one path, no chat)

Type the research question → Google the market → panel: "Tracking: Market
Size" → open an article → badge: "Market Size evidence — save?" → click →
open a competitor pricing page → badge: "Pricing" → highlight a number,
right-click, save → open a second pricing page → contradiction flag →
resolve it → panel shows strong on demand/pricing, nothing on team → nudge:
"No team evidence yet — search?" → click → memo draft appears. At no point
was a chat opened.

## Open questions for tomorrow, once the handbook is out

- Does the handbook's rules on pre-built code change how much of tonight's
  implementation we can carry forward vs. need to rebuild live? (See our
  separate discussion on this — current read: infra/scaffolding is fine
  as "starter code," the objectives/confidence/contradiction workflow
  itself should be rebuilt during the event to be safe.)
- ~~Research question input~~ — decided: add it tomorrow (in the MUST block).
- Final call on Chrome-only vs. a Firefox variant (see earlier
  conversation — Firefox needs a different `sidebar_action` manifest,
  a few hours of real work, not yet started).
- Whether any additional sponsor (Auth0 for a shared/multi-analyst
  workspace story, others per the handbook) is worth the hours against
  what's already built and demo-ready.
