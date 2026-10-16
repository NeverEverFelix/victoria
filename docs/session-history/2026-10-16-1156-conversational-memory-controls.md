# Session: Conversational Memory Controls

- Date: 2026-10-16
- Time: 11:56 America/New_York
- Status: Completed
- Scope: Route user-facing memory review and management through chat and remove the separate local memory settings screen.

## Outcome

Memory review, selected forget, Forget all, and Pause/resume are now handled from explicit language in the chat. Existing conversational correction behavior remains available. The local settings page and its local-only session issuer were removed after the user clarified that people should manage memory by talking to and correcting Victoria in chat.

## Work Completed

- Added conservative memory-control intent parsing and agent handling in [memory-control-intent.ts](../../src/agent/memory/memory-control-intent.ts) and [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added tests for review, selected forget, ambiguous forget clarification, Forget all, and Pause/resume in [conversational-memory-controls.test.ts](../../tests/unit/agent/conversational-memory-controls.test.ts).
- Removed the memory settings page and local demo session issuer.
- Updated the product contract, queue, environment notes, and test plan to keep memory management conversational.
- Authenticated memory-control handlers remain available to trusted application code; no standalone user memory screen is exposed.

## Decisions

- Confirmed by the user: the user-facing way to change memory is to speak to Victoria in chat, including correcting Victoria's understanding.
- Explicit forget requests can delete conversational memories; an unclear or non-unique request asks for clarification.
- Transaction-profile memory remains managed through its connected-profile lifecycle.

## Verification

- `npm run check` passed: agent validation, lint (one pre-existing warning), type checks, and tests (57 passed, 6 skipped; 476 passed, 4 skipped, 9 todo).
- The first check run found stale generated Next.js types for the removed page; deleting only `.next` generated types resolved the stale references.
- Existing warnings: unused `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts`; Node experimental SQLite warnings.

## Unresolved

- Memory-control phrasing is intentionally conservative and deterministic; broader natural-language variants may need coverage as real chat transcripts become available.
- The web settings API handlers remain for trusted application integrations and are not exposed through a user-facing screen.

## Recommended Next Step

- Add more examples to the conversational control parser only when the intended phrasing is clear from product usage; retain clarification for ambiguous forget requests.
