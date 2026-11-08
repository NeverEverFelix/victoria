# Session: Conversation memory capture service

- Date: 2026-10-31
- Time: 06:17 EDT
- Status: Partial
- Scope: Continue F04 by extracting direct evidence-backed memory capture and transaction-supported merchant claim reconciliation from `VictoriaAgent`.

## Outcome

`ConversationMemoryCaptureService` now owns direct memory candidate validation, append-only memory writes, merchant claim comparison against linked transaction evidence, additional supported fact capture, and its acknowledgement. It returns the existing spend-correction candidate and whether covered-expense interest was saved so the coordinator can continue its financial path. The extraction preserves the existing behavior while reducing `VictoriaAgent` from 1,952 lines to 1,844 lines in this worktree.

## Work Completed

- Added [`conversation-memory-capture-service.ts`](../../src/agent/conversation-memory-capture-service.ts) and delegated the early explicit-memory capture segment from `VictoriaAgent`.
- Kept evidence checks for user attribution, inactive-interest corrections, bounded evidence, exact transaction-provider reliability, linked supersession, and durable source-turn references.
- Added [`conversation-memory-capture-service.test.ts`](../../tests/unit/agent/conversation-memory-capture-service.test.ts) for explicit preference provenance, covered-expense interest capture without replacing the financial response, and rejection of quoted/third-party statements.
- Updated the F04 row in the [architecture review crosswalk](../architecture/conversation-architecture-spec-follow-up-2026-10-29.md).

## Decisions

- Captured memories remain append-only and evidence-bound. User statements and corrections are distinct from transaction-supported amount evidence.
- Saving an interest alongside an employer-covered expense does not replace the financial response or create a savings proposal.
- The service performs memory writes only; it has no financial action or ledger tools.

## Verification

- Focused capture, preference-memory, and agent tests — passed, 287/287.
- The first `npm run check` run reached Vitest but the default worker pool timed out on two unrelated tests and failed to start several other workers; no assertion regression was reported by those worker failures.
- Bounded full verification — passed: `npm run agent:validate && npm run lint && npm run typecheck && npm run typecheck:test && npm test -- --maxWorkers=4 && git diff --check`; 124 test files passed, 9 skipped; 1,105 tests passed, 29 skipped, and 9 todo.
- Existing Node SQLite experimental-feature warnings appeared during the test run.

## Unresolved

- F04 remains partial: `VictoriaAgent` still owns a substantial turn coordinator and pending workflow sequencing.
- Other implementation and external evidence gaps remain in the architecture crosswalk.
- Human conversation and memory relevance scoring, post-optimization live provider measurements, approved performance targets, and hosted PostgreSQL outage/multi-worker parity remain open external validation gates.
- The worktree contains many uncommitted architecture-review changes from earlier work; this entry records only the current extraction.

## Recommended Next Step

Continue auditing the remaining F01/F02/F04/F05 implementation gaps. Preserve source attribution and the existing deterministic approval and mock-ledger boundaries during further extractions.
