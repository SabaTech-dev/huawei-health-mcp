import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLogger } from "../src/logger.js";
import { createMcpServer, SERVER_NAME, SERVER_VERSION } from "../src/server.js";

const deps = {
  apiUrl: "http://backend",
  apiToken: "tok",
  fetchImpl: (async () =>
    new Response(JSON.stringify({ steps: 8000 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch,
};

async function connect() {
  const server = createMcpServer(deps, createLogger({ minLevel: "error" }));
  const client = new Client({ name: "test-client", version: "0.0.1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("createMcpServer", () => {
  it("completes the initialize handshake with server info", async () => {
    const client = await connect();
    // InMemory client already performed initialize; server info was accepted.
    expect(client.getServerVersion()).toEqual({
      name: SERVER_NAME,
      version: SERVER_VERSION,
    });
    await client.close();
  });

  it("declares exactly the 10 read-only tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "get_heart_rate",
        "get_sleep_data",
        "get_spo2",
        "get_steps",
        "get_stress",
        "get_temperature",
        "get_ecg",
        "get_workout_history",
        "get_health_summary",
        "get_auth_status",
      ].sort()
    );
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
    await client.close();
  });

  it("calls a tool and returns backend JSON as text content", async () => {
    const client = await connect();
    const res = await client.callTool({ name: "get_steps", arguments: { date: "2026-10-22" } });
    expect(res.isError).toBeUndefined();
    expect(JSON.parse((res.content as any[])[0].text)).toEqual({ steps: 8000 });
    await client.close();
  });

  it("returns a structured isError result on backend failure (not a protocol error)", async () => {
    const failing = {
      ...deps,
      fetchImpl: (async () =>
        new Response("unauthorized", { status: 401, statusText: "Unauthorized" })) as typeof fetch,
    };
    const server = createMcpServer(failing, createLogger({ minLevel: "error" }));
    const client = new Client({ name: "test-client", version: "0.0.1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
    const res = await client.callTool({ name: "get_heart_rate", arguments: {} });
    expect(res.isError).toBe(true);
    const payload = JSON.parse((res.content as any[])[0].text);
    expect(payload.status).toBe(401);
    expect(payload.error).toContain("unauthorized");
    await client.close();
  });

  it("returns a structured isError result on schema-invalid input", async () => {
    const client = await connect();
    const res = await client.callTool({
      name: "get_workout_history",
      arguments: { limit: 500 },
    });
    expect(res.isError).toBe(true);
    expect(((res.content as any[])[0].text as string)).toContain("-32602");
    await client.close();
  });
});
