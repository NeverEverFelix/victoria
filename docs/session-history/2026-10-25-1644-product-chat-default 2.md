# Session: Make product chat work without mode switches

- Date: 2026-10-25
- Time: 16:44 EDT (America/New_York)
- Status: Completed
- Scope: Remove user-facing AI and memory mode selection from Victoria product chat.

## Outcome

The local and hosted chat runtimes use a configured provider model for financial understanding and ordinary conversation automatically. Local chat uses its configured database automatically for durable memory, pending actions, and mocked ledger entries. `npm run chat` has one product path.

## Work Completed

- Updated the [local chat runtime](../../src/app/http/create-local-mock-victoria-runtime.ts) to select the provider team and conversation responder from usable credentials, and PostgreSQL from `DATABASE_URL`.
- Updated the [hosted chat runtime](../../src/app/http/create-persistent-chat-runtime.ts) to use the provider team and conversation responder without a conversation flag.
- Removed the CLI mock option and environment overrides from [chat-local.mjs](../../scripts/chat-local.mjs). Removed obsolete switches from the ignored local configuration without exposing its values.
- Simplified the committed example environment files, [README](../../README.md), [environment guide](../environments.md), [MVP](../mvp.md), [user story](../user-stories.md), and [test plan](../../tests/test-plan.md). Added a superseding [product decision](../decisions.md).
- Updated route and configuration tests to assert automatic provider selection.
- Tightened the conversation responder's length instruction after a live answer was overly long.

## Decisions

- Confirmed by the user: product testing requires no mock/provider, conversation, or memory mode selection. Internal mock adapters remain for headless tests.
- Confirmed: provider responses remain read-only; money calculations, approvals, and mocked ledger writes stay behind deterministic rules. Real money movement remains unavailable.
- This supersedes the explicit conversation flag decision in [the previous session](2026-10-25-1639-conversation-response-path.md).

## Verification

- Signed synthetic requests to the running local API returned HTTP 200 and relevant dinner answers after the switches were removed from ignored local configuration. After the brevity change, the answer was 336 characters.
- `npm run check` passed: 70 files and 648 tests passed, with 8 files and 16 tests skipped and 9 todos.
- The existing unused-variable lint warning in `tests/unit/agent/memory-orchestrator.test.ts` remains.

## Unresolved

- Richer multi-turn conversation evaluation remains quality work.
- The local runtime factory retains mock behavior when directly used without credentials by automated tests; the terminal product command requires a real provider key and model.

## Recommended Next Step

Continue testing Victoria through the running product chat and collect concrete conversation failures before more context-builder work.
