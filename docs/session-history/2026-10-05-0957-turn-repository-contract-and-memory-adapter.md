# Session: Turn Repository Contract And In-Memory Adapter

- Date: 2026-10-05
- Time: 09:57 EDT
- Status: Completed
- Scope: Define user-scoped turn repository semantics and exercise them with an in-memory adapter.

## Outcome

Added the turn repository contract and a single-process adapter. Duplicate submissions for the same user, idempotency key, conversation, and request fingerprint return the original turn. Reusing a key for different request content conflicts. Updates use a revision check so only one caller can apply a transition at a given revision.

## Work Completed

- Added the `TurnRepository` port and conflict/not-found/revision errors in [`turn-repository.ts`](../../src/app/turns/turn-repository.ts).
- Added [`InMemoryTurnRepository`](../../src/app/turns/in-memory-turn-repository.ts), with user/conversation-scoped reads and synchronous compare/check/write behavior inside the process.
- Extended the domain turn record with a request fingerprint and monotonic revision in [`lifecycle.ts`](../../src/domain/turns/lifecycle.ts).
- Added repository behavior tests and updated the readiness checklist and test plan.

## Decisions

- Confirmed previously by the user: prioritize server and durable state.
- Idempotency keys are scoped to a user; the same key must also match the original conversation and request fingerprint to replay.
- The in-memory adapter is for tests and development only. It provides no cross-process or restart durability.
- No database, hosting platform, authentication mechanism, or durable adapter was selected.

## Verification

- `npm run check` passed: agent setup validation, lint, both TypeScript checks, and tests (201 passed, 1 todo, 1 skipped).
- `git diff --check` passed.

## Unresolved

- The repository contract is not connected to route handlers or the live `VictoriaAgent`.
- A production adapter must enforce acceptance uniqueness and revision compare-and-transition atomically in durable storage.
- Authenticated turn admission, conversation leases, durable proposals, and provider-backed multi-agent evaluation remain open.

## Recommended Next Step

Design the authenticated turn request/response boundary and route-handler contract tests. After those semantics are reviewed, implement a durable repository adapter and prove uniqueness and compare-and-transition across independent repository instances.
