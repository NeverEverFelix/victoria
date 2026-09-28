export type AppEnv = "local" | "test" | "staging" | "production";
export type PlaidEnv = "sandbox" | "development" | "production";
export type MoneyMovementMode = "mock_ledger" | "real_transfer";

export interface VictoriaEnv {
  appEnv: AppEnv;
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string;
  openAiApiKey: string;
  openAiModel: string;
  plaidClientId: string;
  plaidSecret: string;
  plaidEnv: PlaidEnv;
  moneyMovementMode: MoneyMovementMode;
  authSecret: string;
  isProduction: boolean;
  isTest: boolean;
  usesRealMoneyMovement: boolean;
}

export type EnvSource = Record<string, string | undefined>;

export function parseVictoriaEnv(source: EnvSource): VictoriaEnv {
  const appEnv = parseAppEnv(source.APP_ENV);
  const nodeEnv = parseNodeEnv(source.NODE_ENV);
  const moneyMovementMode = parseMoneyMovementMode(source.MONEY_MOVEMENT_MODE);
  const plaidEnv = parsePlaidEnv(source.PLAID_ENV);
  const databaseUrl = requireEnv(source, "DATABASE_URL");
  const openAiApiKey = requireEnv(source, "OPENAI_API_KEY");
  const openAiModel = requireEnv(source, "OPENAI_MODEL");
  const plaidClientId = requireEnv(source, "PLAID_CLIENT_ID");
  const plaidSecret = requireEnv(source, "PLAID_SECRET");
  const authSecret = requireEnv(source, "AUTH_SECRET");

  assertNodeEnvMatchesAppEnv(appEnv, nodeEnv);
  assertDatabaseUrlIsAllowed(appEnv, databaseUrl);
  assertAuthSecretIsAllowed(appEnv, authSecret);
  assertMoneyMovementIsAllowed(appEnv, moneyMovementMode);
  assertPlaidEnvIsAllowed(appEnv, plaidEnv);
  assertRealMovementUsesProductionPlaid(moneyMovementMode, plaidEnv);
  assertProviderCredentialsAreAllowed(appEnv, openAiApiKey, plaidClientId, plaidSecret);

  return {
    appEnv,
    nodeEnv,
    databaseUrl,
    openAiApiKey,
    openAiModel,
    plaidClientId,
    plaidSecret,
    plaidEnv,
    moneyMovementMode,
    authSecret,
    isProduction: appEnv === "production",
    isTest: appEnv === "test" || nodeEnv === "test",
    usesRealMoneyMovement: moneyMovementMode === "real_transfer"
  };
}

function parseAppEnv(value: string | undefined): AppEnv {
  if (value === "local" || value === "test" || value === "staging" || value === "production") {
    return value;
  }

  throw new Error("APP_ENV must be one of: local, test, staging, production.");
}

function parseNodeEnv(value: string | undefined): VictoriaEnv["nodeEnv"] {
  if (value === "development" || value === "test" || value === "production") {
    return value;
  }

  throw new Error("NODE_ENV must be one of: development, test, production.");
}

function parsePlaidEnv(value: string | undefined): PlaidEnv {
  if (value === "sandbox" || value === "development" || value === "production") {
    return value;
  }

  throw new Error("PLAID_ENV must be one of: sandbox, development, production.");
}

function parseMoneyMovementMode(value: string | undefined): MoneyMovementMode {
  if (value === "mock_ledger" || value === "real_transfer") {
    return value;
  }

  throw new Error("MONEY_MOVEMENT_MODE must be one of: mock_ledger, real_transfer.");
}

function requireEnv(source: EnvSource, key: string): string {
  const value = source[key]?.trim();

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function assertNodeEnvMatchesAppEnv(appEnv: AppEnv, nodeEnv: VictoriaEnv["nodeEnv"]): void {
  if (appEnv === "production" && nodeEnv !== "production") {
    throw new Error("APP_ENV=production requires NODE_ENV=production.");
  }

  if (appEnv === "test" && nodeEnv !== "test") {
    throw new Error("APP_ENV=test requires NODE_ENV=test.");
  }

  if (appEnv === "local" && nodeEnv !== "development") {
    throw new Error("APP_ENV=local requires NODE_ENV=development.");
  }

  if (appEnv === "staging" && nodeEnv !== "production") {
    throw new Error("APP_ENV=staging requires NODE_ENV=production.");
  }
}

function assertDatabaseUrlIsAllowed(appEnv: AppEnv, databaseUrl: string): void {
  const parsedUrl = parseDatabaseUrl(databaseUrl);

  if (!parsedUrl) {
    throw new Error("DATABASE_URL must be a valid URL.");
  }

  if (parsedUrl.protocol !== "postgresql" && parsedUrl.protocol !== "postgres") {
    throw new Error("DATABASE_URL must use the postgresql:// or postgres:// protocol.");
  }

  const localHosts = ["localhost", "127.0.0.1", "0.0.0.0"];

  if (appEnv === "production" && localHosts.includes(parsedUrl.hostname)) {
    throw new Error("Production DATABASE_URL must not point to localhost.");
  }

  const databaseName = parsedUrl.pathname.toLowerCase();

  const forbiddenDatabaseNamesByEnv: Record<AppEnv, string[]> = {
    local: ["victoria_test", "victoria_staging", "victoria_prod"],
    test: ["victoria_local", "victoria_staging", "victoria_prod"],
    staging: ["victoria_local", "victoria_test", "victoria_prod"],
    production: ["victoria_local", "victoria_test", "victoria_staging"]
  };

  const forbiddenDatabaseName = forbiddenDatabaseNamesByEnv[appEnv].find((candidate) =>
    databaseName.includes(candidate)
  );

  if (forbiddenDatabaseName) {
    const forbiddenEnvName = forbiddenDatabaseName.replace("victoria_", "").replace("prod", "production");
    throw new Error(`${appEnv} DATABASE_URL must not use the ${forbiddenEnvName} database name.`);
  }

  if (
    appEnv === "production" &&
    (databaseUrl.toLowerCase().includes("example.") ||
      databaseUrl.toLowerCase().includes(":password@"))
  ) {
    throw new Error("Production DATABASE_URL must not use example hosts or placeholder passwords.");
  }
}

function assertAuthSecretIsAllowed(appEnv: AppEnv, authSecret: string): void {
  if (appEnv === "production" && authSecret.length < 32) {
    throw new Error("Production AUTH_SECRET must be at least 32 characters.");
  }
}

function assertProviderCredentialsAreAllowed(
  appEnv: AppEnv,
  openAiApiKey: string,
  plaidClientId: string,
  plaidSecret: string
): void {
  if (appEnv !== "production") {
    return;
  }

  const providerValues = [openAiApiKey, plaidClientId, plaidSecret];
  const hasPlaceholderValue = providerValues.some((value) => {
    const normalizedValue = value.toLowerCase();

    return (
      normalizedValue.startsWith("test-") ||
      normalizedValue.startsWith("local-") ||
      normalizedValue.includes("example") ||
      normalizedValue.includes("placeholder") ||
      normalizedValue.includes("replace") ||
      normalizedValue.includes("changeme") ||
      normalizedValue.includes("change-me")
    );
  });

  if (hasPlaceholderValue) {
    throw new Error("Production provider credentials must not use local or test placeholder values.");
  }
}

function parseDatabaseUrl(
  databaseUrl: string
): { protocol: string; hostname: string; pathname: string } | null {
  const match = databaseUrl.match(/^([a-z][a-z0-9+.-]*):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?(\/[^?]*)/i);

  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  return {
    protocol: match[1].toLowerCase(),
    hostname: match[2].toLowerCase(),
    pathname: match[3]
  };
}

function assertMoneyMovementIsAllowed(
  _appEnv: AppEnv,
  moneyMovementMode: MoneyMovementMode
): void {
  if (moneyMovementMode === "real_transfer") {
    throw new Error("Real money movement is not available in the Victoria MVP.");
  }
}

function assertPlaidEnvIsAllowed(appEnv: AppEnv, plaidEnv: PlaidEnv): void {
  if (appEnv !== "production" && plaidEnv === "production") {
    throw new Error("Production Plaid credentials are only allowed in production.");
  }
}

function assertRealMovementUsesProductionPlaid(
  moneyMovementMode: MoneyMovementMode,
  plaidEnv: PlaidEnv
): void {
  if (moneyMovementMode === "real_transfer" && plaidEnv !== "production") {
    throw new Error("Real money movement requires PLAID_ENV=production.");
  }
}
