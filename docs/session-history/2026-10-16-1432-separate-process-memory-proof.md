# Session: Verify memory survives a process boundary

- Date: 2026-10-16
- Time: 14:32 America/New_York
- Status: Completed
- Scope: Verify that Victoria's local chat output uses committed memory/profile records read by a fresh process rather than same-process seeded context.

## Outcome

The local smoke command now seeds and commits synthetic facts in one Node process, exits, and starts a separate Node process that reads the persisted rows and generates actual Victoria chat responses without a seeding call.

## Work Completed

- Refactored [live-memory-smoke.mjs](../../scripts/live-memory-smoke.mjs) into separate seed, read/chat, and cleanup processes.
- The read/chat process retrieved the committed takeout routine, emergency-fund goal, response preference, and Blue Bottle profile from local Postgres. The profile estimate provider reads the stored profile row.
- It printed a personalized reflection and a $7.00 avoided-coffee suggestion requiring approval. No approval was sent and no savings ledger entry was created.
- Agent-generated short-term context and decision writes are rolled back; the cleanup process removed seeded memory/profile facts and verified zero demo rows remain.
- Updated [environments.md](../environments.md) to document the cross-process persistence proof.

## Decisions

- Synthetic records are deliberately committed between processes so the check proves database persistence; they are removed after output.
- The chat process has no seed path. Deterministic local hash embeddings and synthetic purchases are used; no external provider or Plaid call occurs.

## Verification

- `npm run memory:smoke:local` passed in three separate Node processes (seed PID 16353, read/chat PID 16354, cleanup PID 16355).
- Verified semantic retrieval, user scoping, conversational personalization, persisted profile lookup, approval gating, and zero remaining synthetic rows.
- `git diff --check` passed.

## Unresolved

- The deterministic embedder tests retrieval mechanics, not production embedding quality.
- Persistent authenticated chat runtime wiring remains a separate deployment step.
- Pre-existing unrelated worktree changes remain untouched.

## Recommended Next Step

- Use the same fresh-process demonstration with the concrete embedding provider once an API key is intentionally configured, without changing the synthetic-only dataset.
