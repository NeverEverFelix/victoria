# Session: Contextual Fast Path Audit

- Date: 2026-10-30
- Time: 15:11 America/New_York
- Status: Partial
- Scope: Continue F01 by ensuring mixed corrections, ordinary projections, event-history replies, and pending-workflow topic switches reach contextual turn understanding before deterministic handling.

## Outcome

Moved ordinary annual-projection, combined-projection, and read-only event-history responses after contextual turn interpretation. Moved remembered-spend correction and speculative-claim handling after that same interpretation. When a correction or speculative claim also asks a question, the read-only reply receives the advisory plan. The active pending-proposal event-history path now builds a scoped context containing the pending workflow and event records before interpretation. The shared read-only reply wrapper now supplies interpretation for pending-workflow topic-switch replies when the caller has not already supplied an understood snapshot. Exact correction targeting, amount calculations, approval/decline/revision, and duplicate-approval policy remain deterministic.

## Work Completed

- Added agent regressions for a speculative spend estimate plus an independent question, a remembered-spend correction plus a question, a combined annual projection, pending-proposal event history, ambiguous event history, and a read-only topic switch during a pending proposal. They assert contextual understanding receives the complete user turn and that no savings entry is created.
- Kept the correction parser and append-only memory correction path authoritative; a model interpretation cannot choose the corrected amount or memory target.
- Updated the [architecture crosswalk](../architecture/conversation-architecture-spec-follow-up-2026-10-29.md) and [test plan](../../tests/test-plan.md) with the audited fast-path boundaries and remaining gaps.
- Added a named tools intersection type at the conversation-history call sites so the repository TypeScript check accepts the optional history-list capability.
- The worktree was already broadly modified by the ongoing review follow-up. No unrelated changes were reverted; no commit, deployment, hosted migration, or real-money operation was performed.

## Decisions

- Keep exact pending approvals, duplicate-action protection, amount parsing, and projection arithmetic deterministic.
- Use model interpretation for the full turn before ordinary semantic replies, while retaining deterministic exact workflow and money policy.
- Keep F01 open for held-out provider-backed paraphrase evaluation and a complete audit of exact pending-workflow boundaries.

## Verification

- Focused agent regressions: 6 passed in the focused batches.
- `npm run check`: passed; 108 test files passed, 9 skipped; 1,024 tests passed, 27 skipped, 9 todo.
- `git diff --check`: passed after code and documentation changes.
- Existing SQLite experimental warnings appeared during the suite.

## Unresolved

- F01 held-out provider quality evidence and complete review of the remaining pending-workflow early returns.
- Blinded naturalness and memory relevance review, provider-backed post-optimization evaluation, product cost/latency targets, hosted outage and multi-worker parity, and remaining coordinator extraction work are still open as documented in the crosswalk.

## Recommended Next Step

Audit the remaining early returns inside exact pending-workflow approval, decline, and revision handling, then continue through F02-F08 and separate code-addressable work from human, provider, and hosting validation gates.
