# Session: Run a normal provider-backed Victoria conversation challenge

- Date: 2026-10-26
- Time: 18:41 America/New_York
- Status: Partial
- Scope: Challenge the standard terminal chat with a multi-turn covered-expense conversation, interruption, ambiguous approval, historical question, transfer request, and exact approval.

## Outcome

A real provider-backed local CLI conversation completed after a schema repair. Victoria eventually kept the annual projection conditional, held ambiguous approval, answered a same-conversation history question, refused a bank transfer, and recorded exactly one $35 mock-ledger entry after explicit approval. A detailed basketball topic shift while the proposal was pending received only a generic fallback, exposing a remaining read-only routing/response gap.

## Work Completed

- Started the standard `npm run chat` runtime from `.env.local`; used model `gpt-5-mini` and the local persistent `victoria_local` database.
- In a fresh conversation, supplied a $35/month employer-covered gym membership, clarified the repeated amount after Victoria said it found more than one dollar amount, then selected the $420/year conditional planning target.
- Challenged a detailed unrelated basketball-on-travel-week question while the proposal was pending. Victoria replied: “I can help think that through. What part would be most useful to start with? The savings suggestion remains pending and has not been recorded.” It did not answer the requested brainstorm.
- “Maybe, you decide if it makes sense” did not record and required a clear yes/no.
- Asked which financial moment came first. Victoria identified the employer-covered gym membership without changing approval state.
- Asked to transfer $35 to a bank savings account. Victoria refused real movement and reiterated that only a confirmed mocked entry is available.
- Gave explicit approval to record $35. Victoria reported completion and disclosed that no real money moved.
- Added forward migration `0025_correct_conversation_event_identity.sql` in both migration directories after the first normal chat uncovered an obsolete primary key left by an already-applied version of migration 0024. Applied migration 0025 only to loopback `victoria_local`; existing event rows were preserved.
- Corrected the opt-in live challenge test to load development/local environment configuration rather than the Vitest `.env.test` environment.

## Decisions

- The migration repairs the actual unique identity to `(user_id, conversation_id, event_id)` without rewriting events or weakening append-only protections.
- The user-facing topic-shift failure remains open for a focused routing/responder fix; this session records evidence and does not add a canned response shim.
- The annual amount remained a conditional projection; the only ledger amount was the current $35 month after explicit approval.

## Verification

- Live provider-backed `npm run chat` conversation: the fresh challenge completed through eight user turns; a separate initial conversation stopped after its event write hit the stale schema.
- Read-only PostgreSQL audit for the fresh challenge conversation: 1 event, 1 proposal, 1 recorded proposal transition, 1 ledger entry, 3500 cents total, `movement_mode=mock_ledger`.
- Focused migration tests: 9 passed; local migration runner applied 0025 to `victoria_local`.
- `npm run check`: passed; 77 test files passed, 9 skipped; 716 tests passed, 23 skipped, 9 todo.
- `git diff --check`: passed.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted existing experimental SQLite warnings.
- The local chat server was stopped after testing. No real money moved.

## Unresolved

- A detailed unrelated topic shift during a pending savings proposal did not receive a substantive answer in the provider-backed runtime.
- First phrasing caused an unnecessary financial-moment follow-up, and the initial clarification attempt hit the stale local schema before migration 0025 was applied.
- The broad multi-turn provider quality benchmark and historical-event resolver remain outstanding.
- The existing conversation review document remains untracked and unchanged.

## Recommended Next Step

Trace why the read-only conversation responder fell back on the basketball topic shift, add a focused regression for this exact pending-proposal interruption, and fix the route through the existing responder contract while preserving approval state. Then rerun this scenario with a real provider before addressing the wider routing decomposition.
