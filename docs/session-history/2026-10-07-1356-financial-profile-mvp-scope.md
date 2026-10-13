# Session: Define financial profile MVP scope

- Date: 2026-10-07
- Time: 13:56 America/New_York
- Status: Documentation updated; detailed profile design remains open
- Scope: Record the financial profile, Plaid read access, and `financialprofilespecialist` as MVP scope while keeping real money transfers out of scope.

## Outcome

The MVP contract now includes user-authorized Plaid reads to build a user-scoped financial profile and inject relevant profile context into Victoria at inference time. Plaid transfer/payment behavior and real money movement remain excluded.

## Work Completed

- Updated [MVP scope](../mvp.md) with profile data, inference, provenance, freshness, minimization, and user-control constraints.
- Added [Story 12](../user-stories.md) for the financial profile and specialist.
- Updated [decisions](../decisions.md) to record the confirmed scope and open design choices.
- Added headless coverage expectations to the [test plan](../../tests/test-plan.md) and a bounded profile work slice to the [agent work queue](../agent-work-queue.md).
- Updated [README](../../README.md) references that described Plaid only as later work.

## Decisions

- Confirmed: Financial profile capability using user-authorized Plaid data is part of the MVP.
- Confirmed: `financialprofilespecialist` builds or refreshes a user-scoped profile and provides relevant profile context to Victoria during inference.
- Confirmed: Real money transfers and Plaid transfer/payment capabilities remain outside MVP scope.
- Open: Initial Plaid read products/scopes, profile schema, consent/disconnect lifecycle, freshness, retention/deletion, and correction behavior.

## Verification

- Reviewed required product and safety documentation before editing.
- `git diff --check` — passed.
- No tests run; this session changed documentation only.
- The worktree already contained unrelated changes in provider comparison, response policy, and durable turn storage files; they were left untouched.

## Unresolved

- Define minimum Plaid read products and allowed purposes.
- Define profile facts, provenance, freshness thresholds, and stale/conflicting-data behavior.
- Define consent, refresh, disconnect, retention, deletion, and correction lifecycle.
- Refine the future MVP slice into sequenced implementation steps and executable acceptance criteria.

## Recommended Next Step

Resolve the initial profile data and user-control decisions, then split the profile capability into headless implementation slices before any UI work.
