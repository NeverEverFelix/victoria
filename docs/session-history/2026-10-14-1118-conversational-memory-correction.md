# Session: Conversational Financial Memory Correction

- Date: 2026-10-14
- Time: 11:18 EDT
- Status: Partial
- Scope: Replace the proposed memory-management surface with an in-conversation correction path for a specific recent financial fact.

## Outcome

Victoria's mock-backed agent now recognizes explicit past-spend corrections in the normal turn flow. It resolves against a unique current financial fact mentioned by Victoria in recent conversation, appends the correction, keeps single-transaction details distinct from rolling Plaid and merchant-spend aggregates, and asks for clarification when it cannot identify one target.

This entry supersedes the product direction in [`2026-10-14-1102-memory-review-correction-forget.md`](2026-10-14-1102-memory-review-correction-forget.md): users should not review, edit, or forget memories through a separate interface. The handler from that slice and its runtime exposure were removed. The older entry remains as append-only session history.

## Work Completed

- Added correction phrase extraction in [`extract-preference.ts`](../../src/agent/memory/extract-preference.ts).
- Routed a clear recent financial correction through `VictoriaAgent.respond()` in [`victoria-agent.ts`](../../src/agent/victoria-agent.ts).
- Added linked append-only handling for transaction-detail corrections in [`memory-orchestrator.ts`](../../src/agent/memory/memory-orchestrator.ts).
- Removed the standalone memory-management handler, its tests, app export, and optional runtime property.
- Updated the product story, memory schema, safety contract, test plan, and work queue to specify conversational correction only.

## Decisions

- Users correct conversational details naturally; there is no separate memory-review or memory-edit surface.
- A correction must match one recent financial fact. Ambiguity asks a follow-up and writes no memory.
- A single-day correction is stored separately from a rolling transaction or merchant-spend aggregate; it does not modify Plaid records or savings state.
- The correction path is part of the normal `VictoriaAgent` mock-backed composition. A deployable Next route is still not mounted because this repository has no application session/authentication implementation or configured runtime. No user-supplied identity is accepted as a substitute.
- No live integrations are enabled.

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- No tests were added or run in this session. No live Plaid, OpenAI, or database calls were made.

## Unresolved

- The empty Next API directory has no route composition or session authentication. Mounting a callable web route requires that server boundary first.
- Automated coverage for phrase extraction, unique target matching, ambiguity behavior, and aggregate preservation remains pending.
- The persistent Supabase/OpenAI/Plaid runtime remains opt-in and unconfigured.

## Recommended Next Step

Implement the app's server authentication/session boundary and an authenticated chat route that invokes the mock-backed agent. Add focused mocked tests for the correction path before connecting any live provider or database.
