# Victoria: Conversation Failure Root-Cause Review and Context Architecture Proposal

**Repository:** [`NeverEverFelix/victoria`](https://github.com/NeverEverFelix/victoria)  
**Inspected branch:** `main` (GitHub repository contents retrieved October 25, 2026)  
**Focus:** multi-turn conversational continuity, amount and period resolution, savings proposal revisions, mocked-ledger safety, context assembly, and regression testing  
**Status:** engineering design and source review, **not** a tested pull request. No repository changes were made.

---

## 0. Executive summary

Victoria's basketball/gym exchange demonstrates a **handoff failure between language comprehension and authoritative financial workflow state**. The assistant can mention `$35/month` and `$420/year` but fails to consistently carry the user's selection of **annual** into the pending savings transaction. When the user says, "bruh record the yearly amount," its current dollar parser cannot extract an amount from that utterance, and the pending-proposal revision path has no first-class period/annualization operation. Consequently, the assistant can produce a generic response while keeping an inappropriate monthly proposal pending.

A **context builder is a necessary foundation, but not a sufficient stand-alone fix**. Recommended solution:

1. **Context Builder**: assemble recent turns, selected relevant memory, verified financial facts, and the currently active authoritative workflow into a bounded, typed `VictoriaContext`.
2. **Intent & Reference Resolver**: identify reference expressions such as "annual," "the yearly amount," "that one," and "actually monthly" and resolve them to specific, provenance-backed amounts and periods. The LLM may *propose* interpretations but must not independently authorize a ledger mutation.
3. **Conversation State Manager**: apply validated choices and revisions to a structured state machine, explicitly tracking active topic, current period, candidate amount, target type, pending proposal ID and proposal version.
4. **Domain-model separation**: distinguish **monthly avoided expense**, **annualized savings projection**, **planned savings target**, and **realized mocked-ledger entries**. Recording an annual projection must not silently count as `$420` already saved.
5. **Approval gate**: display the exact proposed action and require explicit confirmation of that precise version after any revision. A correction directed at the wrong pending amount **must not** be treated as approval of the old amount.
6. **Regression tests and observability**: cover the full multi-turn sequence and instrument classification, context resolution, proposal lifecycle, and refusal/fallback reasons (without logging sensitive financial information indiscriminately).

**Primary diagnosis:** orchestration, state modeling, typed context and reference resolution; not a generic LLM intelligence failure or a SQLite warning.

### Evidence confidence and limitations

- **Confirmed in source:** parser constraints, classifier output contract, approval phrase handling, pending-action branches, existing savings model, specialist input limitations, conversation-context storage, proposal supersession support.
- **Highly plausible runtime explanation:** the wrong amount and generic follow-up arose when human-readable conversation state was not faithfully translated into proposed action state.
- **Not proven from source alone:** the exact origin of the last response string (`I can help think that through...`) and whether the local working tree is identical to GitHub `main`; we did **not** execute the real CLI conversation, inspect local runtime traces, or run tests.
- **Do not infer from timing:** 68 ms vs. 7.8 s can indicate different execution paths, but not prove which model/specialist or fallback generated the message.

---

## 1. Reproduction: provided conversation, factual interpretation, and correct behavior

### 1.1 Observed exchange (material excerpts)

**Initial user:**

> I usually go to this gym to play basketball and it costs me $35 a month. However, I just got a promotion at my work and it comes with a gym package so now the company pays. Would it be a good idea to allocate this money somewhere else?

**Victoria:** congratulated the promotion, identified `$35/month` and `$420/year`, and asked whether the user preferred `$35 monthly` or the `$420 annual projection`.

**User:** `annual`

**Victoria:**

> Got it: $420.00 is the yearly target you'd like to work toward, based on $35.00 a month if your gym stays covered. I can start by recording this month's $35.00 in your Victoria savings ledger. Say yes to confirm. No real money moves.

**User:** `bruh record the yearly amount`

**Victoria:**

> I can help think that through. What part would be most useful to start with? The savings suggestion remains pending and has not been recorded.

The initial request is **advisory and forward-looking**; it is not a command to transfer actual bank funds. The `$420` is **derived**, equal to `$35 × 12`, and conditional on employer coverage continuing for twelve months.

### 1.2 Desired exchange

```
User: My company now pays my $35/month gym bill. Should I allocate it elsewhere?
Victoria: That's $35 per month, or $420 per year if the benefit lasts.
          You could allocate the freed-up cash to a savings goal or debt.
          Would you like to plan monthly or annually?
User: annual
Victoria: Understood: we'll plan with a $420 annual projection.
          Should I save this as a projected goal, or track $35 each month as it's realized?
User: bruh record the yearly amount
Victoria: You want the $420 yearly projection recorded, not a $35 entry for this month.
          I can create a projected annual savings target of $420. Confirm?
User: yes
Victoria: Recorded the $420 annual *projection* in your mock planning ledger.
          No real money moved and no $420 was counted as realized savings.
```

If a separate projection/goal store has not yet been implemented, a safe interim response is: "I understand you want the $420 annual projection, but my current ledger only records amounts already saved. I can save it as a goal once that feature is available, or track $35 each month." **Do not pretend to record a new projection tool that does not exist.**

### 1.3 Required semantic distinctions

| Concept | Example | May increment realized savings total? |
|---|---|---|
| Avoided recurring charge | Membership no longer billed at `$35/month` | No, not by itself |
| Annualization | `$35 × 12 = $420` | No |
| Projected savings target | Plan to direct `$420` within a year | No |
| Mock ledger entry: realized savings | `$35` actually freed up this month and explicitly confirmed | Yes, if the ledger is explicitly a simulated record of realized savings |
| Real-world transfer | Move dollars between real accounts | No: disabled in current MVP |

The annual projection must not be confused with a cash balance, actual bank transfer, or twelve months of already-realized savings.

---

## 2. Inspected repository architecture

Relevant files verified in `main`:

- [`src/agent/victoria-agent.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/agent/victoria-agent.ts) — overall orchestration; `respond`, `respondTurn`, `classifyWithTeam`, `decide`, `suggestSavings`, pending action maps, revision and approval flows.
- [`src/agent/llm/openai-financial-moment.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/agent/llm/openai-financial-moment.ts) — OpenAI classification schema, context input, and post-classification amount parsing.
- [`src/domain/financial-events/parse-explicit-amount.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/domain/financial-events/parse-explicit-amount.ts) — strict literal `$` amount parser.
- [`src/agent/policy.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/agent/policy.ts) — `interpretApprovalResponse` and explicit tool authorization.
- [`src/agent/team/openai-specialists.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/agent/team/openai-specialists.ts) — financial-moment, savings-reasoning, companion-voice adapters.
- [`src/agent/team-prototype.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/agent/team-prototype.ts) — specialist contracts; prototype orchestrator.
- [`src/agent/team-response-policy.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/agent/team-response-policy.ts) — response guard, disclosure enforcement, unsupported amounts check.
- [`src/agent/team-assessment-policy.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/agent/team-assessment-policy.ts) — evidence-matching savings assessment guard.
- [`src/agent/memory/types.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/agent/memory/types.ts) — conversation context and durable memory contracts.
- [`src/domain/savings/types.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/domain/savings/types.ts) — savings event, suggestion, proposal, approval, goal and ledger domain definitions.
- [`src/domain/savings/proposal-lifecycle.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/domain/savings/proposal-lifecycle.ts) — lifecycle transitions (`pending` -> `declined`, `superseded` or `recorded`).
- [`src/agent/types.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/agent/types.ts) — `ClassifiedMessage`, `AgentDecision`, `ToolCallRequest`.
- [`src/app/create-victoria-agent.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/app/create-victoria-agent.ts) — composition and provider/mock specialization.
- [`src/app/create-persistent-victoria-agent.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/app/create-persistent-victoria-agent.ts) — persistent Postgres/SQLite-backed memory composition.
- [`src/app/http/create-local-mock-victoria-runtime.ts`](https://github.com/NeverEverFelix/victoria/blob/main/src/app/http/create-local-mock-victoria-runtime.ts) — separate local-only mock runtime.
- Existing tests: `tests/unit/agent/victoria-agent.test.ts`, `tests/unit/agent/policy.test.ts`, `tests/unit/agent/openai-financial-moment.test.ts`, `tests/unit/agent/team-prototype.test.ts`, `tests/evaluation/multi-agent-conversations.test.ts`, among others.

### 2.1 Simplified current flow

```
request
  -> memory.getConversationContext(userId, conversationId)
  -> append user turn to conversation-context store
  -> VictoriaAgent.respondTurn(request, priorContext)
       -> examine pending correction/goal/savings actions
       -> optionally perform memory extraction and other deterministic branches
       -> classifyWithTeam(message, memory, conversationContext)
            -> financialMoment analyzes text/history
            -> amount derived by separate literal parser
            -> savingsReasoning receives finding + memory (not full context)
            -> companionVoice generates guarded prose as applicable
       -> match classifier result to pending proposal revision/approval/other action
       -> decide, create proposal, or generic follow-up
  -> append Victoria response to conversation-context store
```

Conversation history exists; however, it is **not sufficient as an authoritative typed workflow state**. This is the pivotal architectural distinction.

### 2.2 Specialist roles

- Financial Moment: categorize user intent. No mutation authority.
- Savings Reasoning: recommend `suggest`, `ask` or `reflect`; validate amount provenance. No mutation authority.
- Companion Voice: draft user-facing language. No mutation authority.
- `VictoriaAgent`: retains runtime authority over proposal lifecycle and mocked ledger tools.

**Preserve that separation.** The fix is not to grant specialists direct ledger or transfer access.

---

## 3. Confirmed issues and source-level evidence

### Finding F1 — Strict amount parser cannot resolve implicit references (high)

**File:** `src/domain/financial-events/parse-explicit-amount.ts`

The parser searches for dollar-prefixed forms with logic equivalent to:

```ts
const matches = [...message.matchAll(/(?:-\$|\$-?)([\d,]+(?:\.\d+)?)/g)];
```

It intentionally rejects absent currency amounts. Therefore:

| Input | Literal parser result |
|---|---|
| `$420` | Valid 42000 cents |
| `annual` | Absent |
| `record the yearly amount` | Absent |
| `420` | Absent |
| `actually use the other one` | Absent |

This strict parser is useful for safety, but it should be **one of several trusted sources**, not the only path to a resolved amount. Preserve the existing parser for literal user-specified values; add a separate, provenance-checked *reference resolver* for implicit values.

### Finding F2 — Classifier contract discards monetary reference resolution (high)

**File:** `src/agent/llm/openai-financial-moment.ts`

`providerClassificationSchema` includes classification `type`, confidence, `merchantName`, `goalName`, `revisionReason`, summary and `needsClarification`. It **does not** expose a `resolvedAmountCents`, amount reference, temporal period or annualization intent. The adapter calculates `amount` afterward from the current user message:

```ts
const amount = (candidate.data.type === "entry_correction"
  ? parseExplicitCorrectionAmount(input.userMessage)
  : null) ?? parseExplicitDollarAmount(input.userMessage);
```

Even if the model understands that "yearly amount" means $420, the operational `ClassifiedMessage` is not equipped to relay that inference as a bound, verified amount.

**Proposed:** classify intent plus a symbolic `amountReference` (`annual_projection`, `monthly_amount`, `pending_proposal`, `explicit`, `unknown`) and `periodSelection`. Resolve those references against validated context separately; do not blindly trust free-form LLM-produced dollars.

### Finding F3 — Pending savings revisions are primarily amount/reason revisions (high)

**File:** `src/agent/victoria-agent.ts`, especially pending-action handling around lines 466–550 and `replacePendingSavingsProposal` around lines 1050–1130.

Existing branch reacts to `classification.type === "proposal_revision"` and considers `amountCents`, `revisionReason`, and `awaitingValidRevision`. It lacks an explicit change of period, amount basis or projection/actual type. A bare "annual" and a reference-based correction need separate semantics from a user typing `$420`.

**Proposed:** explicit `proposedOperation: "revise_amount_or_period"` + validated `resolvedAmountCents`, `period`, and `recordKind`. Rebuild/supersede the pending proposal when these differ; never overwrite a previously approved proposal.

### Finding F4 — Approval interpreter is narrow by design (medium; safety strength)

**File:** `src/agent/policy.ts`

`interpretApprovalResponse` recognizes direct confirmations such as `yes`, `yes save it`, `record it`, `please do`, and `do it`; amounts are accepted in limited explicit matching constructions. "Bruh record the yearly amount" is **not** a matching approval phrase. This is appropriate when the pending proposal is the wrong `$35` entry. Otherwise Victoria could authorize a different amount than the one requested.

**Proposed:** treat a correction to a pending proposal as a **revision first**. After displaying the replacement exact `$420 annual projection`, seek confirmation of the **new proposal ID/version**. Never broaden generic approvals in a way that bypasses the action-specific approval gate.

### Finding F5 — Savings reasoning does not receive full conversation context (medium/high)

**File:** `src/agent/team/openai-specialists.ts` and `src/agent/team-prototype.ts`.

`financialMoment.analyze` receives `message`, `memory`, optional `conversationContext`. `savingsReasoning.assess` receives `finding` and `memory`, while companion voice receives `finding`, `assessment`, and disclosures. The savings reasoning instruction says **"Never invent or calculate an amount"**. The specialist is therefore structurally unable to conduct context-aware annualization unless validated, resolved numbers and provenance are handed to it as facts.

**Proposed:** pass a *small curated `ResolvedFinancialContext`* including source amount, period, derived amount, calculation and evidence IDs. Avoid asking the specialist to compute or invent annual amounts. Perform allowed arithmetic deterministically in the application.

### Finding F6 — Domain schema has no temporal basis or projection-kind (high)

**File:** `src/domain/savings/types.ts`.

`SavingsSuggestion` includes `amountCents`, currency, reason, source, movement mode. `SavingsProposalSuggestion` embeds this, but neither includes period, derivation, realized-vs-projected distinction, or future validity. `SavingsEvent` stores a reported user amount but not its recurrence or whether it represents a plan. Thus `$35 monthly` and `$420 annual projection` are representable only as generic amounts with different reasons. The ledger may be encouraged to treat projected dollars as saved dollars unless changed.

**Proposed:** add explicit temporal and accounting meaning; establish separate projection/goal model or discriminated types for proposals. Maintain distinct reporting aggregates.

### Finding F7 — Conversation context is recent message strings, not actionable workflow state (high)

**Files:** `src/agent/memory/types.ts`, `src/agent/victoria-agent.ts`.

`getConversationContext` / `setConversationContext` maintain strings and `DEFAULT_CONVERSATION_CONTEXT_LIMIT = 20`. They help a model infer the narrative, but do not guarantee persistent semantic fields like `selectedPeriod`, `annualProjectedSavingsCents`, `pendingProposalVersion`, `lastReferencedAmountId` or `projectionValidity`. Dedicated in-memory maps track pending transactions keyed by `userId:conversationId` but are not a substitute for durable typed conversation state.

**Proposed:** create a workflow-state repository keyed by user and conversation; load it alongside relevant memory; persist updates transactionally or through version-checked compare-and-set. Continue using existing conversational memory for long-term preferences and summarized background.

### Finding F8 — General fallback responses are not anchored to pending intent (medium)

**Files:** `src/agent/victoria-agent.ts`, `src/agent/team-assessment-policy.ts`.

There are generic decision/fallback responses and branches that protect pending actions. The exact observed final phrase was not located in the inspected `main` file, so its producer is unverified. Regardless, the assistant should not fall back to a generic open-ended question when the user is clearly referencing a pending annual amount.

**Proposed:** a `ContextResolutionError` or `NeedsClarification` outcome with an **action-specific** question: "I have a $35 monthly proposal pending, but you asked for the $420 yearly projection. Should I replace it with a $420 annual projection?" If there's genuine ambiguity, mention the exact alternatives and leave the ledger unchanged.

### Finding F9 — Output validation can mistake valid derived figures for unsupported amounts (medium)

**File:** `src/agent/team-response-policy.ts`.

`hasUnsupportedMoneyAmount()` compares dollar amounts in a voice draft against a single expected amount (`assessment.amountCents` or `classification.amountCents`). A response containing both `$35 monthly` and `$420 annual` can be considered unsupported even when the second is a mathematically valid derivative. That may cause a deterministic fallback and suppress natural explanations.

**Proposed:** provide a validation allowlist of verified monetary facts, including derived annual amounts with provenance, instead of one scalar. Keep rejection of unverified amounts and claims of completed transfers.

### Finding F10 — In-memory pending maps can complicate durability and race safety (medium; inferred risk)

`pendingSavingsActions`, `pendingActionIdsByConversation`, `pendingGoalAllocationActions`, and related maps are instance-local in `VictoriaAgent`. A process restart or concurrent runtime instance may make pending context unavailable or inconsistent. This is a **deployment architecture risk**, not the proven explanation for this particular same-session exchange.

**Proposed:** durable workflow-state and pending-proposal repository for production, with versioning, idempotency, user binding, expirations, and atomic transitions. Keep mocks for development and unit tests.

### Finding F11 — Logging and SQLite warnings (informational)

`ExperimentalWarning: SQLite is an experimental feature` is an upstream Node runtime warning and **not evidence of the conversation bug**. Logged specialist timing such as 3.2 s and 3.6 s can help trace performance, but does not tell us why a selected period was lost without structured events. The 68 ms response to `annual` implies that turn may have been handled without the same full provider path, but does not conclusively prove its routing.

---

## 4. Desired architecture

```
                      user turn
                          |
                          v
             Conversation Runtime / Auth
                          |
                +---------v----------+
                | VictoriaContextBuilder |
                +---------+----------+
                          |
         +----------------+---------------------+
         | recent turns / pending version      |
         | verified facts / relevant memories  |
         | existing goal / simulated ledger    |
         +----------------+---------------------+
                          |
                    immutable context
                          |
                  Intent + Reference
                      Resolver
                          |
                validated resolution
                          |
                Conversation State
                     Manager
                          |
           +--------------+--------------+
           |                             |
     Financial specialist(s)       Deterministic policy
      advisory only                  & domain decisions
           |                             |
           +--------------+--------------+
                          |
                   proposal revision
                      or inquiry
                          |
                 exact action approval
                          |
            simulated goal/ledger tool
                          |
                  persisted state,
                audit event, response
```

**Important:** the context builder reads authoritative state; it must not fabricate authoritative state by combining unverified model output. The resolver proposes semantic bindings; the state manager validates; policy gates mutations.

### 4.1 Responsibilities and boundaries

| Component | Reads | Produces | Not allowed to do |
|---|---|---|---|
| Context Builder | recent conversation, stable memory, verified facts, existing proposals | immutable bounded context | approve or mutate money |
| Intent Resolver | current utterance, bound context | typed intent + reference IDs + confidence | write a ledger entry |
| State Manager | current workflow state, resolved intent | validated next state, revision intent | bypass policy/approval |
| Financial Moment | text and resolved context | high-level classification | independently authorize amounts |
| Savings Reasoning | validated factual monetary context | advisory reasoning | calculate an unverified amount or move money |
| Policy & domain | exact proposal ID, version, amount, approval | valid transition or refusal | silently alter approved action |
| Companion Voice | safe decision and verified fact set | user-facing explanation | claim a transfer occurred |

### 4.2 Dynamic, task-scoped context is preferable to sending everything

For the gym scenario, retrieve exactly: the $35 recurring fee, employer coverage condition, derived $420/year, user's annual selection, the exact pending proposal (if any), and a small number of relevant savings goals/preferences. Do **not** transmit unrelated bank transactions, health details, or a complete life history to each specialist. Use deterministic selection, source priority, budgets, and explicit user scopes.

---

## 5. Proposed TypeScript contracts (illustrative, to adapt to current types)

### 5.1 `src/agent/context/types.ts` — new

```ts
export type MoneyPeriod = "one_time" | "monthly" | "annual";
export type FinancialRecordKind = "projection" | "goal_target" | "realized_savings";
export type ProvenanceKind = "user_statement" | "verified_transaction" | "derived";

export interface VerifiedMoneyFact {
  id: string;
  amountCents: number;
  currency: "USD";
  period: MoneyPeriod;
  kind: "avoided_expense" | "projected_savings" | "realized_savings";
  provenance: ProvenanceKind;
  evidenceTurnIds: readonly string[];
  derivedFromFactIds?: readonly string[];
  derivation?: "monthly_times_12";
  conditions?: readonly string[];
  observedAt: string;
}

export interface ActiveSavingsWorkflow {
  id: string;
  version: number;
  type: "savings_allocation";
  status: "discussing" | "pending_approval" | "completed" | "cancelled";
  sourceFactId: string;
  selectedPeriod: MoneyPeriod;
  selectedAmountFactId: string;
  intendedRecordKind: FinancialRecordKind;
  pendingProposalId: string | null;
  pendingActionId: string | null;
}

export interface VictoriaContext {
  userId: string;
  conversationId: string;
  currentMessage: string;
  recentTurns: readonly { id: string; role: "user" | "assistant"; content: string }[];
  relevantMemory: readonly { id: string; category: string; value: string }[];
  moneyFacts: readonly VerifiedMoneyFact[];
  activeWorkflow: ActiveSavingsWorkflow | null;
  /** Audit snapshot/version of authoritative workflow state. */
  contextVersion: number;
}
```

*Design constraint:* `moneyFacts` is a catalog of verified or deterministic facts, not arbitrary strings. `VerifiedMoneyFact` here means validated **within the application**, not necessarily bank-verified. A user-reported expense must retain `provenance: "user_statement"` rather than being relabeled as a bank-confirmed fact.

### 5.2 Example context for the observed session

```ts
const exampleContext: VictoriaContext = {
  userId: "user_demo",
  conversationId: "cli-demo",
  currentMessage: "bruh record the yearly amount",
  recentTurns: [
    { id: "t1", role: "user", content: "My employer now pays my $35/month gym bill." },
    { id: "t2", role: "assistant", content: "That's $420 annually. Monthly or annual?" },
    { id: "t3", role: "user", content: "annual" },
    { id: "t4", role: "assistant", content: "I can record this month's $35; confirm?" }
  ],
  relevantMemory: [],
  moneyFacts: [
    {
      id: "gym_monthly",
      amountCents: 3500,
      currency: "USD",
      period: "monthly",
      kind: "avoided_expense",
      provenance: "user_statement",
      evidenceTurnIds: ["t1"],
      observedAt: "2026-10-25T00:00:00.000Z"
    },
    {
      id: "gym_annual_projection",
      amountCents: 42000,
      currency: "USD",
      period: "annual",
      kind: "projected_savings",
      provenance: "derived",
      evidenceTurnIds: ["t1"],
      derivedFromFactIds: ["gym_monthly"],
      derivation: "monthly_times_12",
      conditions: ["employer continues covering membership for 12 months"],
      observedAt: "2026-10-25T00:00:00.000Z"
    }
  ],
  activeWorkflow: {
    id: "workflow_gym",
    version: 2,
    type: "savings_allocation",
    status: "pending_approval",
    sourceFactId: "gym_monthly",
    selectedPeriod: "annual",
    selectedAmountFactId: "gym_annual_projection",
    intendedRecordKind: "projection",
    pendingProposalId: "proposal_monthly_old",
    pendingActionId: "savings_action_old"
  },
  contextVersion: 8
};
```

The code should explicitly detect the mismatch between `selectedAmountFactId` (`$420/year`) and the old pending `$35` proposal, **not** interpret this example state as automatically authorizing a new ledger write.

---

## 6. Concrete module proposals and TypeScript examples

The following examples are **design sketches**, not drop-in patches. They deliberately isolate dependencies behind interfaces because exact runtime wiring and database migration choices must be reconciled with existing constructors, repositories and tests.

### 6.1 `src/agent/context/victoria-context-builder.ts` — new

```ts
import type { VictoriaContext, VerifiedMoneyFact, ActiveSavingsWorkflow } from "./types.js";

export interface ContextSources {
  loadRecentTurns(userId: string, conversationId: string, limit: number):
    Promise<VictoriaContext["recentTurns"]>;
  searchRelevantMemory(userId: string, message: string, limit: number):
    Promise<VictoriaContext["relevantMemory"]>;
  loadVerifiedMoneyFacts(userId: string, conversationId: string):
    Promise<readonly VerifiedMoneyFact[]>;
  loadActiveWorkflow(userId: string, conversationId: string):
    Promise<{ workflow: ActiveSavingsWorkflow | null; version: number }>;
}

export class VictoriaContextBuilder {
  constructor(private readonly sources: ContextSources) {}

  async build(input: {
    userId: string;
    conversationId: string;
    currentMessage: string;
  }): Promise<VictoriaContext> {
    const [recentTurns, relevantMemory, moneyFacts, active] = await Promise.all([
      this.sources.loadRecentTurns(input.userId, input.conversationId, 12),
      this.sources.searchRelevantMemory(input.userId, input.currentMessage, 8),
      this.sources.loadVerifiedMoneyFacts(input.userId, input.conversationId),
      this.sources.loadActiveWorkflow(input.userId, input.conversationId)
    ]);

    return {
      ...input,
      recentTurns,
      relevantMemory,
      moneyFacts: moneyFacts.filter(f =>
        Number.isSafeInteger(f.amountCents) && f.amountCents > 0 && f.currency === "USD"
      ),
      activeWorkflow: active.workflow,
      contextVersion: active.version
    };
  }
}
```

**Implementation notes:**
- Back `loadRecentTurns` with the existing conversation-turn repository or `MemoryProvider.getConversationContext` adapter; note that existing memory returns plain strings and would need role/turn IDs added in a migration or synthetic adapter.
- Back `searchRelevantMemory` with `MemoryProvider.searchConversationalMemories`, not a duplicate LLM memory database.
- Back money facts with new user/conversation-scoped persisted facts or a read model populated from verified transaction data and explicit utterances.
- Back active workflows with a new `WorkflowStateRepository`. For production, use Postgres or equivalent durable storage, and include optimistic version checking.
- The `Promise.all` approach is appropriate only if the sources are independent and consistently scoped. If transactional snapshot consistency matters, use a database read transaction.
- Ensure memory extraction of unrelated turns cannot overwrite workflow selections.

### 6.2 Deterministic derivation — `src/domain/financial-events/derive-recurring-savings.ts` — new

```ts
import type { VerifiedMoneyFact } from "../../agent/context/types.js";

export function annualizeMonthlyFact(
  monthly: VerifiedMoneyFact,
  observedAt: string
): VerifiedMoneyFact {
  if (monthly.period !== "monthly" || monthly.currency !== "USD") {
    throw new Error("Expected a USD monthly source fact.");
  }
  const amountCents = monthly.amountCents * 12;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error("Annualized amount overflows valid money range.");
  }
  return {
    id: `${monthly.id}:annual_projection`,
    amountCents,
    currency: "USD",
    period: "annual",
    kind: "projected_savings",
    provenance: "derived",
    evidenceTurnIds: monthly.evidenceTurnIds,
    derivedFromFactIds: [monthly.id],
    derivation: "monthly_times_12",
    conditions: ["monthly saving continues for 12 months"],
    observedAt
  };
}
```

**Critical detail:** deriving `$420` from `$35/month` does **not** validate the user's actual spend history or confirm that $420 has accumulated. Keep this value in *projection* totals only.

### 6.3 `src/agent/context/intent-reference-resolver.ts` — new

```ts
import type { VictoriaContext, MoneyPeriod, VerifiedMoneyFact } from "./types.js";

export type Resolution =
  | {
      kind: "select_amount" | "revise_pending_proposal";
      period: MoneyPeriod;
      selectedFact: VerifiedMoneyFact;
      provenanceFactIds: readonly string[];
    }
  | { kind: "unresolved"; reason: string; candidateFactIds: readonly string[] };

export function resolveReferencedAmount(
  message: string,
  context: VictoriaContext
): Resolution {
  const text = message.trim().toLowerCase();
  const workflow = context.activeWorkflow;
  if (!workflow) {
    return { kind: "unresolved", reason: "no_active_workflow", candidateFactIds: [] };
  }

  // Demonstration rules only. Production implementation should use a narrowly
  // typed model intent classification plus validated reference IDs for variants.
  const annual = /\b(annual|annually|yearly|per year|year)\b/.test(text);
  const monthly = /\b(monthly|per month|this month)\b/.test(text);
  if (annual === monthly) {
    return {
      kind: "unresolved",
      reason: "missing_or_conflicting_period",
      candidateFactIds: context.moneyFacts.map(f => f.id)
    };
  }

  const period: MoneyPeriod = annual ? "annual" : "monthly";
  const candidates = context.moneyFacts.filter(f =>
    f.period === period &&
    (period === "annual" ? f.kind === "projected_savings" : f.kind === "avoided_expense")
  );

  // Never silently bind to one of multiple unrelated expenses.
  if (candidates.length !== 1) {
    return {
      kind: "unresolved",
      reason: candidates.length ? "ambiguous_amount" : "no_supported_fact",
      candidateFactIds: candidates.map(f => f.id)
    };
  }

  const isRevision = workflow.status === "pending_approval" ||
    /\b(actually|instead|change|record|use|make)\b/.test(text);
  return {
    kind: isRevision ? "revise_pending_proposal" : "select_amount",
    period,
    selectedFact: candidates[0],
    provenanceFactIds: [candidates[0].id, ...(candidates[0].derivedFromFactIds ?? [])]
  };
}
```

**What this example does:** maps "annual"/"yearly" to a unique known annual figure; prevents ambiguous source selection. **What it does not do:** fully classify arbitrary English. A later semantic resolver can output a **reference ID** from an enum/allowlist; it must never overwrite the financial fact with an unverified invented value. Also make sure the production resolver narrows by the *active workflow's source fact*, so another unrelated annual bill cannot be chosen accidentally.

### 6.4 `src/agent/context/conversation-state-manager.ts` — new

```ts
import type { ActiveSavingsWorkflow, VictoriaContext } from "./types.js";
import type { Resolution } from "./intent-reference-resolver.js";

export interface WorkflowStateRepository {
  compareAndSwap(input: {
    userId: string;
    conversationId: string;
    expectedVersion: number;
    nextWorkflow: ActiveSavingsWorkflow;
  }): Promise<boolean>;
}

export class ConversationStateManager {
  constructor(private readonly repository: WorkflowStateRepository) {}

  async applyResolution(context: VictoriaContext, resolution: Resolution) {
    if (resolution.kind === "unresolved") {
      return { status: "clarify" as const, reason: resolution.reason };
    }
    const current = context.activeWorkflow;
    if (!current || current.status === "completed" || current.status === "cancelled") {
      return { status: "clarify" as const, reason: "no_editable_workflow" };
    }

    const next: ActiveSavingsWorkflow = {
      ...current,
      version: current.version + 1,
      selectedPeriod: resolution.period,
      selectedAmountFactId: resolution.selectedFact.id,
      intendedRecordKind: resolution.selectedFact.kind === "projected_savings"
        ? "projection"
        : "realized_savings",
      // Invalidate old approval target; a revised proposal must be prepared.
      status: "discussing",
      pendingProposalId: null,
      pendingActionId: null
    };
    const updated = await this.repository.compareAndSwap({
      userId: context.userId,
      conversationId: context.conversationId,
      expectedVersion: context.contextVersion,
      nextWorkflow: next
    });
    return updated
      ? { status: "updated" as const, workflow: next }
      : { status: "retry" as const, reason: "concurrent_workflow_update" };
  }
}
```

**Important transaction warning:** This is a sketch of *state selection*, not a complete proposal transaction. In production, superseding the existing proposal, invalidating its action ID, creating the replacement and committing next workflow state must be atomic or coordinated through a transaction/outbox. Clearing an approval pointer without replacing/cancelling the old proposal atomically could create orphaned actionable records.

### 6.5 `src/domain/savings/types.ts` — domain extension

The current `SavingsSuggestion` object is just an amount and other attributes. Do not simply add `period: "annual"` to a generic *saved money* entry and consider the accounting problem solved. Distinguish planned projections from realized entries:

```ts
export type ProposedSavingsRecord =
  | {
      kind: "projection";
      amountCents: number;
      period: "monthly" | "annual";
      sourceFactId: string;
      conditions: readonly string[];
      projectionHorizonMonths: number;
    }
  | {
      kind: "realized_savings";
      amountCents: number;
      period: "one_time";
      sourceFactId: string;
      realizedAt: string;
    };

export interface SavingsProposalV2 {
  id: string;
  userId: string;
  actionId: string;
  version: number;
  status: "pending" | "superseded" | "declined" | "recorded";
  record: ProposedSavingsRecord;
  supersedesProposalId?: string;
  approvalId?: string;
}
```

**Preferred option:** store projections in an annual planning/goal table, not the current realized-savings ledger. Alternatively introduce typed ledger record kinds and ensure *every* total/report excludes projections from realized balances. Extend schema migrations, tool contracts and tests together. Preserve backward compatibility by migrating existing entries to known `realized_savings`/`unknown` semantics instead of guessing their historical periods.

### 6.6 Resolver -> revision -> approval flow

```ts
// PSEUDOCODE: orchestration contract, not a standalone executable patch.
const context = await contextBuilder.build({ userId, conversationId, currentMessage });
const classification = await financialMoment.classify({
  message: currentMessage,
  context: toProviderSafeContext(context)
});
const resolution = resolveOrAskForReference(classification, currentMessage, context);

if (resolution.kind === "revise_pending_proposal") {
  const validated = validateResolutionAgainstFacts(resolution, context);
  if (!validated.ok) return targetedClarification(validated.reason, context);

  // In one atomic domain operation:
  // 1. verify owner + conversation + source fact + proposal version
  // 2. supersede old proposal/action
  // 3. create new typed proposal + new action ID
  // 4. persist updated workflow state
  const replacement = await proposalService.replacePendingFromResolvedFact({
    userId, conversationId,
    expectedWorkflowVersion: context.contextVersion,
    factId: validated.fact.id,
    recordKind: validated.recordKind
  });

  return {
    message: `You mean ${formatMoney(replacement.amountCents)} ` +
      `${replacement.period} as a ${replacement.recordKind}. ` +
      `Should I record that exact proposal? No real money will move.`,
    decision: replacement.decision
  };
}

// Approval branch later: match both action ID and latest proposal version.
// A generic "yes" applies only to the last clearly displayed exact action.
```

An implicit "record the yearly amount" is **a request to prepare or revise an action**, not blanket authorization for a different amount than the proposal shown earlier.

---

## 7. Exact existing-code change points

### 7.1 `VictoriaAgent.respond()` and `respondTurn()`

**Current:** `respond()` loads raw prior context, appends string messages, calls `respondTurn(request, priorContext)`; `respondTurn` begins by looking up several pending maps, then later classifies.

**Change:** inject `contextBuilder`, `stateManager` and `referenceResolver` via `VictoriaAgentDependencies` and initialize a context snapshot early in the turn. Route *pending action corrections or period revisions* through reference resolution **before generic finance fallback** and before approving a conflicting pending action.

**Before (abridged, representative):**

```ts
const priorContext = await this.dependencies.memory.getConversationContext(userId, conversationId);
const response = await this.respondTurn(request, priorContext);
```

**After (proposed pseudocode):**

```ts
const context = await this.dependencies.contextBuilder.build({
  userId: request.userId,
  conversationId,
  currentMessage: request.message
});
const response = await this.respondTurn(request, context);
```

**Do not** add a second unconditional model call without measuring latency: the resolver can consume the Financial Moment specialist's one structured classification and a curated context. Keep one classification pass when possible.

### 7.2 `OpenAiFinancialMomentAdapter.classifyMessage()`

**Current:** no period/reference fields in structured model output; postprocess only literal amount. 

**Change:** extend the *advisory* classification schema with constrained fields:

```ts
type AmountReference =
  | "explicit"
  | "monthly_source"
  | "annual_projection"
  | "selected_amount"
  | "pending_proposal"
  | "none";

interface ReferenceHints {
  amountReference: AmountReference;
  periodSelection: "monthly" | "annual" | null;
  actionIntent: "discuss" | "select" | "revise" | "confirm" | "decline" | "unknown";
}
```

**Validation:** the model supplies references/hints only. Resolve to amount cents via known `VerifiedMoneyFact` IDs; reject source mismatches and ambiguous candidates. Retain the existing literal parser as a separate input with higher evidentiary priority when explicit amounts are present. Make amendments to `src/agent/types.ts`, `src/agent/validation.ts`, mock adapter contracts and unit test fixtures together.

### 7.3 `VictoriaAgent.replacePendingSavingsProposal()`

**Current:** can produce superseding proposals, but replacements focus on amount/reason. 

**Change:** accept `ResolvedProposalRevision` with a verified target fact, period and record kind. Preserve the strong existing `transitionSavingsProposal` lifecycle and create a **new** action ID. A proposal containing `$35/month` should be marked superseded before the `$420 annual projection` proposal is presented for confirmation. Keep the old approval invalidated even if the user previously said `yes` to another action.

### 7.4 `interpretApprovalResponse()`

**Current:** safe literal matching. 

**Change:** don't simply add `/record.*yearly/` to approval regexes. Before entering the policy approval branch, distinguish `reference-based revision` from `exact approval`. Preserve "yes" only when attached to a displayed pending exact action, no intervening revision, correct user/conversation and matching version. Return a structured `ApprovalEvaluation` with `kind` and `matchedProposalId` in future iterations.

### 7.5 `OpenAiAgentTeamSpecialists.savingsReasoning` and `team-prototype.ts`

**Current:** `assess({ finding, memory })` omits recent conversation and validated annualization facts.

**Change:** extend input with an intentionally **small** `resolvedFinancialContext`:

```ts
interface ResolvedFinancialContext {
  selectedAmountCents?: number;
  selectedPeriod?: "monthly" | "annual";
  recordKind?: "projection" | "realized_savings";
  sourceFactId?: string;
  derivedFromFactIds?: readonly string[];
  assumptionDisclosure?: string;
}
```

Keep `Savings Reasoning` unable to execute monetary tools. Where the current assessment guard requires amount equality with `finding.classification.amountCents`, update guard logic to compare against a **verified resolved fact** or a known source/derivation pair, never a naked LLM output.

### 7.6 `team-response-policy.ts`

**Current:** only one expected monetary amount is allowed in many voice replies.

**Change:** use a set of permitted monetary facts; include `$35/month` and derived `$420/year` only when both appear in curated, provenance-backed context:

```ts
interface AllowedMonetaryClaim {
  amountCents: number;
  factId: string;
  period: "monthly" | "annual" | "one_time";
  kind: "avoided_expense" | "projected_savings" | "realized_savings";
}

function isSupportedAmount(amountCents: number, facts: readonly AllowedMonetaryClaim[]) {
  return facts.some(f => f.amountCents === amountCents);
}
```

Extend validation to ensure the **meaning** accompanying a number is accurate, not just numerical equality. A projection must not be described as completed savings. Preserve required no-real-money-movement disclosures.

### 7.7 Memory provider / persistence

**Current:** `MemoryProvider` supports user memory, conversation strings, searching memories and other operations. Persistent composition uses Postgres and a SQLite cache. 

**Change:** keep personal preferences in existing durable memory. Add separate authoritative `WorkflowStateRepository` for active state and typed money facts; do not bury transaction state in an unstructured memory summary. Consider migration tables:

```sql
-- Illustrative only; adapt to current migration conventions.
CREATE TABLE victoria_workflow_state (
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  version BIGINT NOT NULL,
  state_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_id)
);

CREATE TABLE victoria_money_facts (
  fact_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  period TEXT NOT NULL CHECK (period IN ('one_time', 'monthly', 'annual')),
  kind TEXT NOT NULL,
  provenance TEXT NOT NULL,
  fact_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Add uniqueness/idempotency, foreign keys and row-level authorization appropriate to your deployment. The SQL snippet is a sketch, not a migration to apply untouched.

### 7.8 `create-victoria-agent.ts` and runtime composition

Wire builder/resolver/state repository through dependency injection. Use an in-memory implementation for unit tests and local mock, durable implementation for persistent runtime. Avoid creating a new state store for each HTTP request. Confirm whether your route caches agent instances or creates them independently. Audit instance restarts and multi-worker deployment behavior.

### 7.9 `create-local-mock-victoria-runtime.ts`

The separate local runtime uses a mock model/tools by default and optionally real OpenAI memory extraction. Ensure both this runtime and provider-backed runtime share the **same context contracts and tests**; otherwise local and provider behavior can diverge without coverage.

---

## 8. Minimal viable fix vs. full architecture

### Phase 0 — Diagnostics / reproduce (first)

1. Run the exact gym scenario against current `main` and your current local branch. Capture state after each turn.
2. Add structured events for: `classification.type`, `amountReference`, `selectedPeriod`, `selectedFactId`, `pendingProposalId`, `pendingProposal.amountCents`, `decision.action`, `fallbackReason`, `voiceDraftAccepted` and timing. Use ID hashes/redaction rather than raw private conversation text.
3. Verify whether `annual` is handled by deterministic follow-up logic, a model turn, or a different runtime route. Trace the exact owner of the observed final generic response.
4. Confirm whether the wrong `$35` pending action was ever actually created; chat text alone is insufficient proof of proposal-store state.

### Phase 1 — High-value narrow patch

- Add a typed `period` and `recordKind` to proposal data (or separate projection proposals).
- Store one active savings workflow for the conversation.
- Add deterministic annualization from validated `$35/month` source.
- Resolve bare `annual`, `monthly`, `yearly amount` against the *unique active workflow*.
- Revise/supersede old pending action and ask for new exact confirmation.
- Add the core end-to-end regression test.

**Acceptance:** the demonstrated example passes, including the final correction, without requiring the user to repeat `$420`.

### Phase 2 — General context builder

- Add bounded `VictoriaContextBuilder` that assembles recent turns + semantic memory + authoritative state + curated relevant facts.
- Unify provider and mock adapters around the same context shape.
- Enforce source precedence and user/conversation boundaries.
- Improve follow-up prompts to reflect pending state instead of generic clarifications.

### Phase 3 — Strong semantic resolution

- Add structured model reference hints for paraphrases, pronouns, changes of mind and multi-topic disambiguation.
- Restrict model outputs to reference identifiers and constrained operations.
- Add ambiguity logic for two annual amounts (gym vs. insurance) and conflicting periods.
- Add property-based and adversarial validation tests.

### Phase 4 — Durable, production-grade workflows

- Persist authoritative workflow state with optimistic concurrency / transaction boundaries.
- Add idempotency and replay safeguards for approval messages.
- Implement explicit projected/realized reporting separation and migration.
- Add traces, metrics, canary rollout, rollback switches and deployment checks.

---

## 9. Regression test plan with TypeScript examples

### 9.1 Source-level unit tests

**Parser retains safety:**

```ts
import { expect, it } from "vitest";
import { parseExplicitDollarAmount } from "../../../src/domain/financial-events/parse-explicit-amount.js";

it("does not pretend implicit references are explicit amounts", () => {
  expect(parseExplicitDollarAmount("the yearly amount").status).toBe("absent");
  expect(parseExplicitDollarAmount("$420")).toEqual({ status: "valid", amountCents: 42000 });
});
```

**Deterministic annualization:**

```ts
it("annualizes 3500 cents to 42000 cents without marking it realized", () => {
  const result = annualizeMonthlyFact(gymMonthlyFact, fixedTime);
  expect(result.amountCents).toBe(42000);
  expect(result.period).toBe("annual");
  expect(result.kind).toBe("projected_savings");
  expect(result.derivedFromFactIds).toEqual([gymMonthlyFact.id]);
});
```

**Reference binding:**

```ts
it("resolves yearly reference to active gym annual projection", () => {
  const result = resolveReferencedAmount("bruh record the yearly amount", gymContext);
  expect(result.kind).toBe("revise_pending_proposal");
  if (result.kind === "unresolved") throw new Error(result.reason);
  expect(result.selectedFact.amountCents).toBe(42000);
  expect(result.selectedFact.period).toBe("annual");
});
```

**Conservative ambiguity:**

```ts
it("asks rather than guessing when two annual figures could match", () => {
  const context = addUnrelatedAnnualExpense(gymContext);
  const result = resolveReferencedAmount("record the annual one", context);
  expect(result.kind).toBe("unresolved");
});
```

**Approval binding:**

```ts
it("never approves the old $35 action when user requests the $420 yearly figure", () => {
  const response = interpretApprovalResponse("bruh record the yearly amount", 3500);
  expect(response).not.toBe("explicit_approval");
});
```

`gymMonthlyFact`, `gymContext`, `fixedTime` and `addUnrelatedAnnualExpense` are **fixtures to implement**, not preexisting repo symbols.

### 9.2 Integration / conversational golden path

Create `tests/integration/chat-flows/annualized-gym-allocation.test.ts`:

```ts
// PSEUDOCODE: adapt to actual agent factory and mock repository constructors.
it("keeps annual selection through revision and confirmation", async () => {
  const harness = createVictoriaConversationHarness();

  await harness.send("My employer pays the gym now, saving me $35 a month.");
  await harness.send("annual");
  const revised = await harness.send("bruh record the yearly amount");

  expect(revised.pendingProposal.record.kind).toBe("projection");
  expect(revised.pendingProposal.record.period).toBe("annual");
  expect(revised.pendingProposal.record.amountCents).toBe(42000);
  expect(revised.oldMonthlyProposal.status).toBe("superseded");
  expect(revised.realizedSavingsTotalCents).toBe(0);
  expect(revised.response).toMatch(/420|four hundred twenty/i);

  const accepted = await harness.send("yes");
  expect(accepted.savedProjectionAmountCents).toBe(42000);
  expect(accepted.realizedSavingsTotalCents).toBe(0);
  expect(accepted.actualTransferCount).toBe(0);
});
```

### 9.3 Additional behavioral cases

| Test | Expected |
|---|---|
| `monthly` after annual selection | Switches period and amount back to $35, invalidates old pending approval |
| `record that one` with one selected amount | Uses authoritative selected fact |
| `record that one` with two possible sources | Clarifies which, no mutation |
| `actually $400 annually` | Treats explicit figure as potential revision; asks whether intended as projection and verifies rationale |
| `yes` after revised proposal | Approves exact latest action ID/version only |
| `yes` after newer conflicting revision | Must not approve stale prior action |
| `no` | Declines proposal without ledger mutation |
| `transfer $420 from checking` | Refuses real-money transfer in MVP |
| `my boss might pay next month` | Does not imply already-avoided recurring spend |
| Two sessions for same user | No conversation-state leakage |
| Concurrent turns racing on same conversation | One version wins; other reloads/retries or clarifies |
| Process restart during pending action | Persistent runtime reloads exact pending state |
| Contradictory evidence or changed gym benefit | Recomputes/invalidate stale projection |
| Companion mentions both `$35` and `$420` | Guard accepts both only with verified source/derivation and correct labels |
| A model hallucinates `$4,200` | Rejected by amount-provenance checks |
| SQLite experimental warning | Ignored as unrelated operational warning |

### 9.4 Metrics and success criteria

- **Reference resolution accuracy** on annotated turn fixtures.
- **Exact-action fidelity**: fraction of proposals matching selected user amount, record kind, period, and source.
- **False approvals**: must be zero in test suite and treated as critical in production.
- **Projection/actual contamination**: must be zero.
- **Fallback specificity**: percentage of clarifications that accurately reflect pending proposal and candidates.
- **Unnecessary clarification rate** for uniquely resolvable references.
- **Latency / token overhead** per conversation turn with bounded context; avoid triple-calling a model for simple selections.
- **Durability and concurrency** for pending action restoration and supersession.

---

## 10. Proposed contextual reasoning policy

A useful precedence hierarchy:

1. **Security / approval / domain invariants:** immutable. The user cannot override safe financial constraints merely with conversational language.
2. **Latest explicit user correction or amount**, validated and scoped to the active workflow.
3. **Current validated active-workflow selection** and exact pending proposal.
4. **Verified financial facts / user-provided source amounts and deterministic derivations.** Preserve provenance distinctions.
5. **Relevant recent turns and durable semantic memory** for interpretation.
6. **LLM semantic interpretation** as advisory output only. Never authoritative for ledger totals without validation.

A fallback should be *context-aware*:

- Bad: "What part would be most useful to start with?"
- Better: "You selected the $420 annual gym savings projection, but the pending entry is still $35 for this month. Should I replace it with a $420 annual projection? I won't record either until you confirm."

Do not adopt arbitrary user expressions as new reusable preferences without evidence; "annual" is the user's choice **for the gym savings workflow**, not a global preference for all future savings decisions.

---

## 11. Potential implementation pitfalls

### 11.1 Double counting

If `$420` is stored as an annual projection and `$35` is subsequently recorded monthly for twelve months, the sum of *realized* savings is `$420`, not `$840`. Projections and actual savings must not be combined in one “saved” aggregate. A projection should preferably have `expectedAmountCents`, while realized entries retain `amountCents` and an event timestamp.

### 11.2 Changing the underlying assumptions

If the employer stops paying after three months, the future annual projection must be revised. Store the `assumption` and a coverage start/end or validity window where available. Do not assume a full year by default if benefit timing is uncertain; present it as a twelve-month equivalent.

### 11.3 Source provenance and source binding

Derived dollars must remain linked to the exact source fact. The fact that the conversational text says "$420" is not enough if the context contains multiple independent annual figures. Verify relevant turn IDs, active workflow ID and original amount ID.

### 11.4 Human language and frustration

"Bruh" doesn't alter policy. It is an informal correction signal. Victoria should acknowledge the concrete error rather than adopting overly apologetic or patronizing language, and should never lose the original financial question.

### 11.5 Mixed actions

"Record $420 yearly, and move it to savings" may combine **mock projection recording** with **real bank transfer**. Separate the intents; refuse unsupported real transfer while offering only permitted simulated operations with explicit approval.

### 11.6 Specialist disagreement

The policy engine should have final authority; specialists may disagree or time out. The expected fallback must preserve pending workflow specificity and never approve an unverified amount. Do not let voice rewrite an amount or record kind.

### 11.7 Memory lifetime and privacy

Conversation workflow state belongs to the conversation and may expire or close. Long-term user habits/preferences belong to durable memory and have separate correction/forget semantics. Scope all reads by authenticated user; avoid leaking another conversation's pending proposal.

### 11.8 Temporal semantics

`$35/month` is a rate, not a timestamped `$35` realized saving. An annualized figure is a projection over time, not a one-time realized deposit. Make these semantics explicit throughout UI, API, tests and reporting.

---

## 12. Suggested repository patch map

| File | Action | Key code / test change |
|---|---|---|
| `src/agent/context/types.ts` | **New** | typed fact, active workflow, bounded context and reference contracts |
| `src/agent/context/victoria-context-builder.ts` | **New** | assemble verified context sources and workflow state |
| `src/agent/context/intent-reference-resolver.ts` | **New** | resolve period and amount references to fact IDs |
| `src/agent/context/conversation-state-manager.ts` | **New** | typed state transitions + version checking |
| `src/domain/financial-events/derive-recurring-savings.ts` | **New** | deterministic annualization, provenance and overflow checking |
| `src/domain/savings/types.ts` | **Modify** | discriminated projection/goal/realized models |
| `src/agent/types.ts` | **Modify** | structured reference hints and typed resolved intent |
| `src/agent/llm/openai-financial-moment.ts` | **Modify** | allowlisted amount reference and period selection output |
| `src/agent/validation.ts` | **Modify** | validate reference IDs and context-derived amounts |
| `src/agent/victoria-agent.ts` | **Modify** | build context early; resolve and revise before fallback/approval |
| `src/agent/policy.ts` | **Modify cautiously** | action/version-scoped approval, not looser regexes |
| `src/agent/team-prototype.ts` | **Modify** | bounded resolved context in specialist contracts |
| `src/agent/team/openai-specialists.ts` | **Modify** | pass validated selected amount/period/source to savings reasoning |
| `src/agent/team-assessment-policy.ts` | **Modify** | validate against resolved known facts and derivation |
| `src/agent/team-response-policy.ts` | **Modify** | supported money-fact set, correct projection wording |
| `src/agent/memory/types.ts` | **Extend/adapt** | recent-turn adapter and memory retrieval contract; avoid duplicating workflow state |
| `src/app/create-victoria-agent.ts` | **Modify** | dependency injection for context/state/resolver |
| `src/app/create-persistent-victoria-agent.ts` | **Modify** | durable workflow/fact repositories |
| `src/app/http/create-local-mock-victoria-runtime.ts` | **Modify** | local mock parity and state seam |
| `db/migrations/*` | **New migration(s)** | workflow, facts, projections; no guessed destructive rewrite |
| `tests/unit/agent/*` | **Add** | resolver, builder, state manager, provenance, approval, output guard |
| `tests/integration/chat-flows/*` | **Add** | full annual gym conversation + branches |
| `tests/evaluation/multi-agent-conversations.test.ts` | **Extend** | provider/mock paraphrase and correction evaluations |

---

## 13. Recommended next implementation task for a coding agent

**Task:** Implement context-aware selection and revision of a recurring avoided-expense projection, without introducing any real-money movement or allowing projected amounts to appear as realized savings.

**Scope:**

1. Write the failing integration test for the exact quoted gym conversation, asserting structured decisions and mock data state.
2. Introduce minimal typed active workflow/fact state, scoped to `(userId, conversationId)` and persisted in production.
3. Support `$35/month -> $420/year`, preserving conditional annualization provenance.
4. Extend classification with symbolic period and amount-reference hints; resolve against the active workflow and verified facts.
5. On “annual,” persist that selection; on “record the yearly amount,” supersede `$35` proposal with a typed `$420 annual projection` proposal and show the exact confirmation.
6. Keep strict approval checks, no real-money transfers, no projection-to-realized ledger contamination.
7. Update mock and provider contracts, amount-guard logic, and relevant tests; avoid unexpected breaking changes to unrelated flows.
8. Run type checks, unit tests, integration tests and evaluator scenarios. Record any design deviations in an ADR.

**Definition of done:**

- Exact original conversation passes without loss of annual selection.
- Structured decision contains the right fact/amount/period/type before any write.
- Old `$35` proposal is superseded or explicitly cancelled; not left actionable.
- `$420` annual projection is stored distinctly from actual/mock realized savings, or the assistant transparently declines until projection storage is built.
- All writes require explicit exact-action approval; zero actual transfers.
- Corrections, ambiguity, concurrency and restart scenarios receive targeted, safe behavior.
- Logging identifies whether fallback was classification failure, failed reference resolution, missing fact, stale proposal or provider error.

---

## 14. Final conclusion

The root issue is **not** that Victoria lacks a long enough prompt. It has conversation history and memory machinery, but its **typed execution state fails to preserve and resolve what the user has selected**. The immediate case requires recognizing a recurring cost, deriving an annual projection, preserving the user's annual choice, revising an incompatible pending monthly proposal, distinguishing projections from realized savings, and asking for exact-action confirmation.

A **Context Builder + Intent Reference Resolver + Conversation State Manager** is the right high-level approach. The context builder makes relevant information accessible; the resolver binds ordinary conversation to authoritative financial facts; the state manager commits valid decisions; and the existing policy/domain layer controls approvals and mock ledger actions. The result should be more natural conversational behavior **without weakening financial safety controls**.

### Verification note

This document is grounded in the GitHub `main` source inspected during this conversation and the user-provided transcript. It is a proposed engineering change set, not evidence that the fixes have been implemented or tested. Exact line positions may shift with commits; follow the linked file names and function identifiers above.
