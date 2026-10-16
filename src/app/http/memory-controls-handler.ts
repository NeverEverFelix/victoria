import { InvalidMemoryCorrectionError, ManagedProfileMemoryError, MemoryNotFoundError, type MemoryOrchestrator } from "../../agent/memory/memory-orchestrator.js";

export interface MemoryControlsHandlerDependencies {
  authenticate(request: Request): Promise<{ readonly userId: string } | null>;
  memory: MemoryOrchestrator;
}

const JSON_HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
const MAX_CORRECTION_BODY_BYTES = 4_096;

/** Authenticated, headless controls for reviewing, correcting, and forgetting learned memory. */
export function createMemoryControlsCollectionHandler(dependencies: MemoryControlsHandlerDependencies) {
  return async function list(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.method !== "DELETE") return respond(405, { error: "method_not_allowed" });
    const user = await authenticate(dependencies, request);
    if (user instanceof Response) return user;
    try {
      if (request.method === "DELETE") {
        const deletedCount = await dependencies.memory.forgetAllConversationalMemories(user.userId);
        return respond(200, { forgotten: true, deletedCount,
          notice: "Saved conversational memories removed. Recent messages may remain in this conversation until their 30-minute context expires. Connected financial profile data is managed separately." });
      }
      const memories = await dependencies.memory.listConversationalMemories(user.userId);
      return respond(200, { paused: await dependencies.memory.isMemoryPaused(user.userId), memories: memories.map(({ id, category, key, value, evidence, createdAt, sourceType }) =>
        ({ id, category, key, value, evidence, createdAt, sourceType: sourceType ?? "user_statement" })) });
    } catch {
      return respond(503, { error: "memory_controls_unavailable" });
    }
  };
}

/** Read and update the authenticated user's conversational memory pause setting. */
export function createMemorySettingsHandler(dependencies: MemoryControlsHandlerDependencies) {
  return async function settings(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.method !== "PUT") return respond(405, { error: "method_not_allowed" });
    const user = await authenticate(dependencies, request);
    if (user instanceof Response) return user;
    try {
      if (request.method === "GET") return respond(200, { paused: await dependencies.memory.isMemoryPaused(user.userId) });
      if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
        return respond(415, { error: "unsupported_media_type" });
      }
      let body: unknown;
      try { body = JSON.parse(await readBoundedBody(request)); }
      catch (error) { return respond(error instanceof RequestTooLargeError ? 413 : 400,
        { error: error instanceof RequestTooLargeError ? "request_too_large" : error instanceof MissingBodyError ? "missing_body" : "invalid_json" }); }
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          Object.keys(body).length !== 1 || typeof (body as Record<string, unknown>).paused !== "boolean") {
        return respond(400, { error: "invalid_memory_settings" });
      }
      const paused = (body as { paused: boolean }).paused;
      await dependencies.memory.setMemoryPaused(user.userId, paused);
      return respond(200, { paused, notice: paused
        ? "Conversational memories are paused. Saved memories remain available in settings, and recent chat context still expires after 30 minutes."
        : "Conversational memory has resumed. Existing saved memories may be used again." });
    } catch { return respond(503, { error: "memory_controls_unavailable" }); }
  };
}

export function createMemoryControlHandler(dependencies: MemoryControlsHandlerDependencies) {
  return async function control(request: Request, memoryId: string): Promise<Response> {
    if (request.method !== "PUT" && request.method !== "DELETE") return respond(405, { error: "method_not_allowed" });
    const user = await authenticate(dependencies, request);
    if (user instanceof Response) return user;
    if (!memoryId.trim() || memoryId.length > 160) return respond(400, { error: "invalid_memory_id" });
    try {
      if (request.method === "DELETE") {
        await dependencies.memory.forgetMemory(user.userId, memoryId);
        return respond(200, { forgotten: true,
          notice: "Saved memory removed. Recent messages in this conversation may still contain the original until its 30-minute context expires." });
      }
      const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (mediaType !== "application/json") return respond(415, { error: "unsupported_media_type" });
      let body: unknown;
      try { body = JSON.parse(await readBoundedBody(request)); }
      catch (error) { return respond(error instanceof RequestTooLargeError ? 413 : 400,
        { error: error instanceof RequestTooLargeError ? "request_too_large" : error instanceof MissingBodyError ? "missing_body" : "invalid_json" }); }
      if (!isCorrectionBody(body)) return respond(400, { error: "invalid_memory_correction" });
      const corrected = await dependencies.memory.correctMemory(user.userId, memoryId, body.value);
      return respond(200, { memory: corrected });
    } catch (error) {
      if (error instanceof MemoryNotFoundError) return respond(404, { error: "memory_not_found" });
      if (error instanceof ManagedProfileMemoryError) return respond(409, { error: "memory_managed_by_financial_profile" });
      if (error instanceof InvalidMemoryCorrectionError) return respond(400, { error: "invalid_memory_correction" });
      return respond(503, { error: "memory_controls_unavailable" });
    }
  };
}

async function readBoundedBody(request: Request): Promise<string> {
  if (!request.body) throw new MissingBodyError();
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_CORRECTION_BODY_BYTES) {
      await reader.cancel();
      throw new RequestTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  if (totalBytes === 0) throw new MissingBodyError();
  return text + decoder.decode();
}

async function authenticate(dependencies: MemoryControlsHandlerDependencies, request: Request): Promise<{ readonly userId: string } | Response> {
  let user: { readonly userId: string } | null;
  try { user = await dependencies.authenticate(request); } catch { return respond(503, { error: "authentication_unavailable" }); }
  if (!user?.userId?.trim()) return respond(401, { error: "unauthorized" });
  return user;
}

function isCorrectionBody(value: unknown): value is { readonly value: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1 && typeof body.value === "string" && body.value.trim().length > 0 && body.value.length <= 1000;
}

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

class RequestTooLargeError extends Error {}
class MissingBodyError extends Error {}
