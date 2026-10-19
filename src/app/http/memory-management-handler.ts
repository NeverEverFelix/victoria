import { InvalidMemoryCorrectionError, MemoryNotFoundError } from "../../agent/memory/memory-orchestrator.js";
import type { ConversationalMemory, ConversationalMemoryPage } from "../../agent/memory/types.js";

export interface MemoryManagementHandlerDependencies {
  authenticate(request: Request): Promise<{ readonly userId: string } | null>;
  memory?: {
    listConversationalMemories(userId: string, page?: ConversationalMemoryPage): Promise<readonly ConversationalMemory[]>;
    correctMemory(userId: string, memoryId: string, correctedValue: string): Promise<ConversationalMemory>;
    forgetMemory(userId: string, memoryId: string): Promise<void>;
  };
  memoryForUser?(userId: string): NonNullable<MemoryManagementHandlerDependencies["memory"]>;
}

export interface MemoryItemRouteContext {
  readonly memoryId: string;
}

const MAX_BODY_BYTES = 4_000;
const MEMORY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Authenticated, server-only controls for inspecting and managing remembered facts. */
export function createMemoryManagementHandlers(dependencies: MemoryManagementHandlerDependencies) {
  const collection = async (request: Request): Promise<Response> => {
    const auth = await authenticate(dependencies.authenticate, request);
    if (!auth.ok) return auth.response;
    const headers = responseHeaders();
    if (request.method !== "GET" && request.method !== "PATCH") {
      return json(405, { error: "method_not_allowed" }, { ...headers, Allow: "GET, PATCH" });
    }

    if (request.method === "GET") {
      try {
        const page = parseMemoryPage(request.url);
        if (!page.ok) return json(400, { error: "invalid_memory_page" }, headers);
        const memories = await memoryForUser(dependencies, auth.userId).listConversationalMemories(auth.userId, page.value);
        const nextCursor = memories.length === page.value.limit && memories.length > 0
          ? encodeCursor(memories[memories.length - 1]!)
          : null;
        return json(200, { memories: memories.map(toPublicMemory), nextCursor }, headers);
      } catch {
        return json(503, { error: "memory_unavailable" }, headers);
      }
    }

    const body = await readCorrectionBody(request);
    if (!body.ok) return body.response;
    if (!isCorrectionBody(body.value)) {
      return json(400, { error: "invalid_memory_correction" }, headers);
    }
    try {
      const corrected = await memoryForUser(dependencies, auth.userId).correctMemory(auth.userId, body.value.memoryId, body.value.value);
      return json(200, { memory: toPublicMemory(corrected) }, headers);
    } catch (error) {
      if (error instanceof MemoryNotFoundError) return json(404, { error: "memory_not_found" }, headers);
      if (error instanceof InvalidMemoryCorrectionError) return json(400, { error: "invalid_memory_correction" }, headers);
      return json(503, { error: "memory_unavailable" }, headers);
    }
  };

  const forget = async (request: Request, context: MemoryItemRouteContext): Promise<Response> => {
    const auth = await authenticate(dependencies.authenticate, request);
    if (!auth.ok) return auth.response;
    const headers = responseHeaders();
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, { ...headers, Allow: "POST" });
    if (!MEMORY_ID_PATTERN.test(context.memoryId)) return json(400, { error: "invalid_memory_id" }, headers);
    try {
      await memoryForUser(dependencies, auth.userId).forgetMemory(auth.userId, context.memoryId);
      return json(200, {
        status: "forgotten",
        memoryId: context.memoryId,
        detail: "Victoria will no longer use this memory in future replies. Its historical record is retained."
      }, headers);
    } catch (error) {
      if (error instanceof MemoryNotFoundError) return json(404, { error: "memory_not_found" }, headers);
      return json(503, { error: "memory_unavailable" }, headers);
    }
  };

  return Object.freeze({ collection, forget });
}

function memoryForUser(dependencies: MemoryManagementHandlerDependencies, userId: string) {
  const provider = dependencies.memoryForUser?.(userId) ?? dependencies.memory;
  if (!provider) throw new Error("Memory provider is unavailable.");
  return provider;
}

async function authenticate(
  authenticator: MemoryManagementHandlerDependencies["authenticate"],
  request: Request
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  try {
    const user = await authenticator(request);
    return user?.userId.trim()
      ? { ok: true, userId: user.userId.trim() }
      : { ok: false, response: json(401, { error: "unauthorized" }, responseHeaders()) };
  } catch {
    return { ok: false, response: json(503, { error: "authentication_unavailable" }, responseHeaders()) };
  }
}

async function readCorrectionBody(request: Request): Promise<
  | { ok: true; value: unknown }
  | { ok: false; response: Response }
> {
  const headers = responseHeaders();
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return { ok: false, response: json(415, { error: "unsupported_media_type" }, headers) };
  }
  try {
    const text = await readBoundedBody(request, MAX_BODY_BYTES);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    return {
      ok: false,
      response: json(error instanceof RequestTooLargeError ? 413 : 400,
        { error: error instanceof RequestTooLargeError ? "request_too_large" : "invalid_json" }, headers)
    };
  }
}

async function readBoundedBody(request: Request, maximumBytes: number): Promise<string> {
  if (!request.body) throw new Error("Request body is missing.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new RequestTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function isCorrectionBody(value: unknown): value is { memoryId: string; value: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 2 && typeof body.memoryId === "string" &&
    MEMORY_ID_PATTERN.test(body.memoryId) && typeof body.value === "string" &&
    body.value.trim().length > 0 && body.value.length <= 1_000;
}

function parseMemoryPage(urlValue: string):
  | { ok: true; value: ConversationalMemoryPage }
  | { ok: false } {
  const url = new URL(urlValue);
  const allowed = new Set(["limit", "cursor"]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) return { ok: false };
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 25 : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return { ok: false };
  const rawCursor = url.searchParams.get("cursor");
  if (rawCursor === null) return { ok: true, value: { limit } };
  if (rawCursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(rawCursor)) return { ok: false };
  try {
    const decoded = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8")) as Record<string, unknown>;
    if (!decoded || typeof decoded !== "object" || Object.keys(decoded).length !== 2 ||
        typeof decoded.createdAt !== "string" || !Number.isFinite(Date.parse(decoded.createdAt)) ||
        typeof decoded.id !== "string" || !MEMORY_ID_PATTERN.test(decoded.id)) return { ok: false };
    return { ok: true, value: { limit, before: { createdAt: decoded.createdAt, id: decoded.id } } };
  } catch {
    return { ok: false };
  }
}

function encodeCursor(memory: ConversationalMemory): string {
  return Buffer.from(JSON.stringify({ createdAt: memory.createdAt, id: memory.id })).toString("base64url");
}

function toPublicMemory(memory: ConversationalMemory) {
  return Object.freeze({
    id: memory.id,
    category: memory.category,
    key: memory.key,
    value: memory.value,
    evidence: memory.evidence,
    confidence: memory.confidence,
    createdAt: memory.createdAt,
    sourceType: memory.sourceType ?? "user_statement",
    ...(memory.observedFrom ? { observedFrom: memory.observedFrom } : {}),
    ...(memory.observedThrough ? { observedThrough: memory.observedThrough } : {}),
    ...(memory.sourceRecordCount ? { sourceRecordCount: memory.sourceRecordCount } : {})
  });
}

function responseHeaders(): Record<string, string> {
  return { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
}

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

class RequestTooLargeError extends Error {}
