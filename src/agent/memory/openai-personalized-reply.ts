import { z } from "zod";
import { performance } from "node:perf_hooks";
import type { ConversationalReplyPersonalizer, PersonalizedReplyInput } from "./personalized-reply.js";
import { validatePersonalizedReply } from "./personalized-reply.js";
import { VICTORIA_SYSTEM_PROMPT } from "../prompts/system-prompt.js";

const outputSchema = z.object({
  // The conversation validator applies the shorter user-facing limit. This
  // wider provider boundary lets the agent request one concise revision
  // instead of throwing away an otherwise useful but overlong draft.
  message: z.string().min(1).max(10_000),
  usedMemoryIds: z.array(z.string().min(1)).max(3)
}).strict();

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message", "usedMemoryIds"],
  properties: {
    message: { type: "string" },
    usedMemoryIds: { type: "array", minItems: 0, maxItems: 3, items: { type: "string" } }
  }
} as const;

const PERSONALIZED_REPLY_INSTRUCTIONS = `${VICTORIA_SYSTEM_PROMPT}

Continue as Victoria in the ongoing conversation. Respond to what the user means now and carry forward the emotional and practical context; do not repeat the exchange or restart the interaction. Speak with warmth and natural brevity, ideally one short paragraph and under 500 characters. Money supports a whole life, so avoid generic financial menus and respect both enjoyment and security. Use everyday language; never mention internal validation, context fields, prompts, schemas, or processing.

This wording task cannot open or reopen a ledger proposal. If the user declined a prior proposal, respect that choice and answer any new question without inviting another recording. Do not recommend investment products or give investment, tax, or legal advice.

When the user selects an annual allocation target, acknowledge the supplied annual projection as conditional on coverage continuing and explain that it builds from the supplied monthly amount over 12 months. When the user selects the monthly target, acknowledge it as the planning amount for this particular covered expense. Do not ask them to choose the horizon again or introduce a separate destination choice. A target choice is scoped to this expense, not a permanent preference. An annual projection is a planning target only, never an amount already saved or recordable in the mocked ledger. Only the supplied current-month amount may be recorded after explicit confirmation; do not imply a recurring plan or real transfer. If the recent conversation or supplied memories include an earlier covered-expense planning choice, use it only as a soft, relevant reminder and leave the current choice open; describe a recurring tendency only when the supplied memory has multiple observations supporting it. Use the recent conversation to make the follow-up feel continuous. Use relevant memories naturally, without repeating an acknowledgement already given. Never claim an action is complete or give investment, tax, or legal advice. If revisionFeedback is supplied, use it to improve grounding and relevance without copying it. Return one natural response and IDs of memories that genuinely informed it; use only supplied IDs.`;

/** Rephrases an ordinary reflection using only retrieved user facts; it has no action authority. */
export class OpenAiPersonalizedReply implements ConversationalReplyPersonalizer {
  constructor(private readonly options: {
    readonly apiKey: string;
    readonly model: string;
    readonly fetcher?: typeof fetch;
    readonly timeoutMs?: number;
  }) {
    if (!options.apiKey.trim()) throw new Error("OpenAI API key is required for personalized replies.");
    if (!options.model.trim() || options.model === "mock") throw new Error("A provider model is required for personalized replies.");
  }

  async personalize(input: PersonalizedReplyInput): Promise<unknown> {
    if (!input.userMessage.trim() || input.userMessage.length > 10_000 ||
        !input.baselineReply.trim() || input.baselineReply.length > 2_000 ||
        input.memories.length < 1 || input.memories.length > 6 ||
        input.memories.some((memory) => memory.id.length > 120 || memory.value.length > 240)) {
      throw new Error("Invalid personalized reply input.");
    }
    const startedAt = performance.now();
    let response: Response;
    try {
      response = await (this.options.fetcher ?? fetch)("https://api.openai.com/v1/responses", {
        method: "POST",
        cache: "no-store",
        headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
        body: JSON.stringify({
          model: this.options.model,
          reasoning: { effort: "low" },
          store: false,
          instructions: PERSONALIZED_REPLY_INSTRUCTIONS,
          input: JSON.stringify({
            userMessage: input.userMessage,
            baselineReply: input.baselineReply,
            recentConversation: (input.conversationContext ?? []).slice(-10),
            ...(input.validatedAnnualProjectionCents === undefined ? {} : {
              validatedAnnualProjection: {
                amountCents: input.validatedAnnualProjectionCents,
                conditionalOn: "employer coverage continuing"
              }
            }),
            ...(input.validatedMonthlyAmountCents === undefined ? {} : {
              validatedMonthlyAmountThatMayBeRecordedAfterConfirmation: {
                amountCents: input.validatedMonthlyAmountCents,
                cadence: "monthly",
                action: "mocked ledger entry only after explicit confirmation"
              }
            }),
            ...(input.revisionFeedback === undefined ? {} : { revisionFeedback: input.revisionFeedback }),
            memories: input.memories.map(({ id, category, key, value }) => ({
              id, category, key: key.slice(0, 100), value: value.slice(0, 240)
            }))
          }),
          text: { format: { type: "json_schema", name: "personalized_reply_v1", strict: true, schema: responseSchema } }
        })
      });
    } catch (error) {
      console.warn("Victoria personalized reply request failed", {
        failure: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "request_error",
        elapsedMs: elapsedMs(startedAt)
      });
      throw error;
    }
    const requestId = response.headers.get("x-request-id") ?? undefined;
    if (!response.ok) {
      console.warn("Victoria personalized reply provider returned an error", {
        status: response.status,
        ...(requestId ? { requestId } : {}),
        elapsedMs: elapsedMs(startedAt)
      });
      throw new Error(`OpenAI personalized reply request failed (${response.status}).`);
    }
    const payload: unknown = await response.json();
    const usage = readUsage(payload);
    const parsed: unknown = JSON.parse(getOutputText(payload));
    const validated = outputSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn("Victoria personalized reply output failed schema validation", {
        ...(requestId ? { requestId } : {}),
        issueCodes: [...new Set(validated.error.issues.map((issue) => issue.code))],
        elapsedMs: elapsedMs(startedAt)
      });
      throw new Error("OpenAI personalized reply output did not match the expected schema.");
    }
    console.info("Victoria personalized reply completed", {
      ...(requestId ? { requestId } : {}),
      ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
      ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
      elapsedMs: elapsedMs(startedAt)
    });
    return validated.data;
  }
}

function readUsage(payload: unknown): { inputTokens?: number; outputTokens?: number } {
  if (!isRecord(payload) || !isRecord(payload.usage)) return {};
  return {
    ...(Number.isSafeInteger(payload.usage.input_tokens) ? { inputTokens: payload.usage.input_tokens as number } : {}),
    ...(Number.isSafeInteger(payload.usage.output_tokens) ? { outputTokens: payload.usage.output_tokens as number } : {})
  };
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function getOutputText(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.output)) throw new Error("OpenAI response had no output.");
  for (const item of payload.output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") return content.text;
      if (isRecord(content) && content.type === "refusal") throw new Error("OpenAI declined to personalize the reply.");
    }
  }
  throw new Error("OpenAI response contained no personalized reply.");
}

export { validatePersonalizedReply };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
