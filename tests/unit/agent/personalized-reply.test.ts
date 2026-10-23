import { describe, expect, it, vi } from "vitest";
import { OpenAiPersonalizedReply } from "../../../src/agent/memory/openai-personalized-reply.js";
import { validatePersonalizedReply } from "../../../src/agent/memory/personalized-reply.js";

const input = {
  userMessage: "I'm stuck and could use a practical next step.",
  baselineReply: "We can take this one step at a time. What feels most useful to start with?",
  memories: [{ id: "memory_style", category: "preference" as const, key: "response_style", value: "Prefers concise, practical replies." }]
};

describe("personalized ordinary replies", () => {
  it("accepts a grounded reply that names the user memory it used", () => {
    expect(validatePersonalizedReply({
      message: "Let's keep it practical and start with one small step. You said concise suggestions work best for you; what would help most right now?",
      usedMemoryIds: ["memory_style"]
    }, input)).toMatchObject({ usedMemoryIds: ["memory_style"] });
  });

  it("allows ordinary non-financial uses of the word saved", () => {
    expect(validatePersonalizedReply({
      message: "I saved this note for next time. What feels most useful to start with?",
      usedMemoryIds: ["memory_style"]
    }, input)).not.toBeNull();
  });

  it.each([
    { message: "I recorded $80 for you. What next?", usedMemoryIds: ["memory_style"] },
    { message: "You're irresponsible with spending.", usedMemoryIds: ["memory_style"] },
    { message: "Let's keep it practical and start with one small step.", usedMemoryIds: ["memory_style"] },
    { message: "Let's start small.", usedMemoryIds: ["someone_elses_memory"] },
    { message: "", usedMemoryIds: ["memory_style"] }
  ])("rejects unsafe, unsupported, or ungrounded output", (candidate) => {
    expect(validatePersonalizedReply(candidate, input)).toBeNull();
  });

  it("requests a non-stored, bounded rewrite and validates structured output", async () => {
    const answer = {
      message: "Let's keep it practical and start with one small step. What feels useful to try first?",
      usedMemoryIds: ["memory_style"]
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(answer) }] }]
    })));
    const personalizer = new OpenAiPersonalizedReply({ apiKey: "test-only", model: "test-model", fetcher });

    await expect(personalizer.personalize(input)).resolves.toEqual(answer);
    const [, request] = fetcher.mock.calls[0]!;
    const body = JSON.parse(String(request?.body)) as { store?: boolean; input?: string; instructions?: string };
    expect(body.store).toBe(false);
    expect(body.input).toContain("memory_style");
    expect(body.instructions).toContain("ordinary conversation");
  });
});
