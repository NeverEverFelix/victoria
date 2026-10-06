# Session: Document provider-team smoke commands

- Date: 2026-10-06
- Time: 11:52 America/New_York
- Status: Completed
- Scope: Add a short command reference for local provider-team smoke setup and execution.

## Outcome

Added a copyable local setup and command guide for the provider-team smoke run, including its mock-ledger and approval boundaries.

## Work Completed

- Added [provider-agent-team-smoke.md](../provider-agent-team-smoke.md) with environment setup, smoke invocation, expected prerequisite error, and regular mock check commands.
- Linked the guide from the [evaluation README](../../tests/evaluation/README.md).

## Decisions

- The guide documents the existing smoke behavior; it does not change product behavior or enable real money movement.

## Verification

- `git diff --check` — passed.
- No tests run; documentation-only change.

## Unresolved

- A live provider request remains unverified until a valid key and model are configured in ignored `.env.local`.

## Recommended Next Step

Configure local provider values in `.env.local` and run `npm run agent:smoke:provider-team`.
