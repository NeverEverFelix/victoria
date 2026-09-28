# Victoria Pull Request

## Summary

What changed?

-

## Work Slice

Related source:

- Agent task:
- Work queue item:
- User story:
- Decision:

## Product Behavior

What should Victoria do differently after this change?

-

## Safety Checklist

- [ ] This change does not move real money.
- [ ] This change does not claim mocked ledger entries are bank transfers.
- [ ] This change does not add production Plaid behavior.
- [ ] This change does not add real transfer behavior.
- [ ] Approval is required before recording savings or performing approval-gated actions.
- [ ] Ambiguous user language is not treated as approval.
- [ ] User-facing language is encouraging, clear, and nonjudgmental.

## Silent Failure Check

What could pass CI but still go wrong for Victoria users, trust, money safety, or future agent work?

- [ ] Mocked savings cannot be mistaken for moved money.
- [ ] Approval cannot be bypassed by ambiguous language or state.
- [ ] Estimates cannot silently become unsupported claims.
- [ ] Regretful spending cannot silently create fake savings.
- [ ] Docs and tests match the behavior changed in this PR.
- [ ] AI review status was checked if this PR relies on it.

Notes:

-

## Tests

What was run?

- [ ] `npm run check`
- [ ] Other:

What behavior is covered by tests?

-

## Docs

- [ ] No docs needed.
- [ ] Updated `docs/mvp.md`.
- [ ] Updated `docs/user-stories.md`.
- [ ] Updated `docs/decisions.md`.
- [ ] Updated `docs/agent-work-queue.md`.
- [ ] Updated `tests/test-plan.md`.
- [ ] Updated other docs:

## Review Focus

Please pay special attention to:

-

Code owner or safety review:

- [ ] Requested when this touches agent behavior, config, workflows, approvals, money movement language, or docs decisions.

## Handoff Notes

Follow-up work, unresolved questions, or known limitations:

-
