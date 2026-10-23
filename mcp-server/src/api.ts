/**
 * Backend API client + structured tool error helpers.
 */

export const DEFAULT_API_URL = "http://localhost:8081";

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: string
  ) {
    super(`API error: ${status} ${statusText} — ${body}`);
    this.name = "ApiError";
  }
}

export interface ApiDeps {
  apiUrl: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
}

/** Call the trusted local backend API. Throws ApiError on non-2xx. */
export async function callApi<T>(
  deps: ApiDeps,
  endpoint: string,
  params?: Record<string, unknown>
): Promise<T> {
  const url = new URL(`${deps.apiUrl}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  const doFetch = deps.fetchImpl ?? fetch;
  const res = await doFetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${deps.apiToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, res.statusText, errorText);
  }
  return res.json() as Promise<T>;
}

/** Serialize successful tool output as JSON text content. */
export function jsonResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Wrap a tool handler so failures return structured MCP errors (isError: true). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withErrorHandling(
  handler: (args: any) => Promise<any>
): (args: any) => Promise<any> {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = err instanceof ApiError ? err.status : undefined;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { error: message, ...(status !== undefined ? { status } : {}) },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  };
}

export interface CallToolResultLike {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
