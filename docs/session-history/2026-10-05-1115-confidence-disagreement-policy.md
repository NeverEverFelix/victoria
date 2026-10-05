# Session: Confidence and specialist disagreement policy

- Date: 2026-10-05
- Time: 11:15 EDT
- Status: Completed
- Scope: Make model confidence affect headless routing and exercise low-confidence and disagreement behavior across conversation turns.

## Outcome

Classification and Savings Reasoning now return validated confidence. A valid action-oriented classification or savings suggestion below the provisional 0.70 floor is routed to clarification. Confidence never authorizes a financial action. An uncertain turn can be followed by a clearer classification, proposal, and explicit approval; an amount disagreement can be resolved by user-provided amount and approval.

## Work Completed

- Added [confidence-policy.ts](../../src/agent/confidence-policy.ts), applying the floor to classification from both the specialist and baseline paths.
- Made confidence required in [team-prototype.ts](../../src/agent/team-prototype.ts) SavingsAssessment outcomes and validated it in [team-assessment-policy.ts](../../src/agent/team-assessment-policy.ts). Low-confidence suggestions fail to clarification; a specialist `ask` remains an acceptable conservative outcome.
- Updated mock specialists and scripted evaluation advice to emit confidence values.
- Added unit coverage for threshold boundaries, low-confidence suggestion fallback, and the low-confidence clarification-to-proposal-to-approval flow.
- Extended the estimate-disagreement scenario through clarification, a user-provided amount, pending proposal, and approval.
- Added rule `ARC-005` to the [MVP safety contract](../specification/mvp-safety-contract.md); updated [user stories](../user-stories.md), [test plan](../../tests/test-plan.md), [failure modes](../failure-modes.md), and [multi-agent readiness](../architecture/multi-agent-readiness.md).

## Decisions

- Confirmed for the headless MVP: scores below `0.70` cannot support an actionable classification or savings suggestion and must lead to clarification.
- The `0.70` floor is provisional. It is not calibrated against a provider and must be reviewed through provider-backed evaluation before runtime rollout.
- Savings Reasoning remains responsible for ask/suggest/reflect; deterministic code validates its confidence and evidence. An ask can be returned at any confidence, and low-confidence reflection is allowed because it creates no financial state.

## Verification

- `npm run check` passed: setup validation, lint, both TypeScript checks, and 226 tests; one test skipped and one remains todo.
- `git diff --check` passed.
- The shared worktree contains broader uncommitted changes from preceding sessions; this session preserved them.

## Unresolved

- Mock confidence values are illustrative only; they do not establish model calibration or specialist quality.
- The frozen multi-agent readiness corpus remains a scripted smoke comparison. Provider-backed, multi-turn evaluation and human review remain future work.

## Recommended Next Step

Review and expand the frozen evaluation set with uncertain intent, low-confidence estimates, incompatible specialist evidence, follow-up clarification, decline, and partial specialist failures. Keep any numeric threshold provisional until real model scores and outcomes can be compared.
