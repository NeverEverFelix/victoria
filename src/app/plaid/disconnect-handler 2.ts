import type { PlaidDataLifecycleService } from "./plaid-data-lifecycle.js";

export function createPlaidDisconnectHandler(deps: {
  authenticate(request: Request): Promise<{ readonly userId: string } | null>;
  lifecycle: Pick<PlaidDataLifecycleService, "disconnect">;
}) {
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
    const respond = (status: number, body: unknown, extraHeaders: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status, headers: { ...headers, ...extraHeaders } });
    if (request.method !== "POST") return respond(405, { error: "method_not_allowed" }, { Allow: "POST" });
    let user: { readonly userId: string } | null;
    try { user = await deps.authenticate(request); } catch { return respond(503, { error: "authentication_unavailable" }); }
    if (!user?.userId?.trim()) return respond(401, { error: "unauthorized" });
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") return respond(415, { error: "unsupported_media_type" });
    const declaredLength = request.headers.get("content-length");
    if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 4096)) {
      return respond(Number(declaredLength) > 4096 ? 413 : 400, { error: "invalid_request" });
    }
    let body: unknown;
    try { body = await readJsonBody(request, 4096); }
    catch (error) { return respond(error instanceof RequestBodyTooLargeError ? 413 : 400, { error: "invalid_request" }); }
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

class RequestBodyTooLargeError extends Error {}

async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.body) throw new Error("Request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        try { await reader.cancel(); } catch { /* reject oversized request even if cancellation fails */ }
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
