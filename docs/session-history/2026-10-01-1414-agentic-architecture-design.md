# Session: Agentic Architecture Design

- Date: 2026-10-01
- Time: 14:14 EDT
- Status: Completed
- Scope: Establish a version-controlled architecture area and document the proposed orchestrated multi-agent design for Victoria.

## Outcome

Victoria now has a dedicated architecture and system-design area containing an initial multi-agent architecture diagram and a proposed architecture decision record. The design centers on a Victoria Orchestrator, bounded financial and savings specialists, a dedicated Companion Voice Agent, and a deterministic authority boundary for financial state.

## Work Completed

- Added the [`docs/architecture/`](../architecture/) directory and its documentation conventions.
- Added the proposed [`Victoria Agentic Architecture`](../architecture/diagrams/victoria-agentic-architecture.md) with an embedded, repository-native SVG preview and editable Mermaid source.
- Added [`ADR 0001`](../architecture/decisions/0001-orchestrated-multi-agent-architecture.md) covering responsibilities, alternatives, risks, mitigations, and unresolved design choices.
- Added the architecture area to the repository guidance in [`README.md`](../../README.md).

## Decisions

- Proposed, pending final product-owner confirmation: use a supervisor-style multi-agent architecture with one central Victoria Orchestrator.
- Proposed: make the Companion Voice Agent the normal source of user-facing prose while preventing it from changing verified financial facts.
- Confirmed existing boundary: deterministic code, not model reasoning, retains authority over approval, tool authorization, cents arithmetic, ledger writes, and immutable history.
- No runtime implementation or model-provider decision was made in this session.

## Verification

- `npm run check` passed.
- `xmllint --noout docs/architecture/diagrams/victoria-agentic-architecture.svg` passed.
- The rendered SVG was inspected locally for legibility, and its XML structure was validated.
- 14 test files passed, 1 scenario file remained skipped, 93 tests passed, and 25 scenarios remain marked `todo`.
- Three pre-existing lint warnings remain in `src/agent/memory/mock-memory.ts` and `tests/unit/agent/policy.test.ts`.

## Unresolved

- Whether the Companion Voice Agent should assess emotional posture and compose the response in one call or two bounded stages.
- The exact minimum agent team for the first executable architecture slice.
- Model choices, latency and call budgets, durable handoff traces, and the future role of a Habit Agent remain undecided.
- ADR 0001 remains `Proposed` until the responsibility boundaries and initial specialist set are explicitly accepted.

## Recommended Next Step

- Review the architecture diagram and ADR, resolve the Companion Voice Agent staging question, and accept or revise ADR 0001 before changing the runtime contracts.
