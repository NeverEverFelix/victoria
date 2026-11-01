# Session: Robust Companion Voice validation and recovery

- Date: 2026-10-23
- Time: 15:15 America/New_York
- Status: Partial
- Scope: Replace opaque voice-draft rejection with categorized validation, bounded context-aware revision, and privacy-safe diagnostics.

## Outcome

Companion Voice review now reports explicit issue categories for unsafe claims, unsupported amounts, missing confirmations, and omitted validated context. Victoria can request up to two targeted model revisions using those findings. If the drafts still fail review, the guarded fallback remains, and local/persistent runtime logs expose only the issue categories, not the draft or user message.

## Work Completed

- Structured validation and revision feedback in [the companion response policy](../../src/agent/team-response-policy.ts).
- Added bounded revisions and a diagnostic callback in [Victoria's agent](../../src/agent/victoria-agent.ts).
- Wired privacy-safe issue-category logging in the [local mock runtime](../../src/app/http/create-local-mock-victoria-runtime.ts) and [persistent chat runtime](../../src/app/http/create-persistent-chat-runtime.ts).
- Expanded movement and assurance checks to distinguish advice and explicit caveats from capability or completion claims.

## Decisions

- The voice model remains responsible for the actual conversational wording. Validation issues shape revision feedback but do not prescribe a scenario-specific script.
- Recovery is limited to two revisions per turn. If a draft remains unsafe or incomplete, the guarded deterministic response stays authoritative.
- Diagnostic logs contain validation categories only; they do not include private conversation content.

## Verification

- `git diff --check` passed.
- No tests or CLI replay were run.

## Unresolved

- The reported CLI scenario has not yet been replayed against the robust validator and retry loop.
- The fallback can still be generic if both revisions fail. The new diagnostic categories should identify which guard or missing context caused that outcome.
- The worktree contains extensive unrelated and earlier in-progress modifications; they were preserved.

## Recommended Next Step

Run the original CLI prompt and inspect the `Victoria companion voice draft remained invalid after revision` warning if the result is still generic. Use its issue categories to address the exact remaining validator conflict.
