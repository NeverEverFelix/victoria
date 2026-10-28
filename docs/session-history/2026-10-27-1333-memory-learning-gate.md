# Session: Memory Learning Eligibility Gate

- Date: 2026-10-27
- Time: 13:33 EDT
- Status: Partial
- Scope: Continue the conversational-core findings by broadening guarded stable-memory learning to read-only savings-progress turns.

## Outcome

Added an explicit eligibility policy for optional provider-backed memory extraction. It includes read-only savings-progress turns and excludes unsupported/action-oriented intents, uncertain messages, sensitive evidence, and memory forget/correction requests. Existing pending-action gates remain in place.

## Work Completed

- Added [memory-learning-policy.ts](../../src/agent/memory/memory-learning-policy.ts) and used it to gate optional provider extraction in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added unit coverage for eligible savings-progress turns and exclusions, plus an agent regression confirming a stable fact can be learned without replacing the deterministic ledger summary.
- Updated [mvp.md](../mvp.md) and [test-plan.md](../test-plan.md) with the extraction boundary.

## Decisions

- Confirmed implementation choice: optional provider extraction runs only for the existing read-only/reflective event class allowlist, now including `savings_progress`; uncertain, sensitive, lifecycle-management, and non-read-only intents are excluded.
- No change to memory categories, approval behavior, or ledger behavior.

## Verification

- Focused tests: 86 passed across the memory policy and preference-memory suites.
- `npm run check` passed: 81 test files passed, 9 skipped; 734 tests passed, 23 skipped, 9 todo.
- `git diff --check` passed.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- Extraction is now guarded across the supported read-only/reflection intents, but it is not universal across every intent. Transactional and uncertain paths remain excluded by design; broader candidate capture should be driven by concrete missed-fact traces and preserve pending action sequencing.
- Evidence-linked episodic summaries, reviewable memory controls and telemetry, wider orchestration refactoring, and provider-backed multi-turn evaluation remain open deep-dive findings.
- The worktree contains pre-existing user changes and untracked files; none were reset or overwritten.

## Recommended Next Step

Address episode grounding next by ensuring summaries attribute user claims separately from Victoria's workflow outcomes and only assert persistence when an authoritative ledger result exists.
