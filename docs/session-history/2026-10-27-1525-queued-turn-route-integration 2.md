# Session: Queued Turn Route Integration

- Date: 2026-10-27
- Time: 15:25 America/New_York
- Status: Completed
- Scope: Finish the HTTP path for accepting, processing, and polling queued Victoria turns with authenticated ownership and a public response projection.

## Outcome

Queued turns now have public intake, processing, and result-polling routes backed by the turn repository and processor. Responses expose only the message, action, and classification type/summary; confidence and internal clarification fields stay inside the agent boundary.

## Work Completed

- Added the authenticated POST intake route at [`app/api/victoria/[conversationId]/turns/route.ts`](../../app/api/victoria/%5BconversationId%5D/turns/route.ts), including stable idempotency support through the runtime submit handler.
- Added process and result routes at [`app/api/victoria/[conversationId]/turns/[turnId]/route.ts`](../../app/api/victoria/%5BconversationId%5D/turns/%5BturnId%5D/route.ts).
- Wired the process and result handlers into local and persistent runtimes; persisted completed turn payloads through migration `0026`.
- Tightened the HTTP response projection after a test exposed that confidence and clarification internals were returned. Updated handler and route tests.
- Updated the conversational deep dive and [`tests/test-plan.md`](../test-plan.md) with the route behavior.

## Decisions

- The accepted turn endpoint stores work; a host can invoke the authenticated process endpoint to execute it, and clients can poll the result endpoint.
- Public results include classification type and summary only. Internal confidence and clarification signals are not part of the HTTP contract.
- Existing product boundary remains unchanged: any savings recording remains mocked and confirmation-gated.

## Verification

- `npm run check` — passed: agent setup validation, lint, application and test typechecks, and Vitest (84 files passed, 9 skipped; 748 tests passed, 24 skipped, 9 todo).
- `git diff --check` — passed.
- Lint retains one pre-existing warning for `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts`.
- PostgreSQL restart integration coverage is present but skipped without `DATABASE_URL`; migration application was not exercised in this session.
- Node reports its existing experimental SQLite warnings during tests.

## Unresolved

- A production host still needs to schedule or invoke the process endpoint for accepted turns; the route does not itself install a background queue consumer.
- PostgreSQL migration and restart behavior require verification in an environment with `DATABASE_URL`.
- The worktree contains the combined prior provenance, episode suppression, processor, polling, and this route integration work; changes are not committed.

## Recommended Next Step

Run the PostgreSQL integration suite against a disposable database with migrations applied, then define and verify the deployment host's queued-turn processing trigger.
