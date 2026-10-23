# Session: Follow Up on Auth and Approval Review Findings

- Date: 2026-10-19
- Time: 14:24 America/New_York
- Status: Completed
- Scope: Apply the two additional review findings that matched the current runtime contracts.

## Outcome

Bearer scheme parsing is case-insensitive, and persistent goal allocation approvals now carry their user identity and are rejected if it differs from the allocation owner.

## Work Completed

- Made Supabase bearer scheme matching case-insensitive and added coverage in [the authenticator tests](../../tests/unit/app/supabase-bearer-auth.test.ts).
- Added user identity to [goal allocation approval records](../../src/domain/savings/types.ts), populated it in the agent and persistence adapter, and reject mismatches in the adapter.
- Added an integration assertion that a cross-user approval is rejected.
- Reviewed the remaining automated findings. Several were contradicted by current contracts (for example, Next.js route parameters are promises in this app's Next version and durable IDs are text); proposals lacking persistent correction approval state remain a known gap documented by prior work.

## Decisions

- Goal allocation approval identity is explicit in the approval record and must match the allocation owner.
- This follow-up does not expand the existing correction proposal persistence scope; correction proposal/approval state across restarts remains unresolved.

## Verification

- `npm run check` passed: 480 tests passed, 15 skipped, and 9 todo. The existing `_observedThrough` lint warning remains.
- The gated PostgreSQL integration suite passed: 11 tests.
- The preceding commit's GitHub CI passed. This follow-up commit will trigger fresh CI and AI review.

## Unresolved

- PR #19 remains open for human review.
- Correction proposals and approvals are not persisted across runtime restarts.

## Recommended Next Step

Review only newly substantiated findings from the follow-up automated review; preserve the current explicit user and mocked-ledger boundaries.
