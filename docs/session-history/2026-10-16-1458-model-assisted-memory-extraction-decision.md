# Session: Confirm model-assisted memory extraction boundaries

- Date: 2026-10-16
- Time: 14:58 EDT
- Status: Completed
- Scope: Record the user's decision to use a language model to propose conversational memories under deterministic validation and existing user memory controls.

## Outcome

The product contract now states that model-assisted memory extraction is an interpretation capability only. Deterministic policy controls persistence, and users retain chat-based review, correction, forget, and pause/resume controls.

## Work Completed

- Added the confirmed decision and implementation boundaries to [decisions.md](../decisions.md).
- Clarified the extractor behavior in [user-stories.md](../user-stories.md) and [test-plan.md](../../tests/test-plan.md).
- Added safety rule MEM-013 to [mvp-safety-contract.md](../specification/mvp-safety-contract.md).
- The extractor, validator, persistence seam, and chat memory controls already exist; no runtime behavior changed in this session.

## Decisions

- Confirmed by the user: the model proposes stable, useful memories from varied ordinary language; it does not write memory directly or decide alone what becomes durable.
- Deterministic validation requires exact user evidence, clear user attribution, affirmed and stable content, ordinary sensitivity, and high confidence.
- Extraction is opt-in and failures do not block turns. Memories are context only and cannot authorize financial actions.
- Corrections, forgetting, and pause/resume remain available through chat.

## Verification

- `git diff --check` passed.
- Tests were not run because this session clarified and documented the existing behavior without changing runtime code.

## Unresolved

- The optional provider path remains disabled by default and depends on local/runtime credentials and activation.
- Broader real-conversation evaluation of extraction quality remains future work.
- The worktree contained extensive prior uncommitted changes; they were preserved.

## Recommended Next Step

- Once a provider key is intentionally configured, exercise varied synthetic conversational examples through the model extractor and verify that only validator-approved candidates persist.
