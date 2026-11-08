import type { AgentMemory } from "./types.js";
import { isMemoryTopicMatched, isSpendingQuestion } from "./memory/personalized-ordinary-reply.js";
import { suppressLifecycleConflictingEpisodes } from "./memory/episodic-summary.js";
import type { MemoryProvider } from "./memory/types.js";

/** Retrieves optional dialogue memory and applies lifecycle-safe context enrichment. */
export class ConversationMemoryContextService {
  constructor(private readonly memory: MemoryProvider) {}

  async retrieve(userId: string, message: string): Promise<AgentMemory> {
    let memory: AgentMemory;
    try {
      memory = await this.memory.getMemoryForUser(userId, message);
    } catch {
      return emptyMemory();
    }

    const memories = memory.conversationalMemories ?? [];
    if (memories.some((item) => item.sourceMetadata?.memoryKind === "episodic_summary")) {
      try {
        const lifecycleMemories = await this.memory.listCurrentConversationalMemories?.(userId, true) ?? [];
        memory = {
          ...memory,
          conversationalMemories: [...suppressLifecycleConflictingEpisodes(memories, lifecycleMemories)]
        };
      } catch {
        // Without lifecycle reads, narrative summaries could reintroduce retired facts.
        memory = {
          ...memory,
          conversationalMemories: memories.filter((item) => item.sourceMetadata?.memoryKind !== "episodic_summary")
        };
      }
    }

    const activityMapping = (memory.conversationalMemories ?? []).find((item) =>
      item.key.startsWith("activity_mapping:") && isSpendingQuestion(message) &&
      isMemoryTopicMatched(item, message) && typeof item.sourceMetadata?.profileKey === "string");
    if (activityMapping && typeof activityMapping.sourceMetadata?.target === "string") {
      try {
        const linkedProfile = await this.memory.getMemoryForUser(userId, activityMapping.sourceMetadata.target);
        memory = {
          ...memory,
          conversationalMemories: [...(memory.conversationalMemories ?? []), ...(linkedProfile.conversationalMemories ?? [])]
            .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
        };
      } catch {
        // A missing secondary profile lookup does not block this turn.
      }
    }
    return memory;
  }
}

function emptyMemory(): AgentMemory {
  return { habits: [], goals: [], recentDecisions: [], conversationalMemories: [] };
}
