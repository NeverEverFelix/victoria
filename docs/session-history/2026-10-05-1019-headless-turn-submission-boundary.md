# Session: Headless Turn Submission Boundary

- Date: 2026-10-05
- Time: 10:19 EDT
- Status: Completed
- Scope: Add an authenticated, ownership-checked turn submission handler and headless route contract tests.

## Outcome

Added a framework-neutral Web Request handler that authenticates before parsing input, checks conversation ownership, validates the message and idempotency key, fingerprints the request through an injected keyed-digest provider, and accepts a queued turn through the repository. It returns only the turn ID and queued status.

## Work Completed

- Added [`submit-turn-handler.ts`](../../src/app/http/submit-turn-handler.ts) with no-store responses, bounded JSON reads, ownership-safe 404 behavior, idempotent replay signaling, and generic service errors.
- Added the original user message to the queued turn record so an accepted turn has work input for a future worker.
- Added handler tests for authorization, ownership, malformed and oversized requests, replay, conflicts, and unavailable dependencies.
- Updated the readiness checklist, test plan, and work queue.

## Decisions

- Authentication, conversation ownership, request fingerprinting, ID generation, and time are injected boundaries; no provider was selected.
- Request fingerprints must use a keyed digest rather than a plain hash of predictable financial text.
- This is a headless handler contract, not a wired Next.js route. No real authentication provider or durable repository is connected.

## Verification

- `npm run check` passed: agent setup validation, lint, both TypeScript checks, and tests (208 passed, 1 todo, 1 skipped).
- `git diff --check` passed.

## Unresolved

- Implement a verified session/token authenticator and a user-scoped conversation ownership lookup.
- Select and implement durable storage, then wire this handler to a server route.
- Define rate limiting and operational request admission before exposing the route publicly.
- The live `VictoriaAgent` still does not consume accepted turns; queue processing and durable conversation/proposal state remain future work.

## Recommended Next Step

Implement and test the durable turn repository adapter with database-enforced user/idempotency uniqueness and atomic revision compare-and-transition. Then add the concrete server route using the reviewed authentication and conversation ownership adapters.
