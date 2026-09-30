# Victoria Session History

This directory is an append-only record of completed Victoria product and coding sessions. Its purpose is to give a future coding agent enough context to resume work safely without depending on the original chat transcript.

Session records are operational history, not the product contract. If an entry conflicts with `docs/mvp.md`, `docs/user-stories.md`, or `docs/decisions.md`, follow those authoritative documents and note the conflict in a new session entry.

## When To Create An Entry

Create one entry before the final handoff for every completed repository work session. Multiple sessions on the same day should have separate files.

Do not create or update an entry for a session that made no repository or product-decision progress.

## Filename

Use the local completion time and a concise topic:

```text
YYYY-MM-DD-HHMM-short-topic.md
```

Example:

```text
2026-09-30-1429-savings-domain-model.md
```

Use 24-hour time. Record the timezone inside the entry.

## Required Content

Each entry should contain:

```markdown
# Session: Short descriptive title

- Date: YYYY-MM-DD
- Time: HH:MM timezone
- Status: Completed, partial, or blocked
- Scope: One-sentence description

## Outcome

A concise statement of what the session accomplished.

## Work Completed

- Concrete product, code, test, or documentation changes.
- Links to the most relevant repository files.

## Decisions

- Confirmed decisions and where they were added to the product contract.
- Clearly label proposals or assumptions that still need user review.

## Verification

- Commands run and their results.
- Tests not run and why.
- Existing warnings that remain.

## Unresolved

- Known gaps, risks, and incomplete integrations.

## Recommended Next Step

- The smallest safe next slice for a future coding agent.
```

## Writing Rules

- Write for a coding agent who has repository access but no chat context.
- Be factual and distinguish completed work from intended work.
- Link to files instead of reproducing large code blocks or full transcripts.
- Mention relevant dirty-worktree or ownership concerns.
- Never include secrets, credentials, private user data, hidden reasoning, or raw conversation transcripts.
- Do not rewrite an older entry to reflect later knowledge. Add a new entry that corrects or supersedes it.
