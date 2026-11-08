export interface UserApiRequestOptions {
  readonly method?: "GET" | "POST" | "PATCH";
  readonly body?: unknown;
}

export class UserApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super("The requested service is unavailable.");
    this.name = "UserApiError";
  }
}

/** Sends an authenticated request to Victoria's same-origin, user-scoped API. */
export async function requestUserApi<T>(
  accessToken: string,
  path: string,
  options: UserApiRequestOptions = {},
  fetcher: typeof fetch = fetch
): Promise<T> {
  if (!accessToken.trim()) throw new Error("A signed-in session is required.");
  if (!path.startsWith("/api/")) throw new Error("Only same-origin Victoria API paths are allowed.");
  const headers = new Headers({ authorization: `Bearer ${accessToken}` });
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body !== undefined) headers.set("content-type", "application/json");
  const response = await fetcher(path, {
    method: options.method ?? "GET",
    headers,
    ...(body === undefined ? {} : { body }),
    cache: "no-store",
    redirect: "error"
  });
  let payload: unknown;
  try { payload = await response.json(); } catch { payload = undefined; }
  if (!response.ok) {
    const code = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "request_failed";
    throw new UserApiError(response.status, code);
  }
  return payload as T;
}
