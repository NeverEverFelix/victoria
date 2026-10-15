# Session: Verify merchant-spend claims against transaction history

- Date: 2026-10-13
- Time: 16:05 America/New_York
- Status: Completed for the optional transaction-history seam
- Scope: Check explicit and speculative typical-spend claims against available transaction evidence and append corrections without rewriting prior memory.

## Outcome

When an injected transaction-history provider returns a valid typical-spend estimate based on at least three recent transactions, Victoria compares it with the user's stated merchant amount. Close amounts are described as broadly consistent. A material difference—at least $1 and 15% of the stated value—causes Victoria to append a linked, transaction-supported memory and explain the evidence. Low-confidence unverified theories are not used for future estimates.

## Work Completed

- Added extraction for direct routine-spend claims and speculative claims phrased as “I think/theorize/estimate/guess I spend…”. Speculative facts are stored with low confidence unless corroborated.
- Added transaction comparison during merchant-spend memory extraction. The user's original wording is retained in evidence; later facts are linked through the existing append-only memory mechanism.
- Kept the existing threshold that memory below 0.8 confidence cannot drive avoided-spend estimates.
- Added tests for matching history, material disagreement/correction, and an unverified theory that cannot drive an estimate.
- Added MEM-006 and updated Story 12 and the test plan.

## Decisions

- Confirmed: a material difference is at least $1 and 15% of the stated amount.
- Confirmed: fewer than three transactions are insufficient to verify a typical spend.
- Confirmed: transaction-derived corrections are append-only and disclose that they are based on linked transaction history.
- No Plaid adapter is wired; this behavior operates only when a transaction-history provider is injected.

## Verification

- Targeted memory tests passed: 16 tests.
- `npm run check` passed: 34 test files passed, 6 skipped; 346 tests passed, 4 skipped, 9 todo.
- The existing Node experimental SQLite warnings remain.

## Unresolved

- The provider must implement recency/freshness and transaction sufficiency rules; the agent validates count, positive safe-integer cents, and a non-future observation time.
- Live Plaid reads remain unavailable and require separately defined product scope, consent lifecycle, retention, and adapter work.

## Recommended Next Step

Add an integration test for a transaction provider that normalizes merchant data and enforces standing bank-link access, then define an explicit freshness window before any Plaid adapter is enabled.
