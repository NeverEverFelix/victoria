import { z } from "zod";

const positiveCents = z.number().int().positive().safe();

export const ClassifiedMessageSchema = z.object({
  type: z.enum([
    "avoided_spend",
    "regretful_spend",
    "unclear",
    "goal_allocation",
    "savings_progress",
    "proposal_revision",
    "real_money_movement_request"
  ]),
  confidence: z.number().min(0).max(1),
  merchantName: z.string().optional(),
  amountCents: positiveCents.optional(),
  goalName: z.string().optional(),
  revisionReason: z.string().optional(),
  amountIssue: z.enum([
    "invalid_value",
    "multiple_amounts",
    "invalid_precision",
    "unsupported_currency"
  ]).optional(),
  summary: z.string(),
  needsClarification: z.boolean()
}).strict();

export const FinancialMomentInputSchema = z.object({
  schemaVersion: z.literal(1),
  userMessage: z.string()
}).strict();

export const FinancialMomentOutputSchema = z.object({
  schemaVersion: z.literal(1),
  classification: ClassifiedMessageSchema
}).strict();

export const SavingsReasoningFactsSchema = z.object({
  eventType: z.literal("avoided_spend"),
  merchantName: z.string().optional(),
  userProvidedAmountCents: positiveCents.optional()
}).strict();

const SavingsSuggestionSchema = z.object({
  id: z.string(),
  amountCents: positiveCents,
  currency: z.literal("USD"),
  reason: z.string().refine((value) => value.trim().length > 0),
  source: z.enum(["merchant_history", "user_provided", "manual_estimate"]),
  movementMode: z.literal("mock_ledger")
}).strict();

export const SavingsRecommendationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("no_suggestion") }).strict(),
  z.object({ kind: z.literal("suggest"), ...SavingsSuggestionSchema.shape }).strict()
]);

export const SavingsReasoningInputSchema = z.object({
  schemaVersion: z.literal(1),
  facts: SavingsReasoningFactsSchema
}).strict();

export const SavingsReasoningOutputSchema = z.object({
  schemaVersion: z.literal(1),
  recommendation: SavingsRecommendationSchema
}).strict();

export const CompanionVoiceOutcomeSchema = z.object({
  action: z.enum([
    "ask_follow_up", "suggest_savings", "create_ledger_entry", "update_goal",
    "record_goal_allocation", "summarize_progress", "reflect", "refuse"
  ]),
  financialEventType: z.enum([
    "avoided_spend", "regretful_spend", "goal_allocation", "proposal_revision",
    "pattern_reflection", "general_finance", "savings_progress",
    "real_money_movement_request", "unclear"
  ]),
  amountCents: positiveCents.optional(),
  amountSource: z.enum(["merchant_history", "user_provided", "manual_estimate"]).optional(),
  movementMode: z.enum(["mock_ledger", "real_transfer"]).optional(),
  proposalStatus: z.enum(["pending", "declined", "recorded"]).optional(),
  goalName: z.string().optional(),
  ledgerEntryRecorded: z.boolean()
}).strict();

export const CompanionVoiceInputSchema = z.object({
  schemaVersion: z.literal(1),
  outcome: CompanionVoiceOutcomeSchema,
  responseGoal: z.string()
}).strict();

export const CompanionVoiceOutputSchema = z.object({
  schemaVersion: z.literal(1),
  draft: z.string()
}).strict();

export const HANDOFF_SCHEMA_VERSION = 1 as const;

export type FinancialMomentInputPayload = z.infer<typeof FinancialMomentInputSchema>;
export type FinancialMomentOutput = z.infer<typeof FinancialMomentOutputSchema>;
export type SavingsReasoningFactsPayload = z.infer<typeof SavingsReasoningFactsSchema>;
export type SavingsReasoningOutput = z.infer<typeof SavingsReasoningOutputSchema>;
export type CompanionVoiceInputPayload = z.infer<typeof CompanionVoiceInputSchema>;
export type CompanionVoiceOutput = z.infer<typeof CompanionVoiceOutputSchema>;
