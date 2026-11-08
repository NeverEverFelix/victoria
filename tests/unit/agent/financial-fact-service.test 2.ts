import { describe, expect, it, vi } from "vitest";
import { FinancialFactService } from "../../../src/agent/financial-fact-service.js";

describe("FinancialFactService", () => {
  it("keeps deterministic projection facts when reference resolution is unavailable", async () => {
    const resolver = { resolve: vi.fn(async () => { throw new Error("reference provider unavailable"); }) };
    const service = new FinancialFactService(resolver);

    const result = await service.build("What is the yearly total for both costs?", [
      "I canceled a gym membership that cost $35 each month.",
      "I stopped a streaming service that cost $20 per month."
    ]);

    expect(resolver.resolve).toHaveBeenCalledOnce();
    expect(result.annualProjection).toMatchObject({ annualAmountCents: 66_000, eventCount: 2 });
  });

  it("does not call a read-only reference resolver for an approval fragment", async () => {
    const resolver = { resolve: vi.fn(async () => ({ kind: "none" as const, sourceTurnIndexes: [], confidence: 1 })) };
    const service = new FinancialFactService(resolver);

    await service.build("Yes", [
      "I canceled a gym membership that cost $35 each month.",
      "That could free about $420 a year. Would you like me to prepare a savings suggestion?"
    ]);

    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it("does not let a read-only reference resolver reinterpret explicit transfer language", async () => {
    const resolver = { resolve: vi.fn(async () => ({ kind: "annual_projection" as const, sourceTurnIndexes: [0, 1], confidence: 1 })) };
    const service = new FinancialFactService(resolver);

    await service.build("Please transfer the freed money to my savings account now; what is the annual total?", [
      "I canceled a gym membership that cost $35 each month.",
      "I stopped a subscription costing $20 a month."
    ]);

    expect(resolver.resolve).not.toHaveBeenCalled();
  });
});
