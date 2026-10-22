# MCP Compliance Audit — huawei-health mcp-server

**Date:** 2026-10-22
**Audited against:** MCP Specification revision `2026-07-28` (modelcontextprotocol.io) plus best-practices guide (modelcontextprotocol.info).
**Audited component:** `mcp-server/` (TypeScript, `@modelcontextprotocol/sdk` 1.32.1, zod 4.x, stdio transport).
**Result: compliant for its scope (stdio tool server), with 3 recommendations.**

## 1. Protocol version & lifecycle

| Item | Status | Evidence |
|---|---|---|
| Initialize handshake | ✅ | SDK-managed; smoke test returns `protocolVersion: 2025-06-18`, `serverInfo {name: huawei-health, version: 0.3.0}` |
| Capabilities declared | ✅ | `tools: {listChanged: true}` only — matches the server's actual feature set (no resources/prompts declared, none offered) |
| Spec revision `2026-07-28` | ⚠️ | SDK 1.32.1 negotiates `2025-06-18`. Version negotiation is spec-correct (client/server agree on the newest shared revision), but the newest spec features (e.g. task-based async tools, MCP Apps) require a future SDK upgrade. Not a violation. |

## 2. Transport

| Item | Status | Evidence |
|---|---|---|
| stdio transport | ✅ | `StdioServerTransport`; logs go to stderr (`console.error`), protocol on stdout — correct per spec |
| Streamable HTTP | ❌ not offered | Optional transport; fine for a local single-user server. Recommendation R2. |

## 3. Tools

| Item | Status | Evidence |
|---|---|---|
| Registration API | ✅ | `server.registerTool` (modern API, not the legacy `server.tool` overload) |
| Input schemas | ✅ | zod v4 JSON-schema-convertible shapes; validated by SDK before handler runs |
| Tool annotations | ✅ | All 10 tools declare `readOnlyHint: true`, `openWorldHint: true`; `get_auth_status` also `idempotentHint: true` (added in this audit) |
| Output | ✅ | `content: [{type: "text"}]` JSON blocks |
| Structured tool errors | ✅ | Failures return `isError: true` with a JSON error payload (`{error, status}`) instead of throwing — the client sees a normal tool result, per spec error-handling guidance |
| Tool count / names | ✅ | 10 tools (`get_heart_rate`, `get_sleep_data`, `get_spo2`, `get_steps`, `get_stress`, `get_temperature`, `get_ecg`, `get_workout_history`, `get_health_summary`, `get_auth_status`) |

## 4. Security (best-practices guide)

| Item | Status | Notes |
|---|---|---|
| Secrets not in protocol traffic | ✅ | `API_TOKEN` sent to the trusted local backend only; never exposed as tool output |
| Confused-deputy surface | ✅ low | Server is a thin read-only proxy; no file system or shell access |
| Output sanitization | ✅ | JSON passthrough of trusted backend responses |
| Audit logging | ⚠️ | Only startup logs. Recommendation R3. |

## 5. Baseline defects fixed in this audit

1. **TS2589 "type instantiation excessively deep"** at two `registerTool` calls — root cause: zod v3 type inference depth with multi-field schemas on SDK 1.32. **Fixed** by migrating to zod v4 (supported by SDK ≥1.32); `tsc --noEmit` now exits 0.
2. **Polluted dependency tree** — `node_modules`/lockfile contained unrelated packages (`hono`, express deps) introduced by an earlier broad `npm audit fix`. **Fixed** with a clean reinstall (95 packages, 0 vulnerabilities).
3. Legacy `server.tool()` usage replaced by `registerTool` with annotations and structured errors.

## 6. Recommendations

- **R1 (low):** Upgrade `package.json` dependency range from `^1.0.0` to `~1.32.1` to pin the audited SDK line. (Suggested; left as follow-up to avoid churn.)
- **R2 (medium):** Add Streamable HTTP transport behind a flag if the server will ever be shared remotely; stdio is correct for local use today.
- **R3 (low):** Add request-level logging (tool name, latency, backend status) to stderr for operability.
- **R4 (medium):** When the SDK supporting spec `2026-07-28` ships stable, re-run this audit against it.
