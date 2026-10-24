#!/usr/bin/env node

import { randomUUID, createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createServer as createNetServer } from "node:net";
import { stdin, stdout } from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const args = new Set(process.argv.slice(2));
const mockMode = args.has("--mock");
const realAiMode = !mockMode;
if ([...args].some((arg) => arg !== "--mock")) {
  console.error("Usage: npm run chat [-- --mock]");
  process.exit(1);
}

if (process.env.APP_ENV !== "local" || process.env.NODE_ENV !== "development") {
  console.error("Local chat requires APP_ENV=local and NODE_ENV=development in .env.local.");
  process.exit(1);
}

const secret = process.env.AUTH_SECRET?.trim();
if (!secret || Buffer.byteLength(secret, "utf8") < 32 || /(?:replace|example|placeholder|changeme)/i.test(secret)) {
  console.error("Set a private, random AUTH_SECRET of at least 32 characters in .env.local.");
  process.exit(1);
}

const configuredApiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
const configuredModel = process.env.OPENAI_MODEL?.trim() ?? "";
if (realAiMode && (!configuredApiKey || /(?:local-openai|replace|example|placeholder|changeme)/i.test(configuredApiKey))) {
  console.error("Real AI mode needs an OpenAI API key in .env.local. The key is not shown or saved by this command.");
  process.exit(1);
}
if (realAiMode && (!configuredModel || configuredModel === "mock")) {
  console.error("Real AI mode needs a non-mock OPENAI_MODEL in .env.local.");
  process.exit(1);
}

const port = Number.parseInt(process.env.VICTORIA_LOCAL_PORT ?? "3210", 10);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error("VICTORIA_LOCAL_PORT must be a valid port from 1024 to 65535.");
  process.exit(1);
}

const baseUrl = `http://127.0.0.1:${port}`;
const conversationId = () => `cli-${randomUUID()}`;
const sessionToken = issueLocalSession("victoria-cli-local", secret);
let activeConversationId = conversationId();
let server;
let stopping = false;
let terminal;

function issueLocalSession(userId, signingSecret) {
  const iat = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ sub: userId, aud: "victoria", iat, exp: iat + 12 * 60 * 60 })).toString("base64url");
  const signature = createHmac("sha256", signingSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function stopServer() {
  if (stopping) return;
  stopping = true;
  if (server && server.exitCode === null) server.kill("SIGTERM");
}

process.once("SIGINT", () => {
  console.log("\nClosing Victoria CLI…");
  terminal?.close();
  stopServer();
});
process.once("SIGTERM", stopServer);

async function ensurePortAvailable() {
  const probe = createNetServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
}

async function waitUntilReady(child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local server exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.status < 500) return;
    } catch {
      // Keep waiting while Next starts and compiles the local app.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Victoria did not start at ${baseUrl} within 60 seconds.`);
}

async function sendMessage(message) {
  const response = await fetch(`${baseUrl}/api/victoria/${activeConversationId}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(60_000)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const error = typeof result?.error === "string" ? result.error : `HTTP ${response.status}`;
    throw new Error(`Victoria request failed: ${error}. Check the server output and local database.`);
  }
  if (typeof result?.message !== "string") throw new Error("Victoria returned an invalid response.");
  return result.message;
}

try {
  await ensurePortAvailable();
  const childEnv = {
    ...process.env,
    APP_ENV: "local",
    NODE_ENV: "development",
    OPENAI_API_KEY: realAiMode ? configuredApiKey : "local-openai-key",
    OPENAI_MODEL: realAiMode ? configuredModel : "mock",
    OPENAI_FINANCIAL_MOMENT_ENABLED: "false",
    OPENAI_AGENT_TEAM_ENABLED: realAiMode ? "true" : "false",
    OPENAI_MEMORY_EXTRACTION_ENABLED: realAiMode ? "true" : "false",
    OPENAI_PERSONALIZED_REPLIES_ENABLED: realAiMode ? "true" : "false",
    OPENAI_EPISODIC_SUMMARIES_ENABLED: "false",
    PORT: String(port)
  };
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: childEnv,
    stdio: ["ignore", "inherit", "inherit"]
  });
  server.once("error", (error) => {
    console.error(`Could not start the local server: ${error.message}`);
    process.exitCode = 1;
  });

  console.log(`Starting Victoria locally at ${baseUrl}…`);
  await waitUntilReady(server);
  console.log(realAiMode
    ? `Victoria is ready with the OpenAI ${configuredModel} agent team. Eligible turns can make multiple API calls and incur charges; no real money movement is enabled.`
    : "Victoria is ready. Chat below; no model API calls or real money movement are enabled.");
  console.log("Commands: /new starts another conversation, /help shows commands, /quit exits.\n");

  terminal = createInterface({ input: stdin, output: stdout, terminal: Boolean(stdin.isTTY) });
  stdout.write("You: ");
  try {
    for await (const line of terminal) {
      const input = line.trim();
      if (!input) {
        stdout.write("You: ");
        continue;
      }
      if (input === "/quit" || input === "/exit") break;
      if (input === "/help") {
        console.log("Commands: /new starts another conversation, /help shows commands, /quit exits.");
        stdout.write("You: ");
        continue;
      }
      if (input === "/new") {
        activeConversationId = conversationId();
        console.log("Started a new conversation. Durable local memories remain available.\n");
        stdout.write("You: ");
        continue;
      }
      try {
        console.log(`Victoria: ${await sendMessage(input)}\n`);
      } catch (error) {
        console.error(`${error instanceof Error ? error.message : "Request failed."}\n`);
      }
      stdout.write("You: ");
    }
  } finally {
    terminal.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to start Victoria locally.");
  process.exitCode = 1;
} finally {
  stopServer();
}
