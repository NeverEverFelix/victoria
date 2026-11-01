# Session: Extend conversational context and history resolution

- Date: 2026-10-27
- Time: 13:25 America/New_York
- Status: Partial
- Scope: Continue addressing the conversational-core review findings after the pending-topic routing fix.

## Outcome

The read-only responder now receives the canonical provenance-aware context, validates derived projections with their conditional meaning, and permits a larger response only for explicit detailed requests. Pending-action topic shifts can learn eligible stable user facts without interrupting the answer. Episodic summarization receives adjacent assistant prompts only to interpret short user replies; assistant claims do not establish that a ledger operation completed. Historical event questions now have a conservative resolver with explicit unique, ambiguous, unmatched, and not-requested outcomes.

## Work Completed

- Passed `VictoriaConversationContext` into general and pending-topic responses in [victoria-agent.ts](../../src/agent/victoria-agent.ts) and included its validated facts in response amount validation in [conversation-responder.ts](../../src/agent/conversation-responder.ts).
- Added conservative conditional-language validation for derived annual projections and a separate 4,000-character cap for explicitly detailed responses; ordinary responses remain capped at 1,500 characters.
- Added [conversation-routing.ts](../../src/agent/conversation-routing.ts) as a bounded routing module and regression tests for action/history question boundaries.
- Added [historical-event-reference-resolver.ts](../../src/agent/historical-event-reference-resolver.ts), integrated it into canonical conversation context, and made ambiguous or unmatched pending-history lookups ask for clarification.
- Extended [episodic-summary.ts](../../src/agent/memory/episodic-summary.ts) and its OpenAI adapter to receive bounded user/preceding-assistant pairs. Validation still accepts supporting quotes only from exact user messages.
- Added regressions for financial context grounding, pending-action memory learning, episode turn-pair boundaries, historical event match states, and response depth.
- Updated the product behavior and test contract in [mvp.md](../mvp.md), [test-plan.md](../../tests/test-plan.md), and [agent-work-queue.md](../../docs/agent-work-queue.md).

## Decisions

- Confirmed: event resolution uses only events supplied from the current user's current conversation. Ambiguous and unmatched references clarify; event resolution cannot approve, revise, or record anything.
- Confirmed: assistant dialogue may disambiguate a short user reply during episode summarization but is never evidence of a completed workflow or persisted ledger state.
- The full deep-dive is not complete. General retrieval planning, intent-independent memory eligibility beyond intercepted pending-topic turns, authoritative workflow outcomes in episode summaries, broader provider evaluation, full orchestrator decomposition, and PR/configuration readiness remain open.

## Verification

- `npm run check`: passed; 79 test files passed, 9 skipped; 725 tests passed, 23 skipped, 9 todo.
- Focused lint, type checks, and conversational-core tests passed during implementation.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- No paid provider replay was run. The responder changes are covered by deterministic unit tests, but provider quality remains unverified.
- Historical references are resolved for read-only conversation context only; they do not yet form a general action-target resolver.
- The worktree contained pre-existing uncommitted changes, which were preserved.

## Recommended Next Step

Build the common memory retrieval planner and continue separating dialogue state from financial workflows. Then run the documented provider-backed multi-turn evaluation only when an explicitly approved local provider credential and charge acknowledgement are available.
