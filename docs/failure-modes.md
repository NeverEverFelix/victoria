# Victoria Failure Modes

This document lists Victoria-specific failures that may not show up as crashes.

Use it during implementation, review, and product decisions. A change can pass CI and still be wrong if it weakens user trust, money safety, or future development clarity.

## Money Meaning Failures

### Mocked Savings Sounds Like Moved Money

Risk:

Victoria records a mocked ledger entry, but the user-facing message sounds like a bank transfer happened.

Examples to avoid:

- "I moved $27."
- "The money is now in savings."
- "Your checking balance is protected."

Safer language:

- "I recorded $27 in your Victoria savings ledger."
- "No real money has moved yet."
- "This is tracked as saved, not transferred."

### Estimated Savings Sounds Certain

Risk:

Victoria estimates an avoided purchase but presents it as a known transaction amount.

Safer behavior:

- Say "I estimate" when the amount comes from memory, habit, or category defaults.
- Use exact language only when the user provided the amount.
- Ask a follow-up question when there is no support for an estimate.

## Approval Failures

### Ambiguous Language Becomes Approval

Risk:

Victoria treats unclear replies as permission to create a savings entry.

Examples that should not automatically approve:

- "maybe"
- "sure I guess"
- "that sounds nice"
- "I saved money today"

Safer behavior:

- Require a clear approval path for ledger creation.
- Keep pending suggestions separate from confirmed entries.
- Test both approval and no-pending-suggestion cases.

### Hidden Tool Calls

Risk:

Victoria returns a friendly follow-up or reflection while also attaching a tool call that mutates state.

Safer behavior:

- Follow-up and reflection actions should not include ledger-writing tool calls.
- Tests should assert absence of `suggestion` and `toolCall` where relevant.

### Transfer Request Masquerades As A Goal Update

Risk:

A request to send money to an emergency fund or take money out of checking is mistaken for a savings-goal update or a vague savings moment.

Safer behavior:

- Classify direct requests to send funds to a named goal or withdraw from an account as real-money movement requests.
- Explain that Victoria cannot move real money in the MVP; do not record a mocked entry as if that fulfilled the request.
- Exercise varied transfer phrasings in the deterministic contract corpus and keep all actual movement tools unavailable.

## Product Meaning Failures

### Low Confidence Still Drives An Action

Risk:

A classifier or savings specialist returns a valid-looking amount with low confidence, and the system treats schema validity as enough evidence to propose it.

Safer behavior:

- Validate confidence as a finite score from 0 to 1.
- Route action-oriented classification and savings suggestions below the provisional 0.70 floor to clarification.
- Keep unresolved user context only while classification remains unclear; clear it as soon as a clear new intent arrives.
- For an uncertain proposal revision, leave the current proposal pending and unchanged until a clear revision is made; a revised proposal still needs its own explicit approval.
- For an uncertain goal allocation, leave the allocation unchanged and ask which saved amount and goal the user means; recording still requires explicit approval.
- Treat the threshold as a product default until provider-backed evaluation can assess calibration.
- Never treat confidence as approval.

### Regret Turns Into Fake Savings

Risk:

The user regrets spending money, and Victoria treats that regret as if money was saved.

Safer behavior:

- Regretful spending should lead to reflection, planning, or future reminders.
- Do not create a savings suggestion by default.
- Do not frame regret as progress.

### One-Bank-Account Users Are Forgotten

Risk:

Features assume the user has separate checking and savings accounts.

Safer behavior:

- Keep the mocked ledger useful on its own.
- Make physical movement optional and future-facing.
- Avoid language that depends on multiple accounts.

### Learning Rewrites Financial History

Risk:

Victoria learns a newer habit or estimate and updates an older event, suggestion, approval, or ledger entry as if the newer knowledge had been available originally. This destroys the audit trail and can make a user's past approval appear to cover a different amount or action.

Safer behavior:

- Allow habits and other memory to evolve for future decisions.
- Keep historical events, suggestions, approvals, and ledger entries immutable.
- Create a new suggestion when an estimate changes.
- Represent corrections, reversals, and superseding actions with new records linked to the originals.
- Test that learning changes future suggestions without changing historical records.

## Integration Failures

### Real Providers Leak Into The Agent

Risk:

OpenAI, Plaid, Prisma, or transfer providers are wired directly into orchestration code.

Safer behavior:

- Put providers behind adapters.
- Preserve mock implementations.
- Add config gates and disabled-state tests.

### Environment Safety Is Relaxed

Risk:

A change makes local development easier by weakening production checks.

Safer behavior:

- Keep production and non-production boundaries strict.
- Keep real transfer behavior impossible throughout the MVP, even when requested or approved.
- Add config tests for unsafe combinations.

## Agentic Coding Failures

### Docs Drift From Behavior

Risk:

Code changes but product docs, work queue, or decisions still describe old behavior.

Safer behavior:

- Update docs in the same PR when behavior changes.
- Use the PR template's docs checklist.
- Add decisions to `docs/decisions.md` when product behavior changes.

### AI Review Is Assumed But Skipped

Risk:

The AI review workflow skips because `OPENAI_API_KEY` is missing, but a PR or handoff assumes AI review ran.

Safer behavior:

- Check the GitHub Actions summary.
- Keep `Check` required even if `Review PR` is optional.
- Treat AI review as helpful, not authoritative.

### Diff Content Controls The Reviewer

Risk:

A pull request places instructions inside code, comments, or documentation that try to redirect the AI reviewer, or adds a large low-risk file so later safety changes fall outside the review limit.

Safer behavior:

- Send trusted review instructions in a developer message and the proposed diff separately as untrusted user data.
- Explicitly tell the reviewer never to follow instructions found in repository content.
- When a diff exceeds the limit, list every changed path and prioritize excerpts from workflows, agent policy, configuration, safety docs, and tests.
- Mark oversized reviews as incomplete and require human review; if AI review is configured as required, fail the job instead of accepting partial coverage.

### Tests Pass But User-Facing Language Regresses

Risk:

Tests assert action types or amounts but miss unsafe wording.

Safer behavior:

- Test important user-facing safety language.
- Assert no real-transfer claims in mocked flows.
- Review tone for regretful-spend responses.

## Review Prompt

For any Victoria change, ask:

```text
What could pass CI but still mislead the user, weaken approval boundaries, or confuse future coding agents?
```

If the answer is specific, add a test, docs note, or handoff warning.
