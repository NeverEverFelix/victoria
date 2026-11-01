# Session: Live scoped event lookup challenge

- Date: 2026-10-26
- Time: 17:43 America/New_York
- Status: Completed
- Scope: Exercise authoritative conversation-scoped savings-event lookup through Victoria's local HTTP chat route with a real provider and isolated persistent database.

## Outcome

The live route persisted two synthetic avoided-spend events to the isolated integration database. After the second suggestion was declined, Victoria answered which event came first from the same conversation. A query from another conversation did not disclose either event. The mocked ledger remained empty throughout.

## Work Completed

- Started the real local Next.js chat route with the provider-backed specialist team and `mock_ledger` mode. Used synthetic user and conversation IDs and only `victoria_integration_local`.
- Challenged cross-conversation access: Victoria said it could not see events from the other conversation.
- Challenged approval safety: an explicit read-only event-summary request created no ledger entries.
- Observed that a read-only history question is blocked while a savings suggestion is pending; Victoria first requires the user to confirm or decline the pending action. Repeating the historical question after decline succeeded.

## Decisions

- This run is behavioral evidence for the scoped read and specialist context handoff, not evidence that arbitrary historical phrases can yet be uniquely resolved for revisions.
- Pending-action confirmation gates remain deterministic and safe; whether read-only questions should bypass that gate is an open product/architecture question for a future slice.

## Verification

- Live provider-backed local HTTP chat: passed for same-conversation historical lookup and cross-conversation isolation.
- PostgreSQL inspection confirmed two `avoided_spend` rows under the exact synthetic conversation and zero mocked ledger entries for the synthetic user.
- No real money movement occurred. The integration database was used; production and staging were not accessed.

## Unresolved

- While a proposal is pending, ordinary read-only history questions currently receive a confirm-or-decline follow-up, which interrupts conversational retrieval.
- The other-conversation query correctly returned no events, but its generic wording was slightly unrelated to finance; response relevance remains a separate quality concern.
- The existing work remains uncommitted.

## Recommended Next Step

Define a deterministic orchestration rule for allowing clearly read-only informational questions during a pending savings proposal without weakening approval, revision, or cancellation gates. Then rerun this live challenge, including ambiguous references and explicit confirmation attempts.
