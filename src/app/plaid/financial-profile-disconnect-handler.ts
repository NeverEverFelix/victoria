import type { FinancialProfileLifecycleService } from "./financial-profile-lifecycle.js";

export function createFinancialProfileDisconnectHandler(deps: {
  authenticate(request: Request): Promise<{ readonly userId: string } | null>;
  lifecycle: Pick<FinancialProfileLifecycleService, "disconnectUser">;
}) {
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
    const respond = (status: number, body: unknown, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
    if (request.method !== "POST") return respond(405, { error: "method_not_allowed" }, { Allow: "POST" });
    let user: { readonly userId: string } | null;
    try { user = await deps.authenticate(request); } catch { return respond(503, { error: "authentication_unavailable" }); }
    if (!user?.userId?.trim()) return respond(401, { error: "unauthorized" });
    try {
      const result = await deps.lifecycle.disconnectUser(user.userId);
      return respond(result.disconnected ? 200 : 202, { disconnected: result.disconnected,
        providerRemovalPending: result.pendingProviderRemovals > 0 });
    } catch {
      return respond(503, { error: "profile_disconnect_unavailable" });
    }
  };
}
