import type { SavingsSuggestion } from "../../domain/savings/types.js";
import type { ClassifiedMessage } from "../types.js";
import type { CompanionVoiceSpecialist } from "./companion-voice.js";
import {
  FinancialMomentInputSchema,
  FinancialMomentOutputSchema,
  HANDOFF_SCHEMA_VERSION,
  SavingsReasoningFactsSchema,
  SavingsReasoningInputSchema,
  SavingsReasoningOutputSchema,
  SavingsRecommendationSchema,
  type SavingsReasoningFactsPayload
} from "./handoff-schemas.js";
import {
  createSpecialistTrace,
  recordTraceSafely,
  type SpecialistHandoffStatus,
  type SpecialistRole,
  type SpecialistTraceSink
} from "./tracing.js";

export interface FinancialMomentSpecialist {
  analyze(input: { handoff: ReturnType<typeof FinancialMomentInputSchema.parse>; signal: AbortSignal }): Promise<unknown>;
}

export type SavingsReasoningFacts = SavingsReasoningFactsPayload;

export type SavingsRecommendation =
  | { kind: "no_suggestion" }
  | ({ kind: "suggest" } & SavingsSuggestion);

export interface SavingsReasoningSpecialist {
  recommend(input: {
    handoff: ReturnType<typeof SavingsReasoningInputSchema.parse>;
    signal: AbortSignal;
  }): Promise<unknown>;
}

export interface SpecialistTeam {
  moment: FinancialMomentSpecialist;
  savings: SavingsReasoningSpecialist;
  voice?: CompanionVoiceSpecialist;
}

export type SpecialistCoordinationResult =
  | {
      status: "ready";
      classification: ClassifiedMessage;
      recommendation: SavingsRecommendation | { kind: "not_applicable" };
    }
  | {
      status: "clarify";
      reason:
        | "specialist_failure"
        | "invalid_specialist_output"
        | "moment_needs_clarification"
        | "specialist_disagreement";
      classification?: ClassifiedMessage;
    };

/**
 * Runs advisory financial specialists and reconciles their structured findings.
 * It never authorizes tools or creates financial records.
 */
export async function coordinateSpecialists(
  team: SpecialistTeam,
  input: { userMessage: string },
  options: {
    timeoutMs?: number;
    correlationId?: string;
    traceSink?: SpecialistTraceSink;
    estimateSpend: (facts: SavingsReasoningFacts, signal: AbortSignal) => Promise<SavingsSuggestion | null>;
  }
): Promise<SpecialistCoordinationResult> {
  const configuredTimeout = options.timeoutMs ?? 10_000;
  const timeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 10_000;
  const correlationId = options.correlationId ?? globalThis.crypto.randomUUID();
  const moment = await runTracedSpecialist(
    "financial_moment",
    correlationId,
    options.traceSink,
    timeoutMs,
    (signal) => team.moment.analyze({
      handoff: FinancialMomentInputSchema.parse({ schemaVersion: HANDOFF_SCHEMA_VERSION, userMessage: input.userMessage }),
      signal
    }),
    (value) => FinancialMomentOutputSchema.safeParse(value).success ? "succeeded" : "invalid_output"
  );
  if (!moment.ok) {
    return {
      status: "clarify",
      reason: moment.status === "invalid_output" ? "invalid_specialist_output" : "specialist_failure"
    };
  }
  const parsedMoment = FinancialMomentOutputSchema.parse(moment.value);
  const classification = parsedMoment.classification as ClassifiedMessage;

  if (classification.needsClarification || classification.amountIssue !== undefined) {
    return { status: "clarify", reason: "moment_needs_clarification", classification };
  }

  if (classification.type !== "avoided_spend") {
    return {
      status: "ready",
      classification,
      recommendation: { kind: "not_applicable" }
    };
  }

  const savings = await runTracedSpecialist(
    "savings_reasoning",
    correlationId,
    options.traceSink,
    timeoutMs,
    async (signal) => {
      const facts: SavingsReasoningFacts = SavingsReasoningFactsSchema.parse({
        eventType: "avoided_spend",
        ...(classification.merchantName ? { merchantName: classification.merchantName } : {}),
        ...(classification.amountCents !== undefined ? { userProvidedAmountCents: classification.amountCents } : {})
      });
      const handoff = SavingsReasoningInputSchema.parse({ schemaVersion: HANDOFF_SCHEMA_VERSION, facts });
      const rawSpecialistOutput = await team.savings.recommend({ handoff, signal });
      const specialistOutput = SavingsReasoningOutputSchema.safeParse(rawSpecialistOutput);
      if (!specialistOutput.success) throw new InvalidSpecialistOutputError();
      const specialistRecommendation = specialistOutput.data.recommendation;
      signal.throwIfAborted();
      if (specialistRecommendation.kind === "suggest") return specialistRecommendation;
      const estimatedSuggestion = await options.estimateSpend(facts, signal);
      const recommendation: SavingsRecommendation = estimatedSuggestion
        ? { kind: "suggest", ...estimatedSuggestion }
        : { kind: "no_suggestion" };
      return recommendation;
    },
    (recommendation) => {
      if (!isValidRecommendation(recommendation)) return "invalid_output";
      if (
        classification.amountCents !== undefined &&
        (recommendation.kind !== "suggest" ||
          recommendation.amountCents !== classification.amountCents ||
          recommendation.source !== "user_provided")
      ) return "disagreement";
      if (
        recommendation.kind === "suggest" &&
        classification.amountCents === undefined &&
        recommendation.source === "user_provided"
      ) return "disagreement";
      return "succeeded";
    }
  );
  if (!savings.ok) {
    return {
      status: "clarify",
      reason: savings.status === "invalid_output"
        ? "invalid_specialist_output"
        : savings.status === "disagreement"
        ? "specialist_disagreement"
        : "specialist_failure",
      classification
    };
  }

  return { status: "ready", classification, recommendation: savings.value };
}

type TracedSpecialistResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: Exclude<SpecialistHandoffStatus, "succeeded"> };

async function runTracedSpecialist<T>(
  role: SpecialistRole,
  correlationId: string,
  sink: SpecialistTraceSink | undefined,
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<T>,
  validate: (value: T) => SpecialistHandoffStatus
): Promise<TracedSpecialistResult<T>> {
  const startedAt = new Date();
  const start = performance.now();
  let status: SpecialistHandoffStatus;
  let result: TracedSpecialistResult<T>;
  try {
    const value = await runWithTimeout(work, timeoutMs);
    status = validate(value);
    result = status === "succeeded" ? { ok: true, value } : { ok: false, status };
  } catch (error) {
    status = error instanceof SpecialistTimeoutError
      ? "timed_out"
      : error instanceof InvalidSpecialistOutputError
      ? "invalid_output"
      : "failed";
    result = { ok: false, status };
  }
  recordTraceSafely(sink, createSpecialistTrace({
    correlationId,
    role,
    status,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Math.max(0, Math.round(performance.now() - start))
  }));
  return result;
}

async function runWithTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new SpecialistTimeoutError());
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

class SpecialistTimeoutError extends Error {}
class InvalidSpecialistOutputError extends Error {}

function isValidRecommendation(value: SavingsRecommendation): boolean {
  return SavingsRecommendationSchema.safeParse(value).success;
}
