# Session: Make the local memory smoke check repeatable

- Date: 2026-10-16
- Time: 14:20 America/New_York
- Status: Completed
- Scope: Repeat the local pgvector memory check with visible PTY output and preserve it as a reusable developer command.

## Outcome

The live memory and transaction-profile smoke check passed again. A reusable `npm run memory:smoke:local` command now reports each result and removes its synthetic records.

## Work Completed

- Added [live-memory-smoke.mjs](../../scripts/live-memory-smoke.mjs), which uses an isolated random synthetic user, deterministic local embeddings, the existing memory/profile adapters, and explicit cleanup.
- Added the `memory:smoke:local` package script and documented it in [environments.md](../environments.md).
- Ran the command through a PTY so output was streamed visibly during the turn.

## Decisions

- The smoke command is restricted to the `victoria_local` database on loopback and defaults to port 54329.
- The check makes no external API or Plaid calls. Its embedder validates local vector persistence and search mechanics, not production embedding quality.
- Synthetic transaction-derived records are removed through their dedicated profile purge lifecycle; all synthetic vector rows were verified gone.

## Verification

- `npm run memory:smoke:local` passed live checks for semantic memory persistence/retrieval, cross-user isolation, profile persistence/retrieval with three synthetic purchases at a $7.00 median, and cleanup.
- `git diff --check` passed.

## Unresolved

- OpenAI embedding quality and persistent chat runtime wiring remain unverified.
- The existing worktree contained other uncommitted changes before this session; they remain untouched.

## Recommended Next Step

- When an embedding API key is intentionally configured, repeat semantic recall with the concrete OpenAI embedding adapter while retaining synthetic user and transaction data.
