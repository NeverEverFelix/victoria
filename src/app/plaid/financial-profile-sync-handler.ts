import type { FinancialProfileSyncService } from "./financial-profile-sync.js";

export function createFinancialProfileSyncHandler(deps: {
  authenticate(request: Request): Promise<{ readonly userId: string } | null>;
  sync: Pick<FinancialProfileSyncService, "syncUser">;
}) {
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
    const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (request.method !== "POST") return respond(405, { error: "method_not_allowed" });
    let user: { readonly userId: string } | null;
    try { user = await deps.authenticate(request); } catch { return respond(503, { error: "authentication_unavailable" }); }
    if (!user?.userId?.trim()) return respond(401, { error: "unauthorized" });
    try {
      const result = await deps.sync.syncUser(user.userId);
      return respond(200, {
        refreshed: true,
        factCount: result.profile.facts.length,
        syncedPages: result.syncedPages,
        metadataAvailability: result.profile.metadataAvailability
      });
    } catch {
      // Provider and database errors are intentionally not exposed to callers.
      return respond(503, { error: "profile_sync_unavailable" });
    }
  };
}
