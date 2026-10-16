# Session: Add headless user memory controls

- Date: 2026-10-15
- Time: 21:14 EDT
- Status: Completed
- Scope: Add authenticated controls to review, correct, and forget learned conversational memories without starting UI work.

## Outcome

Added local-runtime API handlers for listing a user's current memories, appending a correction, and forgetting a selected conversational-memory lineage. A forget request removes the selected fact, linked prior/successor facts, dependent transaction-detail corrections, and embeddings. Financial history is unchanged. A user-facing screen remains deferred under the headless-first sequence.

## Work Completed

- Added `GET /api/victoria/settings/memories`, `PUT /api/victoria/settings/memories/:memoryId`, and `DELETE /api/victoria/settings/memories/:memoryId` behind the local signed-session authenticator.
- Added memory-orchestrator and storage-provider support for forget; added migration `0009_user_memory_controls.sql` with a narrowly scoped database erasure function.
- Kept transaction-profile memories under their existing disconnect/deletion lifecycle; review exposes them, but edit/forget return a conflict response.
- Added handler, authenticated local-runtime, migration-contract, and PostgreSQL repository tests. Updated the memory product story, safety rule, MVP/learning docs, work queue, and decisions record.

## Decisions

- The user asked to work on memory controls. Physical erasure of the selected conversational-memory lineage and embeddings is the recommended implementation assumption; the user did not confirm this specific erase policy. It remains open for product-owner review in [decisions.md](../decisions.md).
- Recent in-conversation context is not deleted by a memory forget request. The API response says that it may remain until the existing 30-minute context expiry.
- Plaid-derived memories remain managed by profile disconnect/deletion, and financial events, approvals, ledger entries, and corrections are not changed.
- UI work remains deferred by the repository's headless-first rule.

## Verification

- `npm run check` passed: 56 test files passed, 6 skipped; 459 tests passed, 4 skipped, 9 todo.
- `git diff --check` passed.
- One pre-existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts:48` (`_observedThrough` unused).
- The new PostgreSQL migration was checked by static contract coverage; it was not applied to a live PostgreSQL/Supabase database.

## Unresolved

- The memory-control routes are mounted only in the local mock runtime; persistent authenticated runtime wiring remains open.
- No user-facing memory settings screen has been built.
- A user may still see original content in the current conversation context until it expires; the existing conversation is not erased.
- Confirm whether physical erasure of conversational-memory history is the desired forget policy before enabling the control in a persistent production runtime.

## Recommended Next Step

Confirm the forget semantics, then add persistent-runtime wiring and live migration/RLS verification before exposing memory controls in a user-facing settings screen.
