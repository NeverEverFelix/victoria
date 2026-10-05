import type { UserHabit } from "../../../src/agent/types.js";

export interface MultiAgentReadinessScenario {
  id: string;
  userMessage: string;
  habits?: UserHabit[];
  expectedClassification:
    | "avoided_spend"
    | "unclear"
    | "regretful_spend"
    | "real_money_movement_request";
  expectedSingleAgentAction: "suggest_savings" | "ask_follow_up" | "reflect" | "refuse";
  expectedSpecialistAssessment: "suggest" | "ask" | "reflect";
  expectedAmountCents?: number;
}

/** Deterministic smoke/evaluation set. It checks contract parity, not model quality. */
export const multiAgentReadinessScenarios: readonly MultiAgentReadinessScenario[] = [
  {
    id: "explicit-amount",
    userMessage: "I almost bought a $90 jacket but decided to wait.",
    expectedClassification: "avoided_spend",
    expectedSingleAgentAction: "suggest_savings",
    expectedSpecialistAssessment: "suggest",
    expectedAmountCents: 9000
  },
  {
    id: "vague-savings",
    userMessage: "I saved money today.",
    expectedClassification: "unclear",
    expectedSingleAgentAction: "ask_follow_up",
    expectedSpecialistAssessment: "ask"
  },
  {
    id: "known-merchant-estimate",
    userMessage: "I made coffee at home instead of going to Blue Bottle.",
    habits: [{
      id: "habit_blue_bottle", userId: "eval_user", merchantName: "Blue Bottle",
      typicalAmountCents: 675, currency: "USD", confidence: 0.9
    }],
    expectedClassification: "avoided_spend",
    expectedSingleAgentAction: "suggest_savings",
    expectedSpecialistAssessment: "suggest",
    expectedAmountCents: 675
  },
  {
    id: "unknown-amount",
    userMessage: "I cooked instead of ordering takeout.",
    expectedClassification: "avoided_spend",
    expectedSingleAgentAction: "ask_follow_up",
    expectedSpecialistAssessment: "ask"
  },
  {
    id: "regretful-spend",
    userMessage: "I regret ordering takeout last night.",
    expectedClassification: "regretful_spend",
    expectedSingleAgentAction: "reflect",
    expectedSpecialistAssessment: "reflect"
  },
  {
    id: "real-transfer-request",
    userMessage: "Move $25 from checking to savings.",
    expectedClassification: "real_money_movement_request",
    expectedSingleAgentAction: "refuse",
    expectedSpecialistAssessment: "reflect"
  },
  {
    id: "multiple-amounts",
    userMessage: "I almost bought a $90 jacket, but its price might have been $85.",
    expectedClassification: "avoided_spend",
    expectedSingleAgentAction: "ask_follow_up",
    expectedSpecialistAssessment: "ask"
  }
];
