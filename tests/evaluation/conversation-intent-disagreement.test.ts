import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coordinateConversationTurn } from "../../src/agent/conversation-turn-coordinator.js";
import { buildConversationIntentPlan } from "../../src/agent/conversation-intent-plan.js";
import { buildConversationContextSnapshot } from "../../src/agent/conversation-responder.js";
import {
  ConversationTurnUnderstandingService,
  type TurnUnderstandingComparison
} from "../../src/agent/turn-understanding.js";
import type { AdvisoryTurnPlan } from "../../src/agent/turn-understanding.js";
import type { ClassifiedMessage } from "../../src/agent/types.js";

interface DisagreementCase {
  readonly id: string;
  readonly message: string;
  readonly financialClassificationType: ClassifiedMessage["type"];
  readonly hasPendingWorkflow: boolean;
  readonly advisory: {
    readonly primaryIntent: AdvisoryTurnPlan["primaryIntent"];
    readonly requestedAction: AdvisoryTurnPlan["requestedAction"];
    readonly actionMention: AdvisoryTurnPlan["actionMention"];
  };
  readonly expectedIntentDisagreement: boolean;
  readonly expectedActionDisagreement: boolean;
  readonly expectedRoute: "read_only" | "pending_workflow" | "financial_workflow";
}

interface DisagreementCorpus {
  readonly version: 1;
  readonly cases: readonly DisagreementCase[];
}

const corpusText = readFileSync(new URL("./fixtures/conversation-intent-disagreement-v1.json", import.meta.url), "utf8");
const corpusHash = createHash("sha256").update(corpusText).digest("hex");
const corpus = JSON.parse(corpusText) as DisagreementCorpus;

describe("fixed intent/advisory disagreement evaluation v1", () => {
  it("keeps the edge-case corpus frozen", () => {
    expect(corpus.version).toBe(1);
    expect(corpusHash).toBe("1906fe2d8a65e0def2fc8522138fb5d177fcc474bc040b35001ac230939e3cc3");
    expect(corpus.cases.map(({ id }) => id)).toEqual([
      "advice-question-versus-savings-proposal",
      "record-request-versus-dialogue",
      "agreement-and-debt-question-versus-planning",
      "historical-transfer-versus-real-transfer-request",
      "negated-transfer-versus-real-transfer-request",
      "plain-topic-control"
    ]);
  });

  it.each(corpus.cases)("compares $id without granting advisory action authority", async (fixture) => {
    const deterministicPlan = buildConversationIntentPlan({
      message: fixture.message,
      hasPendingWorkflow: fixture.hasPendingWorkflow
    });
    const advisoryPlan: AdvisoryTurnPlan = {
      schemaVersion: 1,
      primaryIntent: fixture.advisory.primaryIntent,
      secondaryIntents: [],
      dialogueActs: fixture.message.includes("?") ? ["question"] : ["personal_update"],
      questionFocus: fixture.message.slice(0, 240),
      references: [],
      requestedReadOnlyTools: [],
      actionMention: fixture.advisory.actionMention,
      requestedAction: fixture.advisory.requestedAction,
      uncertainty: { needsClarification: false, reasons: [] }
    };
    const comparisons: TurnUnderstandingComparison[] = [];
    const interpretationService = new ConversationTurnUnderstandingService({
      provider: { understandTurn: async () => advisoryPlan },
      onComparison: (comparison) => comparisons.push(comparison)
    });
    const interpretation = await interpretationService.understand({
      contextSnapshot: buildConversationContextSnapshot({ message: fixture.message, recentTurns: [], memories: [] }),
      fallback: deterministicPlan
    });
    const coordinated = coordinateConversationTurn({
      message: fixture.message,
      deterministicPlan,
      advisoryPlan: interpretation.plan,
      financialClassificationType: fixture.financialClassificationType,
      hasPendingWorkflow: fixture.hasPendingWorkflow,
      responderEnabled: true
    });

    expect(interpretation.source).toBe("model");
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]?.intentsDisagree).toBe(fixture.expectedIntentDisagreement);
    expect(comparisons[0]?.actionsDisagree).toBe(fixture.expectedActionDisagreement);
    expect(coordinated.route).toBe(fixture.expectedRoute);
    expect(coordinated.requestedAction).toBe(deterministicPlan.actionRequest.kind);
  });
});
