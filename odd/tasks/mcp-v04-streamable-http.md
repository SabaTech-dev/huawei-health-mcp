# MCP v0.4 — Streamable HTTP + request logging + tests

Objective: add Streamable HTTP transport (spec 2026-07-28) alongside stdio, structured request logging, vitest suite >80% coverage. Branch `feat/mcp-v04-streamable-http`. Runner: `npx tsc --noEmit && npm test` (mcp-server/); `pytest tests/ -q --cov=src` (api/, must stay ≥60 passed, ≥86%).

## Specs
- S1: "además de stdio (default), endpoint HTTP streamable (POST /mcp, respuestas SSE, sesiones) según spec".
- S2: "Logging por request (estructurado, request-id)".
- S3: "tests TS para mcp-server/ (vitest: handlers, errores estructurados, transporte). Objetivo: coverage mcp-server >80% y `npx tsc --noEmit` limpio".
- S4: "Bump v0.4.0 + docs/mcp-compliance.md marcando R2/R3 done" (y README).
- S5: PR a main, NO mergear.

## Tasks
- T1 (S1,S2,S3): DONE — commit 52bb755 (inline)
- T2 (S4): DONE — commit 52bb755 (inline)
- T3 (S5): DONE — PR #4 (not merged, per instructions)

## Log
- L1 (2026-10-23): verbatim workboard task delegated by Alfred; PR #3 merged, base a216bb9.
- L2 (2026-10-23): all checks observed: tsc 0, vitest 35 passed, coverage 89/91/73% (stmts/lines/branches), pytest 60 passed 86%, smokes stdio+HTTP OK. PR https://github.com/SabaTech-dev/huawei-health-mcp/pull/4
