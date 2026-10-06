import type { AgentActionType, AgentRequest, AgentResponse } from "../../../src/agent/types.js";
import type { VictoriaAgent } from "../../../src/agent/victoria-agent.js";
import type { MockVictoriaTools } from "../../../src/agent/tools/mock-tools.js";

export interface ProviderEvalSetupStep {
  message: string;
  expectedAction: AgentActionType;
}

export interface ProviderEvalStateSetup {
  steps: readonly ProviderEvalSetupStep[];
  expectedLedgerEntryCount: number;
  expectedPendingProposalAmountCents?: number;
}

const seedProposalMessage = "I almost bought a $20 paperback but decided to wait.";
const pendingTwentyDollarProposal: ProviderEvalStateSetup = {
  steps: [{ message: seedProposalMessage, expectedAction: "suggest_savings" }],
  expectedLedgerEntryCount: 0,
  expectedPendingProposalAmountCents: 2_000
};

/** Synthetic preludes seed state implied by the frozen transcript context. */
export const providerEvalStateSetups: Readonly<Record<string, ProviderEvalStateSetup>> = {
  P31: pendingTwentyDollarProposal,
  P32: pendingTwentyDollarProposal,
  P33: pendingTwentyDollarProposal,
  P34: pendingTwentyDollarProposal,
  P35: pendingTwentyDollarProposal,
  P49: {
    steps: [{
      message: "I no longer go to the cafe and don't want to use the old $15 estimate.",
      expectedAction: "ask_follow_up"
    }],
    expectedLedgerEntryCount: 0
  },
  P50: {
    steps: [
      { message: seedProposalMessage, expectedAction: "suggest_savings" },
      { message: "Yes", expectedAction: "create_ledger_entry" }
    ],
    expectedLedgerEntryCount: 1
  }
};

export async function applyProviderEvalStateSetup(input: {
  caseId: string;
  agent: VictoriaAgent;
  tools: Pick<MockVictoriaTools, "listSavingsEntries">;
  userId: string;
  conversationId: string;
}): Promise<readonly AgentResponse[]> {
  const setup = providerEvalStateSetups[input.caseId];
  if (!setup) return [];

  const responses: AgentResponse[] = [];
  for (const step of setup.steps) {
    const request: AgentRequest = {
      userId: input.userId,
      conversationId: input.conversationId,
      message: step.message
    };
    const response = await input.agent.respond(request);
    if (response.decision.action !== step.expectedAction) {
      throw new Error(`${input.caseId} setup expected ${step.expectedAction}, received ${response.decision.action}.`);
    }
    responses.push(response);
  }

  const entries = await input.tools.listSavingsEntries(input.userId);
  if (entries.length !== setup.expectedLedgerEntryCount) {
    throw new Error(`${input.caseId} setup expected ${setup.expectedLedgerEntryCount} ledger entries, received ${entries.length}.`);
  }

  if (setup.expectedPendingProposalAmountCents !== undefined) {
    const last = responses.at(-1);
    if (last?.decision.proposal?.status !== "pending" ||
        last.decision.suggestion?.amountCents !== setup.expectedPendingProposalAmountCents ||
        last.decision.toolCall?.requiresApproval !== true) {
      throw new Error(`${input.caseId} setup did not leave the expected proposal pending approval.`);
    }
  }

  return responses;
}
