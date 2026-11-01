import { formatUsd } from "../../domain/money.js";
import type { AgentRequest } from "../types.js";
import { merchantHabitMemoryKey, merchantSpendMemoryKey } from "./extract-preference.js";
import { withCurrentTurnEvidence } from "./memory-learning-service.js";
import type { MemoryProvider } from "./types.js";

/** Stores and retrieves user-reported typical merchant spending for estimates. */
export class MerchantSpendMemoryService {
  constructor(private readonly memory: MemoryProvider) {}

  async findTypicalSpend(userId: string, merchantName: string): Promise<number | undefined> {
    const memories = await this.memory.listConversationalMemories(userId);
    const key = merchantSpendMemoryKey(merchantName);
    const memory = [...memories].reverse().find((item) => item.category === "habit" && item.key === key && item.confidence >= 0.8);
    const match = memory?.value.match(/^Usually spends \$(\d+(?:\.\d{2})?) at .+\.$/);
    if (!match?.[1]) return undefined;
    const amountCents = Math.round(Number(match[1]) * 100);
    return Number.isSafeInteger(amountCents) && amountCents > 0 ? amountCents : undefined;
  }

  async findHabitEvidence(userId: string, merchantName: string): Promise<string | undefined> {
    const memories = await this.memory.listConversationalMemories(userId);
    const key = merchantHabitMemoryKey(merchantName);
    return [...memories].reverse().find((item) => item.category === "habit" &&
      item.key === key && item.confidence >= 0.8)?.evidence;
  }

  async rememberTypicalSpend(
    request: AgentRequest,
    merchantName: string,
    amountCents: number,
    answer: string
  ): Promise<void> {
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return;
    const memories = await this.memory.listConversationalMemories(request.userId);
    const key = merchantSpendMemoryKey(merchantName);
    const prior = [...memories].reverse().find((item) => item.category === "habit" && item.key === key);
    const value = `Usually spends ${formatUsd(amountCents)} at ${merchantName}.`;
    if (prior?.value === value) return;
    await this.memory.rememberConversationalMemory(request.userId, withCurrentTurnEvidence({
      category: "habit",
      key,
      value,
      evidence: `Asked about typical spend at ${merchantName}; user answered: ${answer}`,
      confidence: 0.9,
      ...(prior ? { supersedesId: prior.id } : {})
    }, request));
  }
}
