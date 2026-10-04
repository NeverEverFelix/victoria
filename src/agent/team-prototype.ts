import type { AgentMemory, ClassifiedMessage } from "./types.js";
import { clarificationAfterSpecialistFailure, fallbackFinding, validateTeamAssessment, validateTeamFinding } from "./team-assessment-policy.js";
import { finalizeCompanionResponse, requiredDisclosures } from "./team-response-policy.js";

/** Advisory result from the financial-moment specialist. */
export interface FinancialMomentFinding {
  classification: ClassifiedMessage;
}

/** Savings reasoning can suggest or ask, but has no approval or tool authority. */
export type SavingsAssessment =
  | { outcome: "suggest"; amountCents: number; source: "user_provided" | "habit_estimate"; rationale: string }
  | { outcome: "ask"; question: string }
  | { outcome: "reflect"; rationale: string };

export type SpecialistRole = "financialMoment" | "savingsReasoning" | "companionVoice";

export interface AgentTeamSpecialists {
  financialMoment: {
    analyze(input: { message: string; memory: AgentMemory }): Promise<FinancialMomentFinding>;
  };
  savingsReasoning: {
    assess(input: { finding: FinancialMomentFinding; memory: AgentMemory }): Promise<SavingsAssessment>;
  };
  companionVoice: {
    respond(input: {
      finding: FinancialMomentFinding;
      assessment: SavingsAssessment;
      requiredDisclosures: readonly string[];
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

  async respond(input: { message: string; memory: AgentMemory }): Promise<AgentTeamTurn> {
    const startedAt = this.nowMs();
    const timings: SpecialistTiming[] = [];
    const failedRoles: SpecialistRole[] = [];

    const momentResult = await this.measure("financialMoment", timings, () => this.specialists.financialMoment.analyze(input));
    const validatedFinding = momentResult.ok ? validateTeamFinding(momentResult.value) : null;
    if (!validatedFinding) {
      const failedRoles = ["financialMoment"] as SpecialistRole[];
      const finding = fallbackFinding(input.message);
      const assessment = clarificationAfterSpecialistFailure("financialMoment");
      const response = finalizeCompanionResponse(undefined, finding, assessment);
      return this.finish(finding, assessment, response.message, startedAt, timings, failedRoles);
    }

    const finding = validatedFinding;
    const savingsResult = await this.measure("savingsReasoning", timings, () =>
      this.specialists.savingsReasoning.assess({ finding, memory: input.memory })
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
