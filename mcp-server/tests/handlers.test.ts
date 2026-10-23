import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLogger } from "../src/logger.js";
import { createMcpServer } from "../src/server.js";

const fetchImpl = vi.fn(async () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
);

async function connect() {
  const server = createMcpServer(
    { apiUrl: "http://backend", apiToken: "tok", fetchImpl: fetchImpl as unknown as typeof fetch },
    createLogger({ minLevel: "error" })
  );
  const client = new Client({ name: "test-client", version: "0.0.1" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

/** Every tool maps to one backend endpoint; exercise each handler end-to-end. */
const cases: Array<{ tool: string; args: Record<string, unknown>; path: string; query?: string }> = [
  { tool: "get_heart_rate", args: { date: "2026-10-22", type: "resting" }, path: "/api/v1/heart-rate", query: "date=2026-10-22&type=resting" },
  { tool: "get_sleep_data", args: {}, path: "/api/v1/sleep" },
  { tool: "get_spo2", args: { date: "2026-10-22" }, path: "/api/v1/spo2", query: "date=2026-10-22" },
  { tool: "get_steps", args: {}, path: "/api/v1/steps" },
  { tool: "get_stress", args: { date: "2026-10-22" }, path: "/api/v1/stress", query: "date=2026-10-22" },
  { tool: "get_temperature", args: {}, path: "/api/v1/temperature" },
  { tool: "get_ecg", args: { date: "2026-10-22" }, path: "/api/v1/ecg", query: "date=2026-10-22" },
  { tool: "get_workout_history", args: { workout_type: "running", limit: 5 }, path: "/api/v1/workouts", query: "workout_type=running&limit=5" },
  { tool: "get_health_summary", args: { period: "weekly" }, path: "/api/v1/summary", query: "period=weekly" },
  { tool: "get_auth_status", args: {}, path: "/api/v1/auth/status" },
];

describe("tool handlers (all 10)", () => {
  it.each(cases)("calls the backend for $tool", async ({ tool, args, path, query }) => {
    const client = await connect();
    fetchImpl.mockClear();
    const res = await client.callTool({ name: tool, arguments: args });
    expect(res.isError).toBeUndefined();
    const url = String(fetchImpl.mock.calls[0][0]);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe(path);
    if (query) expect(parsed.search).toBe(`?${query}`);
    else expect(parsed.search).toBe("");
    await client.close();
  });

  it("omits falsy optional params", async () => {
    const client = await connect();
    fetchImpl.mockClear();
    await client.callTool({
      name: "get_heart_rate",
      arguments: { date: "2026-10-22", type: undefined },
    });
    const parsed = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(parsed.searchParams.get("date")).toBe("2026-10-22");
    expect(parsed.searchParams.get("type")).toBeNull();
    await client.close();
  });
});
