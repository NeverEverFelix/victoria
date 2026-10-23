import { getPersistentPlaidRuntime } from "../../../../src/app/http/create-persistent-plaid-runtime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const handler = getPersistentPlaidRuntime()?.consentHandler;
  if (!handler) return unavailable();
  return handler(request);
}

export const GET = handle;
export const POST = handle;

function unavailable(): Response {
  return new Response(JSON.stringify({ error: "plaid_runtime_not_configured" }), {
    status: 503, headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
  });
}
