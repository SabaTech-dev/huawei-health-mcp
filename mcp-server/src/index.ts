/**
 * Huawei Health MCP Server — Main Entry Point
 *
 * MCP Server that exposes Huawei Health Kit data as tools for AI agents.
 * Transports:
 *   - stdio (default): protocol on stdout, logs on stderr.
 *   - Streamable HTTP (MCP_HTTP=1): POST/GET/DELETE /mcp per spec 2026-07-28,
 *     sessions via the `mcp-session-id` header, SSE responses when streaming.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLogger } from "./logger.js";
import { createMcpServer } from "./server.js";
import { startHttpServer } from "./http.js";

const API_URL = process.env.API_URL || "http://localhost:8081";
const API_TOKEN = process.env.API_TOKEN || "";
const HTTP_ENABLED = process.env.MCP_HTTP === "1";
const HTTP_PORT = Number(process.env.MCP_HTTP_PORT || 3001);

const logger = createLogger();

async function main() {
  const deps = { apiUrl: API_URL, apiToken: API_TOKEN };

  if (HTTP_ENABLED) {
    await startHttpServer({
      host: process.env.MCP_HTTP_HOST || "127.0.0.1",
      port: HTTP_PORT,
      createServerInstance: (sessionLogger) => createMcpServer(deps, sessionLogger),
      logger,
    });
    logger.info("server.start", {
      transport: "streamable-http",
      endpoint: `http://${process.env.MCP_HTTP_HOST || "127.0.0.1"}:${HTTP_PORT}/mcp`,
      apiUrl: API_URL,
    });
    return;
  }

  const server = createMcpServer(deps, logger);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("server.start", { transport: "stdio", apiUrl: API_URL });
}

main().catch((error) => {
  logger.error("server.fatal", { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
