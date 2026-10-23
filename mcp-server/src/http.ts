/**
 * Streamable HTTP transport (MCP spec 2026-07-28, "Streamable HTTP").
 *
 * - POST /mcp: JSON-RPC messages. Responses may be JSON or an SSE stream,
 *   depending on the client's Accept header and whether the server streams.
 * - GET /mcp: opens a server-initiated SSE stream for an existing session.
 * - DELETE /mcp: terminates the session.
 * Sessions are correlated via the `mcp-session-id` response header.
 */

import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer as createHttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Logger } from "./logger.js";

interface SessionEntry {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

interface HttpDeps {
  host: string;
  port: number;
  createServerInstance: (logger: Logger) => Promise<McpServer> | McpServer;
  logger: Logger;
}

/** Parse a session id from the request headers (undefined if absent). */
function sessionIdOf(req: IncomingMessage): string | undefined {
  const sid = req.headers["mcp-session-id"];
  return typeof sid === "string" ? sid : undefined;
}

function jsonError(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Read the full request body as a UTF-8 string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createStreamableHttpApp(deps: HttpDeps): Server {
  const sessions = new Map<string, SessionEntry>();

  async function getOrCreateSession(): Promise<SessionEntry> {
    const reqLogger = deps.logger;
    const instance = await deps.createServerInstance(reqLogger);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSid: string) => {
        sessions.set(newSid, { server: instance, transport });
        reqLogger.info("http.session.opened", { sessionId: newSid });
      },
      onsessionclosed: (closedSid: string) => {
        sessions.delete(closedSid);
        reqLogger.info("http.session.closed", { sessionId: closedSid });
      },
    });
    await instance.connect(transport);
    return { server: instance, transport };
  }

  async function handlePost(req: IncomingMessage, res: ServerResponse, requestId: string) {
    // Peek at the JSON-RPC body to decide whether this opens a new session.
    const body = await readBody(req);
    let parsed: { method?: string } = {};
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      jsonError(res, 400, {
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      });
      return;
    }
    const sid = sessionIdOf(req);
    const entry =
      sid !== undefined
        ? sessions.get(sid)
        : parsed.method === "initialize"
          ? await getOrCreateSession()
          : undefined;
    if (!entry) {
      jsonError(res, 404, {
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found" },
        id: null,
      });
      return;
    }
    const start = Date.now();
    await entry.transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
    deps.logger.info("http.request", {
      requestId,
      method: "POST",
      rpcMethod: parsed.method,
      sessionId: entry.transport.sessionId ?? sid,
      latency_ms: Date.now() - start,
    });
  }

  function requireSession(
    req: IncomingMessage,
    res: ServerResponse
  ): SessionEntry | undefined {
    const sid = sessionIdOf(req);
    const entry = sid ? sessions.get(sid) : undefined;
    if (!entry) {
      jsonError(res, 404, {
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found" },
        id: null,
      });
      return undefined;
    }
    return entry;
  }

  return createHttpServer(async (req, res) => {
    const requestId = randomUUID();
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (url.pathname !== "/mcp") {
        jsonError(res, 404, { error: "not_found" });
        return;
      }
      switch (req.method) {
        case "POST": {
          await handlePost(req, res, requestId);
          break;
        }
        case "GET": {
          const entry = requireSession(req, res);
          if (entry) await entry.transport.handleRequest(req, res);
          break;
        }
        case "DELETE": {
          const entry = requireSession(req, res);
          if (entry) await entry.transport.handleRequest(req, res);
          break;
        }
        default:
          res.setHeader("Allow", "GET, POST, DELETE");
          jsonError(res, 405, { error: "method_not_allowed" });
      }
    } catch (err) {
      deps.logger.error("http.request", {
        requestId,
        method: req.method,
        error: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) jsonError(res, 500, { error: "internal_error" });
      else res.end();
    }
  });
}

export interface HttpServerConfig {
  host?: string;
  port: number;
  createServerInstance: (logger: Logger) => Promise<McpServer> | McpServer;
  logger: Logger;
}

export function startHttpServer(config: HttpServerConfig): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createStreamableHttpApp({
      host: config.host ?? "127.0.0.1",
      port: config.port,
      createServerInstance: config.createServerInstance,
      logger: config.logger,
    });
    server.once("error", reject);
    server.listen(config.port, config.host ?? "127.0.0.1", () => resolve(server));
  });
}
