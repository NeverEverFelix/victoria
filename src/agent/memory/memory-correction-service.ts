import { formatUsd } from "../../domain/money.js";
import type { AgentRequest, AgentResponse, ClassifiedMessage } from "../types.js";
import { MemoryOrchestrator } from "./memory-orchestrator.js";
import type { ConversationalMemory, MemoryProvider } from "./types.js";

/** Resolves and records a conversational correction to a remembered purchase. */
export async function correctRememberedSpendFromConversation(input: {
  readonly request: AgentRequest;
  readonly conversationContext: readonly string[];
  readonly correction: { readonly amountCents: number; readonly scopeText: string };
  readonly memory: MemoryProvider;
}): Promise<AgentResponse> {
  const priorVictoriaStatement = [...input.conversationContext].reverse().find((message) =>
    message.startsWith("Victoria: ") && /\b(?:spend(?:s|ing)?|spent|purchase|transaction|charged|paid)\b/i.test(message)
  );
  const memories = await input.memory.listConversationalMemories(input.request.userId);
  const target = priorVictoriaStatement
    ? findFinancialMemoryMentionedIn(priorVictoriaStatement, memories)
    : undefined;
  const classification: ClassifiedMessage = {
    type: target ? "general_finance" : "unclear",
    confidence: 1,
    summary: input.request.message,
    needsClarification: !target
  };
  if (!target || !(input.memory instanceof MemoryOrchestrator)) {
    const message = "Which purchase or day are you correcting? I don't want to change the wrong financial detail.";
    return { message, decision: {
      action: "ask_follow_up",
      classification: { ...classification, type: "unclear", needsClarification: true },
      userFacingMessage: message
    } };
  }

  await input.memory.rememberTransactionCorrection({
    userId: input.request.userId,
    memoryId: target.id,
    amountCents: input.correction.amountCents,
    evidence: input.request.message,
    referenceText: input.correction.scopeText
  });
  const amount = formatUsd(input.correction.amountCents);
  const message = `Thanks for correcting me. I'll remember that you spent ${amount} on ${input.correction.scopeText}. I haven't changed or recorded any money.`;
  return { message, decision: { action: "reflect", classification, userFacingMessage: message } };
}

function findFinancialMemoryMentionedIn(
  assistantMessage: string,
  memories: readonly ConversationalMemory[]
): ConversationalMemory | undefined {
  const normalizedMessage = assistantMessage.toLocaleLowerCase("en-US");
  const stopWords = new Set(["financial", "profile", "merchant", "category", "spend", "spent", "purchase", "purchases",
    "transaction", "transactions", "typical", "usually", "recorded", "posted", "usd", "with", "from", "that", "your", "the", "for"]);
  const scored = memories
    .filter((memory) => memory.category === "financial_pattern" || (memory.category === "habit" && memory.key.startsWith("merchant_spend:")))
    .map((memory) => {
      const searchable = `${memory.key.replace(/[:_]/g, " ")} ${memory.value}`.toLocaleLowerCase("en-US");
      const terms = [...new Set(searchable.match(/[a-z0-9]{3,}/g) ?? [])].filter((term) => !stopWords.has(term));
      const score = terms.filter((term) => normalizedMessage.includes(term)).length;
      return { memory, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  const top = scored[0];
  if (!top || scored[1]?.score === top.score) return undefined;
  return top.memory;
}
