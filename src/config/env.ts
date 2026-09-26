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
  const plaidClientId = requireEnv(source, "PLAID_CLIENT_ID");
  const plaidSecret = requireEnv(source, "PLAID_SECRET");
  const authSecret = requireEnv(source, "AUTH_SECRET");

  assertNodeEnvMatchesAppEnv(appEnv, nodeEnv);
  assertDatabaseUrlIsAllowed(appEnv, databaseUrl);
  assertAuthSecretIsAllowed(appEnv, authSecret);
  assertMoneyMovementIsAllowed(appEnv, moneyMovementMode);
  assertPlaidEnvIsAllowed(appEnv, plaidEnv);
  assertRealMovementUsesProductionPlaid(moneyMovementMode, plaidEnv);

  return {
    appEnv,
    nodeEnv,
    databaseUrl,
    openAiApiKey,
    openAiModel: source.OPENAI_MODEL ?? "gpt-4.1-mini",
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
}

function assertDatabaseUrlIsAllowed(appEnv: AppEnv, databaseUrl: string): void {
  if (appEnv !== "production") {
    return;
  }

  const parsedUrl = parseDatabaseUrl(databaseUrl);

  if (!parsedUrl) {
    throw new Error("DATABASE_URL must be a valid URL.");
  }

  if (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1") {
    throw new Error("Production DATABASE_URL must not point to localhost.");
  }

  const databaseName = parsedUrl.pathname.toLowerCase();

  if (databaseName.includes("victoria_local") || databaseName.includes("victoria_test")) {
    throw new Error("Production DATABASE_URL must not use a local or test database name.");
  }
}

function assertAuthSecretIsAllowed(appEnv: AppEnv, authSecret: string): void {
  if (appEnv === "production" && authSecret.length < 32) {
    throw new Error("Production AUTH_SECRET must be at least 32 characters.");
  }
}

function parseDatabaseUrl(databaseUrl: string): { hostname: string; pathname: string } | null {
  const match = databaseUrl.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?(\/[^?]*)/i);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    hostname: match[1].toLowerCase(),
    pathname: match[2]
  };
}

function assertMoneyMovementIsAllowed(
  appEnv: AppEnv,
  moneyMovementMode: MoneyMovementMode
): void {
  if (appEnv !== "production" && moneyMovementMode === "real_transfer") {
    throw new Error("Real money movement is only allowed in production.");
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
