import { createHash } from "node:crypto";
import type { SavingsEntry } from "../../domain/savings/types.js";
import { DEFAULT_CONVERSATION_CONTEXT_LIMIT } from "./types.js";
import type { ConversationalMemory, MemoryProvider } from "./types.js";
import {
  authoritativeEpisodeOutcome,
  validateEpisodicSummary,
  type AuthoritativeEpisodeOutcome,
  type EpisodicMemorySummarizer
} from "./episodic-summary.js";

type EpisodicMemoryStorage = Pick<MemoryProvider, "listConversationalMemories" | "rememberConversationalMemory">;

/** Creates grounded, source-linked episodic summaries without owning dialogue or financial workflows. */
export class EpisodicMemoryService {
  constructor(
    private readonly storage: EpisodicMemoryStorage,
    private readonly summarizer?: EpisodicMemorySummarizer
  ) {}

  async summarize(input: {
    readonly userId: string;
    readonly context: readonly string[];
    readonly finishing: boolean;
    readonly entries?: readonly SavingsEntry[];
    readonly sourceTurnReferences?: readonly { readonly turnId: string; readonly userMessage: string }[];
  }): Promise<boolean> {
    if (!this.summarizer || (!input.finishing && input.context.length < DEFAULT_CONVERSATION_CONTEXT_LIMIT)) return false;
    const sourceTurnReferences = input.sourceTurnReferences ?? [];
    const recentTurns = input.context.slice(-16);
    const candidateUserMessages = recentTurns
      .filter((message) => !/^Victoria:/i.test(message))
      .filter(isEpisodicSummaryEligible)
      .slice(-8);
    let existingEpisodes: readonly ConversationalMemory[];
    try {
      existingEpisodes = (await this.storage.listConversationalMemories(input.userId))
        .filter((memory) => memory.sourceMetadata?.memoryKind === "episodic_summary");
    } catch {
      // Reading optional summary history cannot interrupt the active conversation.
      return false;
    }
    const coveredTurnIds = new Set(existingEpisodes.flatMap((memory) => {
      const coverage = memory.sourceMetadata?.summaryCoverage;
      const covered = coverage && typeof coverage === "object" && "coveredTurnIds" in coverage &&
        Array.isArray(coverage.coveredTurnIds)
        ? coverage.coveredTurnIds.filter((id): id is string => typeof id === "string")
        : [];
      const legacy = Array.isArray(memory.sourceMetadata?.sourceTurnReferences)
        ? memory.sourceMetadata.sourceTurnReferences.flatMap((reference) =>
          reference && typeof reference === "object" && "turnId" in reference &&
          typeof reference.turnId === "string" ? [reference.turnId] : [])
        : [];
      return [...covered, ...legacy];
    }));
    const turnIdsByMessage = new Map<string, string[]>();
    for (const reference of sourceTurnReferences) {
      const ids = turnIdsByMessage.get(reference.userMessage) ?? [];
      ids.push(reference.turnId);
      turnIdsByMessage.set(reference.userMessage, ids);
    }
    const userMessages = candidateUserMessages.filter((message) => {
      const turnId = turnIdsByMessage.get(message)?.shift();
      return !turnId || !coveredTurnIds.has(turnId);
    });
    if (userMessages.length < 2) return false;
    const selectedUsers = new Set(userMessages);
    let precedingAssistantMessage: string | undefined;
    const turnPairs = recentTurns.flatMap((message) => {
      if (/^Victoria:/i.test(message)) {
        precedingAssistantMessage = message.replace(/^Victoria:\s*/i, "").slice(0, 2_000);
        return [];
      }
      const pair = selectedUsers.has(message) ? [{
        ...(precedingAssistantMessage ? { precedingAssistantMessage } : {}), userMessage: message
      }] : [];
      precedingAssistantMessage = undefined;
      return pair;
    }).slice(-8);
    const digest = createHash("sha256").update(input.userId).update("\0")
      .update(JSON.stringify(turnPairs)).digest("hex").slice(0, 24);
    const key = `episode:${digest}`;
    if (existingEpisodes.some((memory) => memory.key === key)) return true;
    try {
      // Assistant prose can support interpretation, but only domain-tool results prove a workflow outcome.
      const authoritativeOutcomes: AuthoritativeEpisodeOutcome[] = (input.entries ?? [])
        .filter((entry) => entry.userId === input.userId)
        .flatMap((entry) => {
          const outcome = authoritativeEpisodeOutcome(entry);
          return outcome ? [outcome] : [];
        });
      const sourceReferences = mapEpisodeSourceTurns(userMessages, sourceTurnReferences);
      const candidate = validateEpisodicSummary(
        await this.summarizer!.summarize({ userMessages, turnPairs }), userMessages, authoritativeOutcomes, sourceReferences
      );
      if (!candidate) return false;
      await this.storage.rememberConversationalMemory(input.userId, { ...candidate, key });
      return true;
    } catch {
      // Episode summaries are optional and cannot interrupt the current turn.
      return false;
    }
  }
}

function isEpisodicSummaryEligible(message: string): boolean {
  return message.length <= 1_000 &&
    !/(?:\$\s*\d|\b(?:spent|paid|bought|charged|transaction|account number|card number|password|social security|ssn|pin number|diagnos(?:is|ed)|diabetes|cancer|medication|prescription|mental health|therapy|medical|political|religious|sexuality|race|ethnicity|immigration|visa status)\b)/i.test(message);
}

function mapEpisodeSourceTurns(
  userMessages: readonly string[],
  sourceTurns: readonly { readonly turnId: string; readonly userMessage: string }[]
): readonly { readonly turnId: string; readonly userMessage: string }[] {
  const references: { turnId: string; userMessage: string }[] = [];
  const turnIdsByMessage = new Map<string, string[]>();
  for (const sourceTurn of sourceTurns) {
    const ids = turnIdsByMessage.get(sourceTurn.userMessage) ?? [];
    ids.push(sourceTurn.turnId);
    turnIdsByMessage.set(sourceTurn.userMessage, ids);
  }
  for (const message of userMessages) {
    const turnId = turnIdsByMessage.get(message)?.shift();
    if (turnId?.trim()) references.push({ turnId, userMessage: message });
  }
  return Object.freeze(references);
}
