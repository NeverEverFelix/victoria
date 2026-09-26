import type { VictoriaEnv } from "./env.js";

export interface VictoriaFeatureFlags {
  useMockAi: boolean;
  useMockLedger: boolean;
  useSandboxBanking: boolean;
  allowRealTransfers: boolean;
  requireApprovalForSavingsLedger: boolean;
  requireApprovalForRealTransfers: boolean;
}

export function buildFeatureFlags(env: VictoriaEnv): VictoriaFeatureFlags {
  return {
    useMockAi: env.openAiModel === "mock",
    useMockLedger: env.moneyMovementMode === "mock_ledger",
    useSandboxBanking: env.plaidEnv !== "production",
    allowRealTransfers: env.isProduction && env.moneyMovementMode === "real_transfer",
    requireApprovalForSavingsLedger: true,
    requireApprovalForRealTransfers: true
  };
}

