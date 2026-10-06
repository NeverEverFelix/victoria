import type { VictoriaEnv } from "./env.js";

export interface VictoriaFeatureFlags {
  useMockAi: boolean;
  useProviderFinancialMoment: boolean;
  useMockLedger: boolean;
  useSandboxBanking: boolean;
  allowRealTransfers: boolean;
  requireApprovalForSavingsLedger: boolean;
  requireApprovalForRealTransfers: boolean;
}

export function buildFeatureFlags(env: VictoriaEnv): VictoriaFeatureFlags {
  const useProviderFinancialMoment = env.openAiFinancialMomentEnabled && env.openAiModel !== "mock";
  return {
    useMockAi: !useProviderFinancialMoment,
    useProviderFinancialMoment,
    useMockLedger: env.moneyMovementMode === "mock_ledger",
    useSandboxBanking: env.plaidEnv !== "production",
    allowRealTransfers: false,
    requireApprovalForSavingsLedger: true,
    requireApprovalForRealTransfers: true
  };
}
