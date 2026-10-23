import { describe, expect, it, vi } from "vitest";
import { ApiError, callApi, jsonResult, withErrorHandling } from "../src/api.js";

const okResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("callApi", () => {
  it("fetches with Authorization header and parses JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ ok: true }));
    const deps = { apiUrl: "http://backend", apiToken: "tok", fetchImpl };
    await expect(callApi(deps, "/api/v1/steps", { date: "2026-10-22" })).resolves.toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://backend/api/v1/steps?date=2026-10-22");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("skips null/undefined params and empty token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({}));
    const deps = { apiUrl: "http://backend", apiToken: "", fetchImpl };
    await callApi(deps, "/x", { a: undefined, b: null, c: 3 });
    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://backend/x?c=3");
    expect((fetchImpl.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe(
      "Bearer "
    );
  });

  it("throws ApiError with status and body on failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 503, statusText: "Service Unavailable" }));
    const deps = { apiUrl: "http://backend", apiToken: "t", fetchImpl };
    const err = await callApi(deps, "/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(503);
    expect(err.body).toBe("boom");
    expect(err.message).toContain("503");
  });
});

describe("jsonResult", () => {
  it("wraps data as JSON text content", () => {
    const res = jsonResult({ a: 1 });
    expect(res.content[0].type).toBe("text");
    expect(JSON.parse(res.content[0].text)).toEqual({ a: 1 });
  });
});

describe("withErrorHandling", () => {
  it("passes through successful results", async () => {
    const wrapped = withErrorHandling(async () => jsonResult({ fine: true }));
    const res = await wrapped({} as never);
    expect(res.isError).toBeUndefined();
  });

  it("converts ApiError into a structured isError result with status", async () => {
    const wrapped = withErrorHandling(async () => {
      throw new ApiError(502, "Bad Gateway", "upstream");
    });
    const res = await wrapped({} as never);
    expect(res.isError).toBe(true);
    const payload = JSON.parse(res.content[0].text);
    expect(payload.status).toBe(502);
    expect(payload.error).toContain("upstream");
  });

  it("converts generic errors without status", async () => {
    const wrapped = withErrorHandling(async () => {
      throw new Error("kaboom");
    });
    const res = await wrapped({} as never);
    expect(res.isError).toBe(true);
    const payload = JSON.parse(res.content[0].text);
    expect(payload.error).toBe("kaboom");
    expect(payload.status).toBeUndefined();
  });
});
