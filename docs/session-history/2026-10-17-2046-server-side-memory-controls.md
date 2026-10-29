# Session: Server-Side Memory Controls

- Date: 2026-10-17
- Time: 20:46 America/New_York
- Status: Partial
- Scope: Implement the selected Vercel + Supabase direction for authenticated memory inspection, correction, and individual forget controls.

## Outcome

Added a server-only persistent memory management API for staging and production configurations. It verifies Supabase bearer tokens, scopes every operation to the verified user, and stores corrections and forget actions as append-only memory records. This is an implementation slice, not a live deployment or complete production-ready user experience.

## Work Completed

- Added authenticated `GET/PATCH /api/memories` and `POST /api/memories/{memoryId}/forget` handlers in [memory-management-handler.ts](../../src/app/http/memory-management-handler.ts), with pagination, strict request bounds, no-store responses, and user-scoped access.
- Added Supabase Auth bearer verification in [supabase-bearer-auth.ts](../../src/app/auth/supabase-bearer-auth.ts) and a PostgreSQL-only staging/production runtime in [create-persistent-memory-management-runtime.ts](../../src/app/http/create-persistent-memory-management-runtime.ts). The runtime uses a one-connection pool per warm instance and does not use ephemeral SQLite storage.
- Added append-only forget markers, current-memory filtering, candidate validation, and profile-fact suppression in [memory-orchestrator.ts](../../src/agent/memory/memory-orchestrator.ts), [postgres-memory-repository.ts](../../src/agent/memory/postgres-memory-repository.ts), and migration [0008_memory_forget_suppression.sql](../../db/migrations/0008_memory_forget_suppression.sql).
- Added endpoint and bearer-auth tests, updated memory/env tests, and aligned [environments.md](../environments.md), [user-stories.md](../user-stories.md), [mvp.md](../mvp.md), [agent-work-queue.md](../agent-work-queue.md), and [README.md](../../README.md).
- The preceding [readiness audit](2026-10-17-2035-memory-production-readiness-audit.md) described the pre-implementation state. This entry records the subsequent implementation and supersedes its statements that the memory API and forget markers were absent.

## Decisions

- Confirmed: use Vercel + Supabase as the deployment direction, keep memory controls server-side, and support inspect, correct, and individual forget without bulk deletion.
- Confirmed: forget suppresses an individual fact from future retrieval while retaining immutable historical records. A later explicit statement can restore a fact through a newer linked record.
- Confirmed: no user interface was added; the repository's headless-first constraint remains in effect.
- Confirmed: financial chat remains local/mock-only; these endpoints do not mount persistent chat or expose its in-memory approval state.

## Verification

- `npm run check` passed after removing stale ignored `.next/types` references left by deleted route files. It reported 465 passing tests, 4 skipped, and 9 todo; lint had one existing unused-variable warning in `tests/unit/agent/memory-orchestrator.test.ts`, and SQLite emitted experimental warnings.
- `git diff --check` passed.
- No Supabase project, Vercel project, deployment credentials, or live database were configured or used. No migration was applied remotely.

## Unresolved

- Trusted client sign-in/session issuance is not implemented; a user must obtain a Supabase Auth token through a separately configured client flow.
- Supabase migrations and row-level security have not been verified against a live project; deployment environment variables and connection pooling still need configuration.
- Rate limiting, operational monitoring, deployment migration workflow, and a physical retention/deletion policy remain open.
- Persistent chat, durable pending approvals, memory UI, bulk deletion, and live provider integration remain out of scope for this slice.

## Recommended Next Step

Configure separate Supabase staging and Vercel preview environments, apply migrations through a reviewed deployment workflow, then verify token-scoped inspect/correct/forget behavior against staging before considering broader production rollout.
