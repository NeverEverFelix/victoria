import type { ContextReferenceResolver } from "./context-reference-resolver.js";
import { buildTurnContext, projectionFromResolvedReferences } from "./turn-context.js";
import { isExplicitRealMoneyMovementRequest } from "./money-movement-intent.js";

export type BuiltTurnContext = ReturnType<typeof buildTurnContext>;

export interface FinancialFactContext {
  readonly turnContext: BuiltTurnContext;
  readonly annualProjection: BuiltTurnContext["annualProjection"];
}

/** Builds deterministic financial context and optionally resolves references for read-only planning. */
export class FinancialFactService {
  constructor(private readonly referenceResolver?: ContextReferenceResolver) {}

  async build(message: string, priorTurns: readonly string[]): Promise<FinancialFactContext> {
    const turnContext = buildTurnContext({ message, priorTurns });
    let annualProjection = turnContext.annualProjection;
    if (this.referenceResolver && turnContext.recurringCosts.length >= 2 &&
        turnContext.annualProjectionRequested &&
        !/^\s*(?:yes|no|nope|nah)\b/i.test(message) &&
        !isExplicitRealMoneyMovementRequest(message)) {
      try {
        const resolution = await this.referenceResolver.resolve({ message, recurringCosts: turnContext.recurringCosts });
        annualProjection = projectionFromResolvedReferences(turnContext, resolution) ?? turnContext.annualProjection;
      } catch {
        // Reference resolution cannot grant approval or interrupt deterministic planning.
      }
    }
    return Object.freeze({ turnContext, annualProjection });
  }
}
