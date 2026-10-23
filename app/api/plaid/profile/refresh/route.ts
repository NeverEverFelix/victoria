import { getPersistentPlaidRuntime } from "../../../../../src/app/http/create-persistent-plaid-runtime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const handler = getPersistentPlaidRuntime()?.refreshFinancialProfile;
  return handler ? handler(request) : unavailable();
}

function unavailable(): Response {
  return new Response(JSON.stringify({ error: "plaid_runtime_not_configured" }), {
    status: 503, headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
  });
}
