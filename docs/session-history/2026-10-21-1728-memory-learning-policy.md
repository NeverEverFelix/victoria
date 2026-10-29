# Session: Predictable Memory Learning Policy

- Date: 2026-10-21
- Time: 17:28 America/New_York
- Status: Partial
- Scope: Define consistent automatic, clarification, and never-store rules for conversational learning and enforce a shared sensitive-evidence gate.

## Outcome

Documented a three-part memory policy and expanded the deterministic privacy gate shared by direct and provider-backed extraction. Clear ordinary direct statements remain eligible for automatic capture; uncertain or inferred facts are not persisted; sensitive personal details and credentials/account identifiers are rejected.

## Work Completed

- Added the learning policy to [decisions](../decisions.md#predictable-memory-learning-boundary), [MVP](../mvp.md#memory-learning-boundary), [Story 18](../user-stories.md), and [test plan](../../tests/test-plan.md).
- Expanded `isExplicitUserEvidence`'s shared rejection gate in [conversational-memory-extractor.ts](../../src/agent/memory/conversational-memory-extractor.ts) for sensitive health, political, religious, identity, immigration, credential, and financial identifier terms, plus contact details and long numeric identifiers.
- Added extraction and agent behavior tests for rejection of sensitive and credential-bearing evidence.
- The worktree also contains the preceding hosted persistent chat changes and session entry; those were not reverted or separated.

## Decisions

- Confirmed: auto-capture only clear, affirmed, first-person, stable, ordinary preferences, recurring habits, stated savings goals, and clear answers to specific typical-spend questions.
- Confirmed: tentative, hypothetical, ambiguous, and inferred claims are not stored. Ask a focused follow-up only when clarity matters to the current turn.
- Confirmed: conversational memory never stores sensitive personal details, credentials/account identifiers, third-party claims, or temporary circumstances. Transaction-profile memories remain separate and follow their own consent/freshness policy.
- Confirmed: broad provider extraction remains opt-in and must pass the shared evidence/privacy gate.

## Verification

- `npm run check` passed: 488 tests passed, 15 skipped, and 9 todo.
- `git diff --check` passed.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted existing experimental SQLite warnings.

## Unresolved

- The current shared privacy gate is lexical and cannot recognize every sensitive paraphrase or coded identifier. Provider sensitivity labels remain advisory.
- A dedicated stateful “ask to remember” flow is not implemented. Current policy avoids persisting uncertain facts and asks only where normal conversational clarification applies.
- Provider extraction is still disabled by default in runtime composition; this change does not enable it.

## Recommended Next Step

Evaluate the lexical privacy gate against a reviewed adversarial phrase set, then decide whether Victoria needs a distinct user-controlled consent flow for saving sensitive-but-useful context.
