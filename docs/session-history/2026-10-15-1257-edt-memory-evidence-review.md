# Session: Memory evidence review fix

- Date: 2026-10-15
- Time: 12:57 EDT
- Status: Completed
- Scope: Address the latest review finding about quoted evidence and sensitive contact details.

## Outcome

Exact quoted user evidence can now pass validation, while email addresses and phone-number-like evidence are rejected from conversational memory.

## Work Completed

- Updated [conversational-memory-extractor.ts](../../src/agent/memory/conversational-memory-extractor.ts) to normalize wrapper quotes and reject contact detail patterns before saving memory.
- Added focused cases in [conversational-memory-extractor.test.ts](../../tests/unit/agent/conversational-memory-extractor.test.ts).

## Decisions

- Exact user-authored evidence may be wrapped in quotes; sensitive contact details remain excluded from persistent memory.
- The read-only Transactions profile approval remains as stated in the user-provided repo instructions; production Plaid and real money movement remain disabled.

## Verification

- `npm run check` passed: 50 test files passed, 6 skipped; 420 tests passed, 4 skipped, 9 TODO.
- `git diff --check` passed.
- One existing ESLint warning remains in the missing-profile-observation test.

## Unresolved

- External sandbox provider calls and live migrations have not been exercised.
- PR #13 remains open for user merge.

## Recommended Next Step

Review the PR and merge when ready.
