# Session: Fix PR 18 AI review findings

- Date: 2026-10-16
- Time: 15:24 EDT
- Status: Completed
- Scope: Fix substantive AI review findings on PR 18, preserve the local-only runtime boundary, and verify the updated implementation.

## Outcome

The PR now filters paused profile-memory reads, safely parses goal targets, guards local memory routes, tightens database permissions and retention SQL, and aligns the docs with the chat-only memory controls decision.

## Work Completed

- Added an explicit local-development gate for Next memory-control routes. Requests still require a signed bearer session; the routes remain connected only to the mock runtime. The PostgreSQL runtime factory remains unmounted.
- Applied current-fact, freshness, and per-turn bounds to profile memories that remain available for consented financial estimates while conversational memory is paused.
- Replaced goal target floating-point parsing with the shared explicit-dollar parser. Invalid targets now require a valid USD amount or an explicit targetless choice before goal creation approval.
- Added a distinct `create_goal` agent action for confirmed goal creation; goal allocation continues to use `update_goal`.
- Restricted direct authenticated database access to read-only goals and service-side writes for goals and pause settings.
- Fixed the retention correction-ID comparison, narrowed its security-definer search path, and made role grants conditional. Semantic-search grants now handle absent optional roles. The local compatibility bootstrap is rerunnable.
- Clarified chat-only controls and the local route boundary in [decisions.md](../decisions.md), [mvp.md](../mvp.md), [user-stories.md](../user-stories.md), [environments.md](../environments.md), and [test-plan.md](../../tests/test-plan.md).
- Added this entry to correct the earlier [temporary settings-screen session](2026-10-16-1151-user-memory-settings-screen.md), which was superseded by the later chat-only decision.

## Decisions

- Confirmed product behavior remains unchanged: a structured savings goal requires explicit user confirmation, and goal allocation requires a separate approval. The review suggestion to remove goal-creation confirmation conflicts with the current product contract and was not applied.
- Persistent runtime handlers continue to require an injected trusted authenticator. They are not mounted on the Next routes; live authentication and deployment remain future work.
- Explicit forget remains a documented privacy exception to append-only conversational-memory history. Financial events, approvals, and ledger history remain unchanged.
- Next 16 route params remain Promise-typed, and the Webpack build flags/extension alias remain because the production build succeeded.

## Verification

- `npm run check` passed: 58 test files passed, 6 skipped; 481 tests passed, 4 skipped, 9 todo.
- `npm run build` passed with Next.js 16.3.6 and Webpack.
- Applied all 13 migrations to a temporary local PostgreSQL database after the local compatibility bootstrap; verified migration `0014_semantic_search_permissions` and dropped the temporary database.
- `git diff --check` passed.
- AI review and CI for the follow-up commit remain pending.

## Unresolved

- Live authenticated persistent-runtime wiring, deployment scheduling, and live provider verification remain future work.
- The AI review flagged several intentional contracts that were retained as documented above; the follow-up review will confirm whether it finds remaining actionable issues.

## Recommended Next Step

- Push the fixes to PR 18, review the updated CI and AI findings, then continue with the remaining memory work after the review is clear.
