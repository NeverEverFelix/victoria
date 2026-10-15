import type { PlaidDataLifecycleService } from "./plaid-data-lifecycle.js";

export function createPlaidDisconnectHandler(deps: {
  authenticate(request: Request): Promise<{ readonly userId: string } | null>;
  lifecycle: Pick<PlaidDataLifecycleService, "disconnect">;
}) {
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
    const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (request.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...headers, Allow: "POST" }
    });
    let user: { readonly userId: string } | null;
    try { user = await deps.authenticate(request); } catch { return respond(503, { error: "authentication_unavailable" }); }
    if (!user?.userId?.trim()) return respond(401, { error: "unauthorized" });
    let body: unknown;
    try { body = await request.json(); } catch { return respond(400, { error: "invalid_request" }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return respond(400, { error: "invalid_request" });
    const action = (body as Record<string, unknown>).action;
    const itemId = (body as Record<string, unknown>).itemId;
    if ((action !== "disconnect_item" && action !== "delete_all") ||
        (action === "disconnect_item" && (typeof itemId !== "string" || !itemId.trim() || itemId.length > 128)) ||
        (action === "delete_all" && itemId !== undefined)) return respond(400, { error: "invalid_request" });
    try {
      const result = await deps.lifecycle.disconnect(user.userId, action === "disconnect_item" ? itemId as string : undefined);
      return respond(result.pending > 0 ? 202 : 200, { disconnected: true, revoked: result.revoked, pendingRevocations: result.pending });
    } catch {
      return respond(503, { error: "plaid_disconnect_unavailable" });
    }
  };
}
