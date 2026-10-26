import type { AgentMemory, ClassifiedMessage } from "./types.js";
import { clarificationAfterSpecialistFailure, fallbackFinding, validateTeamAssessment, validateTeamFinding } from "./team-assessment-policy.js";
import { applyClassificationConfidencePolicy } from "./confidence-policy.js";
import { finalizeCompanionResponse, requiredDisclosures } from "./team-response-policy.js";
import type { ResolvedFinancialReference, VictoriaConversationContext } from "./conversation-context-builder.js";

/** Advisory result from the financial-moment specialist. */
export interface FinancialMomentFinding {
  classification: ClassifiedMessage;
  /** A validated context fact selected by Financial Moment; never an amount authority. */
  resolvedReference?: ResolvedFinancialReference;
  /** Deterministically validated context for a dynamic voice response; never grants action authority. */
  responseContext?: {
    validatedAdditionalAmountsCents?: readonly number[];
    validatedAnnualProjectionCents?: number;
    rememberedInterests?: readonly string[];
    /** First covered-expense turn asks which allocation target the user prefers. */
    awaitingAllocationTargetChoice?: boolean;
    /** Prior observed choices may guide this similar decision, but never determine it. */
    priorCoveredExpenseAllocation?: {
      lastPlanningHorizon: "monthly" | "annual";
      observationCount: number;
      moreOftenChosen?: "monthly" | "annual";
    };
  };
}

/** Savings reasoning can suggest or ask, but has no approval or tool authority. */
export type SavingsAssessment =
  | { outcome: "suggest"; confidence: number; amountCents: number; source: "user_provided" | "habit_estimate"; rationale: string }
  | { outcome: "ask"; confidence: number; question: string }
  | { outcome: "reflect"; confidence: number; rationale: string };

export type SpecialistRole = "financialMoment" | "savingsReasoning" | "companionVoice";

export interface AgentTeamSpecialists {
  financialMoment: {
    analyze(input: {
      message: string;
      memory: AgentMemory;
      conversationContext?: readonly string[];
      financialContext?: VictoriaConversationContext;
    }): Promise<FinancialMomentFinding>;
  };
  savingsReasoning: {
    assess(input: {
      finding: FinancialMomentFinding;
      memory: AgentMemory;
      financialContext?: VictoriaConversationContext;
    }): Promise<SavingsAssessment>;
  };
  companionVoice: {
    respond(input: {
      finding: FinancialMomentFinding;
      assessment: SavingsAssessment;
      requiredDisclosures: readonly string[];
      revisionFeedback?: string;
    }): Promise<string>;
  };
}

export interface SpecialistTiming {
  role: SpecialistRole;
  durationMs: number;
}

export interface AgentTeamTurn {
  finding: FinancialMomentFinding;
  assessment: SavingsAssessment;
  message: string;
  status: "complete" | "degraded";
  degradedRoles: readonly SpecialistRole[];
  specialistCalls: number;
  specialistTimings: readonly SpecialistTiming[];
  totalDurationMs: number;
}

export interface AgentTeamOptions {
  /** Injectable monotonic clock for deterministic tests and timing instrumentation. */
  nowMs?: () => number;
}

export const AGENT_TEAM_MAX_SPECIALIST_CALLS = 3;

/**
 * Headless orchestration seam for testing specialist handoffs.
 * Advisory only: VictoriaAgent remains the runtime authority for policy,
 * proposal lifecycle, and mocked-ledger tools.
 */
export class AgentTeamPrototype {
  private readonly nowMs: () => number;

  constructor(private readonly specialists: AgentTeamSpecialists, options: AgentTeamOptions = {}) {
    this.nowMs = options.nowMs ?? (() => performance.now());
  }

  async respond(input: {
    message: string;
    memory: AgentMemory;
    financialContext?: VictoriaConversationContext;
  }): Promise<AgentTeamTurn> {
    const startedAt = this.nowMs();
    const timings: SpecialistTiming[] = [];
    const failedRoles: SpecialistRole[] = [];

    const momentResult = await this.measure("financialMoment", timings, () =>
      this.specialists.financialMoment.analyze({
        message: input.message,
        memory: input.memory,
        ...(input.financialContext ? { financialContext: input.financialContext } : {})
      })
    );
    const validatedFinding = momentResult.ok
      ? validateTeamFinding(momentResult.value, input.financialContext)
      : null;
    if (!validatedFinding) {
      const failedRoles = ["financialMoment"] as SpecialistRole[];
      const finding = fallbackFinding(input.message);
      const assessment = clarificationAfterSpecialistFailure("financialMoment");
      const response = finalizeCompanionResponse(undefined, finding, assessment);
      return this.finish(finding, assessment, response.message, startedAt, timings, failedRoles);
    }

    const finding = {
      classification: applyClassificationConfidencePolicy(validatedFinding.classification)
    };
    const savingsResult = await this.measure("savingsReasoning", timings, () =>
      this.specialists.savingsReasoning.assess({
        finding, memory: input.memory,
        ...(input.financialContext ? { financialContext: input.financialContext } : {})
      })
    );
    let assessment: SavingsAssessment;
    if (!savingsResult.ok) {
      failedRoles.push("savingsReasoning");
      assessment = clarificationAfterSpecialistFailure("savingsReasoning");
    } else {
      try {
        assessment = validateTeamAssessment(savingsResult.value, finding, input.memory);
      } catch {
        failedRoles.push("savingsReasoning");
        assessment = clarificationAfterSpecialistFailure("savingsReasoning");
      }
    }

    // Savings Reasoning owns the ask decision and its clarification wording.
    // Companion Voice must not rewrite that into a different intent.
    if (assessment.outcome === "ask") {
      return this.finish(finding, assessment, assessment.question, startedAt, timings, failedRoles);
    }

    const disclosures = requiredDisclosures(finding, assessment);
    const voiceResult = await this.measure("companionVoice", timings, () =>
      this.specialists.companionVoice.respond({ finding, assessment, requiredDisclosures: disclosures })
    );
    const response = finalizeCompanionResponse(voiceResult.ok ? voiceResult.value : undefined, finding, assessment);
    if (!response.voiceDraftAccepted) failedRoles.push("companionVoice");

    return this.finish(finding, assessment, response.message, startedAt, timings, failedRoles);
  }

  private async measure<T>(role: SpecialistRole, timings: SpecialistTiming[], call: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    if (timings.length >= AGENT_TEAM_MAX_SPECIALIST_CALLS) return { ok: false };
    const startedAt = this.nowMs();
    try {
      const value = await call();
      timings.push({ role, durationMs: elapsed(startedAt, this.nowMs()) });
      return { ok: true, value };
    } catch {
      timings.push({ role, durationMs: elapsed(startedAt, this.nowMs()) });
      return { ok: false };
    }
  }

  private finish(
    finding: FinancialMomentFinding,
    assessment: SavingsAssessment,
    message: string,
    startedAt: number,
    timings: SpecialistTiming[],
    degradedRoles: SpecialistRole[]
  ): AgentTeamTurn {
    const specialistTimings = Object.freeze(timings.map((timing) => Object.freeze({ ...timing })));
    const totalDurationMs = elapsed(startedAt, this.nowMs());
    const status = degradedRoles.length ? "degraded" : "complete";
    return Object.freeze({
      finding, assessment, message, status,
      degradedRoles: Object.freeze([...new Set(degradedRoles)]),
      specialistCalls: specialistTimings.length,
      specialistTimings,
      totalDurationMs
    });
  }
}

function elapsed(start: number, end: number): number {
  return Math.max(0, end - start);
}
