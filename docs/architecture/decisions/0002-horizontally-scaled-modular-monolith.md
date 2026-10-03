# ADR 0002: Horizontally Scaled Modular Monolith

- Status: Proposed
- Date: 2026-10-02
- Scope: Victoria's application, persistence, asynchronous execution, and initial production deployment

## Context

Victoria will initially serve one user and should remain inexpensive to operate. The design should also provide a credible path to 2,000 connected sessions and burst admission of 2,000 turns without requiring a premature microservice platform.

Victoria's existing codebase uses Next.js and TypeScript. Its workload is expected to be I/O-heavy because turns wait on model APIs and PostgreSQL. The principal scaling and cost risks are provider rate limits, repeated multi-agent calls, unbounded prompt context, duplicate turn execution, and per-conversation races.

## Proposed Decision

Deploy Victoria as a stateless modular monolith on Vercel Fluid Compute with Neon PostgreSQL and pgvector as the primary durable store.

Use durable turn admission and bounded execution:

- Persist each accepted turn with an idempotency key before execution.
- Queue excess work by durable turn identifier.
- Limit concurrent AI turns through configuration.
- Serialize mutating turns within one conversation while allowing different conversations to run concurrently.
- Retain exact proposal, action, user, and conversation identifiers across queue boundaries.
- Store authoritative financial data, structured memory, semantic memory, and execution state in PostgreSQL.

The system is one product and codebase. Internal modules remain separately testable and provider-independent. Additional worker entry points may use the same artifact without turning every module into a network service.

The proposed design is shown in [`victoria-general-system-design.md`](../diagrams/victoria-general-system-design.md).

## Capacity Contract

- Maintain 2,000 connected sessions.
- Durably accept a burst of 2,000 turn submissions.
- Bound simultaneous AI execution independently of accepted-session count.
- Expose queued, running, completed, and failed turn status.
- Preserve conversation ordering and financial idempotency.

This contract promises safe admission, not immediate simultaneous model execution for all 2,000 turns.

## Why Vercel And Neon

- Vercel directly matches the existing Next.js runtime and reduces deployment and autoscaling work for a solo developer.
- Fluid Compute is designed to reuse instances for concurrent I/O-heavy requests and bills active CPU separately from waiting time.
- Vercel documents automatic function concurrency scaling beyond Victoria's 2,000-session target, subject to regional burst limits and provider capacity.
- Neon provides managed PostgreSQL, autoscaling, connection pooling, branching, scale-to-zero for quiet environments, and pgvector support.
- A pooled PostgreSQL connection strategy prevents one database connection per connected user or serverless invocation.

Current platform references:

- [Vercel Fluid Compute pricing and behavior](https://vercel.com/docs/functions/usage-and-pricing)
- [Vercel concurrency scaling](https://vercel.com/docs/functions/concurrency-scaling)
- [Neon compute and connection pooling](https://neon.com/docs/manage/endpoints/)
- [pgvector filtering, indexing, and hybrid search](https://github.com/pgvector/pgvector)

## Cost Position

This is the preferred total-cost option for the current product, not necessarily the lowest raw infrastructure price at every traffic level.

Developer time, deployment safety, preview environments, autoscaling, connection management, and operational recovery are part of total cost. Cloudflare Workers may be cheaper per request, while a managed container may become cheaper under steady load. Neither advantage currently outweighs the migration and operating cost for Victoria's existing stack.

Model calls are expected to dominate marginal cost. The architecture therefore treats AI concurrency, specialist routing, prompt size, memory curation, and provider spend limits as first-class controls.

## Tradeoffs

### Benefits

- One codebase, database, deployment model, and local development path.
- Low idle cost during personal use.
- Horizontal scaling without application-local session state.
- Transactional linkage among turns, memories, proposals, approvals, and ledger records.
- Provider interfaces preserve future migration options.

### Costs And Risks

- Vercel and Neon remain external platform dependencies.
- Queued execution makes fully synchronous request handling insufficient.
- Serverless or fluid runtimes cannot safely retain in-memory conversation state.
- A shared Postgres workload can couple transactional and semantic-search performance.
- Platform scaling does not remove OpenAI rate and spend limits.

### Mitigations

- Store all durable state outside process memory.
- Make every mutation idempotent and traceable by user, conversation, turn, proposal, and action identifiers.
- Use pooled database connections and short transactions.
- Use exact user filters before semantic retrieval.
- Introduce a dedicated queue, cache, vector store, worker service, or container runtime only behind existing interfaces.
- Load-test turn admission separately from model execution.

## Alternatives Considered

### Cloudflare Workers And Neon

Likely lower raw edge-compute cost, but requires more adaptation from Victoria's current Next.js and Node-oriented shape. Reconsider when request volume makes the difference material.

### Managed Containers And PostgreSQL

Greater runtime control and potentially better economics under steady load, but adds idle cost, instance sizing, health management, and autoscaling work.

### AWS Or GCP Service Architecture

Provides the highest infrastructure control and eventual ceiling, but creates disproportionate operational and development overhead for the current stage.

### Microservices

Allows independent deployment and scaling but introduces network contracts, distributed failure modes, tracing complexity, and duplicated infrastructure before Victoria has evidence that any module requires independent ownership.

## Exit Strategy

The application must keep deployment-specific capabilities behind narrow interfaces:

- `TurnQueue`
- `TurnRepository`
- `ConversationLease`
- `MemoryRepository`
- `EmbeddingProvider`
- `ModelProvider`
- `ReceiptSource`
- `TelemetrySink`

This permits movement to a container worker, Cloudflare, a dedicated queue, or a separate vector store without rewriting Victoria's domain or safety policy.

## Acceptance Condition

Change this record from `Proposed` to `Accepted` only after the capacity contract, managed-platform choice, and queued-turn semantics are confirmed. Revisit the decision using measured cost, latency, queue depth, database load, and provider-limit data rather than projected scale alone.
