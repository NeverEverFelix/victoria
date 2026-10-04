# Session: General System Design

- Date: 2026-10-02
- Time: 11:11 EDT
- Status: Completed
- Scope: Document Victoria's proposed horizontally scaled modular-monolith design, capacity contract, personalized memory path, and initial deployment recommendation.

## Outcome

Victoria now has a general system-design diagram and architecture decision record covering durable admission of 2,000-turn bursts, bounded AI concurrency, per-conversation ordering, approval identity across queue boundaries, user-scoped memory retrieval, and the proposed Vercel and Neon deployment shape.

## Work Completed

- Added the rendered [`Victoria General System Design`](../architecture/diagrams/victoria-general-system-design.md) with deployment and per-turn processing views.
- Added [`ADR 0002`](../architecture/decisions/0002-horizontally-scaled-modular-monolith.md) covering the managed-platform recommendation, tradeoffs, alternatives, cost position, capacity contract, and exit strategy.
- Updated the [`architecture index`](../architecture/README.md) to link the new design artifacts.
- Included the Memory Retrieval Coordinator, bounded context package, Memory Curator Agent, durable turn queue, configurable execution limits, and deterministic financial authority in the proposed design.

## Decisions

- Proposed: use a stateless modular monolith that scales horizontally rather than beginning with microservices.
- Proposed: use Vercel Fluid Compute and Neon PostgreSQL with pgvector as the current best total-cost balance for the existing Next.js stack and a solo developer.
- Proposed: interpret the 2,000-user target as 2,000 connected sessions and durable admission of a 2,000-turn burst, with separately bounded AI execution rather than 2,000 immediate multi-agent runs.
- Proposed: preserve the exact user, conversation, turn, proposal, and action identifiers across every queue boundary.
- Proposed: make the Memory Curator a specialist agent while keeping retrieval, persistence, financial facts, and memory-write validation deterministic.
- These remain architecture proposals until the product owner explicitly accepts the associated ADRs.

## Verification

- `xmllint --noout docs/architecture/diagrams/victoria-general-system-design.svg` passed.
- `git diff --check` passed.
- `npm run check` passed.
- 14 test files passed, 1 scenario file remained skipped, 93 tests passed, and 25 scenarios remain marked `todo`.
- Three pre-existing lint warnings remain in `src/agent/memory/mock-memory.ts` and `tests/unit/agent/policy.test.ts`.
- Browser-based SVG inspection was attempted, but the available browser automation surface could not complete local navigation; XML validation and source-level layout review were completed instead.

## Unresolved

- The queue provider and initial implementation strategy remain open; the first implementation may use a Postgres-backed queue before adding another service.
- Authentication provider, production monitoring provider, and exact AI concurrency limits remain undecided.
- The Vercel and Neon recommendation must be revisited using measured cost, latency, queue depth, database load, and provider-limit data.
- ADR 0001 and ADR 0002 remain `Proposed`.

## Recommended Next Step

- Review and accept or revise the capacity contract and ADR 0002, then define the first executable system contract for durable turn admission and idempotency without adding production infrastructure prematurely.
