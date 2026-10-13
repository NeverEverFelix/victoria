import type { VictoriaEnv } from "./env.js";

export interface VictoriaFeatureFlags {
  useMockAi: boolean;
  useProviderFinancialMoment: boolean;
  useProviderAgentTeam: boolean;
  useMockLedger: boolean;
  useSandboxBanking: boolean;
  allowRealTransfers: boolean;
  requireApprovalForSavingsLedger: boolean;
  requireApprovalForRealTransfers: boolean;
}

export function buildFeatureFlags(env: VictoriaEnv): VictoriaFeatureFlags {
  const useProviderAgentTeam = env.openAiAgentTeamEnabled && env.openAiModel !== "mock";
  const useProviderFinancialMoment = !useProviderAgentTeam && env.openAiFinancialMomentEnabled && env.openAiModel !== "mock";
  return {
    useMockAi: !useProviderFinancialMoment && !useProviderAgentTeam,
    useProviderFinancialMoment,
    useProviderAgentTeam,
    useMockLedger: env.moneyMovementMode === "mock_ledger",
    useSandboxBanking: env.plaidEnv !== "production",
    allowRealTransfers: false,
    requireApprovalForSavingsLedger: true,
    requireApprovalForRealTransfers: true
  };
}
