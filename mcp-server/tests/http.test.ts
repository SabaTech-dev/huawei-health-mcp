import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createLogger } from "../src/logger.js";
import { createMcpServer } from "../src/server.js";
import { startHttpServer } from "../src/http.js";

let server: Server;
let baseUrl: string;

const deps = {
  apiUrl: "http://backend",
  apiToken: "tok",
  fetchImpl: (async () =>
    new Response(JSON.stringify({ steps: 4242 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch,
};

beforeAll(async () => {
  server = await startHttpServer({
    port: 0,
    createServerInstance: (logger) => createMcpServer(deps, logger),
    logger: createLogger({ minLevel: "error" }),
  });
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("no port");
  baseUrl = `http://127.0.0.1:${addr.port}/mcp`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("streamable HTTP transport", () => {
  it("completes initialize over HTTP and returns a session id", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "smoke", version: "0.0.0" },
        },
      }),
    });
    expect(res.status).toBe(200);
    const sid = res.headers.get("mcp-session-id");
    expect(sid).toBeTruthy();
    const text = await res.text();
    // SSE-framed response (spec: responses may be SSE streams)
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    expect(dataLine).toBeTruthy();
    const message = JSON.parse((dataLine as string).slice(5).trim());
    expect(message.result.serverInfo.name).toBe("huawei-health");
    expect(message.result.protocolVersion).toBe("2025-06-18");
  });

  it("serves the full client session over streamable HTTP", async () => {
    const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    const client = new Client({ name: "test-client", version: "0.0.1" });
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools).toHaveLength(10);
    const res = await client.callTool({ name: "get_steps", arguments: {} });
    expect(JSON.parse((res.content as any[])[0].text)).toEqual({ steps: 4242 });
    await client.close();
  });

  it("rejects non-initialize POSTs without a session id (404)", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects unknown session ids (404)", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "mcp-session-id": "does-not-exist",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects malformed JSON bodies (400)", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("answers 404 off /mcp and 405 for other methods", async () => {
    const root = new URL(baseUrl);
    const wrongPath = await fetch(`${root.origin}/other`, { method: "POST" });
    expect(wrongPath.status).toBe(404);

    const put = await fetch(baseUrl, { method: "PUT" });
    expect(put.status).toBe(405);
    expect(put.headers.get("allow")).toContain("POST");
  });
});
