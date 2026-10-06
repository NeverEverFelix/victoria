import { immutableSnapshot } from "../../domain/immutable.js";

export interface ProviderUsageRecord {
  role: "financial_moment" | "savings_reasoning" | "companion_voice";
  inputTokens?: number;
  outputTokens?: number;
  requestId?: string;
  elapsedMs?: number;
}

export interface ProviderUsageRateCard {
  effectiveDate: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

export interface ProviderUsageSummary {
  effectiveRateDate: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
  estimatedCostUsdByRole: Record<ProviderUsageRecord["role"], number | null>;
  callsByRole: Record<ProviderUsageRecord["role"], number>;
  tokensByRole: Record<ProviderUsageRecord["role"], { input: number; output: number }>;
  requestIds: string[];
}

/** Collects provider response metadata independently of agent decisions. */
export class ProviderUsageReporter {
  private readonly records: ProviderUsageRecord[] = [];

  report(record: ProviderUsageRecord): void {
    this.records.push(immutableSnapshot(record));
  }

  snapshot(): readonly ProviderUsageRecord[] {
    return immutableSnapshot(this.records);
  }

  toJsonLines(): string {
    return this.records.map((record) => JSON.stringify(record)).join("\n");
  }

  summarize(rateCard: ProviderUsageRateCard): ProviderUsageSummary {
    if (!rateCard.effectiveDate.trim() ||
        !Number.isFinite(rateCard.inputUsdPerMillionTokens) || rateCard.inputUsdPerMillionTokens < 0 ||
        !Number.isFinite(rateCard.outputUsdPerMillionTokens) || rateCard.outputUsdPerMillionTokens < 0) {
      throw new Error("Provider usage rate card must include a date and finite non-negative rates.");
    }

    const roles: ProviderUsageRecord["role"][] = ["financial_moment", "savings_reasoning", "companion_voice"];
    const callsByRole = Object.fromEntries(roles.map((role) => [role, 0])) as ProviderUsageSummary["callsByRole"];
    const tokensByRole = Object.fromEntries(roles.map((role) => [role, { input: 0, output: 0 }])) as ProviderUsageSummary["tokensByRole"];
    let inputTokens = 0;
    let outputTokens = 0;
    let estimatedCostUsd = 0;
    let completeUsage = true;
    const completeUsageByRole = Object.fromEntries(roles.map((role) => [role, true])) as Record<ProviderUsageRecord["role"], boolean>;
    const estimatedCostUsdByRole = Object.fromEntries(roles.map((role) => [role, 0])) as Record<ProviderUsageRecord["role"], number>;

    for (const record of this.records) {
      callsByRole[record.role] += 1;
      if (record.inputTokens === undefined || record.outputTokens === undefined) {
        completeUsage = false;
        completeUsageByRole[record.role] = false;
        continue;
      }
      tokensByRole[record.role].input += record.inputTokens;
      tokensByRole[record.role].output += record.outputTokens;
      inputTokens += record.inputTokens;
      outputTokens += record.outputTokens;
      const recordCost = (record.inputTokens * rateCard.inputUsdPerMillionTokens +
        record.outputTokens * rateCard.outputUsdPerMillionTokens) / 1_000_000;
      estimatedCostUsd += recordCost;
      estimatedCostUsdByRole[record.role] += recordCost;
    }

    return immutableSnapshot({
      effectiveRateDate: rateCard.effectiveDate,
      calls: this.records.length,
      inputTokens,
      outputTokens,
      estimatedCostUsd: completeUsage ? estimatedCostUsd : null,
      estimatedCostUsdByRole: Object.fromEntries(roles.map((role) => [
        role, completeUsageByRole[role] ? estimatedCostUsdByRole[role] : null
      ])) as ProviderUsageSummary["estimatedCostUsdByRole"],
      callsByRole,
      tokensByRole,
      requestIds: this.records.flatMap((record) => record.requestId ? [record.requestId] : [])
    });
  }

  roleLatenciesMs(): Record<ProviderUsageRecord["role"], readonly number[]> {
    const roles: ProviderUsageRecord["role"][] = ["financial_moment", "savings_reasoning", "companion_voice"];
    const latencies = Object.fromEntries(roles.map((role) => [role, [] as number[]])) as Record<ProviderUsageRecord["role"], number[]>;
    for (const record of this.records) {
      if (record.elapsedMs !== undefined) latencies[record.role].push(record.elapsedMs);
    }
    return immutableSnapshot(latencies);
  }
}
