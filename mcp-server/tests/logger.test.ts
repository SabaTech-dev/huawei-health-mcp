import { describe, expect, it, vi } from "vitest";
import { createLogger, newRequestId, requestLogger } from "../src/logger.js";

function captureLogger(minLevel?: "debug" | "info" | "warn" | "error") {
  const lines: string[] = [];
  const logger = createLogger({
    minLevel,
    write: (line) => lines.push(line),
    now: () => 1730000000000,
  });
  return { lines, logger };
}

describe("createLogger", () => {
  it("emits structured JSON with ts, level, msg and fields to stderr", () => {
    const { lines, logger } = captureLogger("debug");
    logger.info("tool.call", { tool: "get_steps", latency_ms: 5 });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({
      ts: new Date(1730000000000).toISOString(),
      level: "info",
      msg: "tool.call",
      tool: "get_steps",
      latency_ms: 5,
    });
  });

  it("filters below the minimum level", () => {
    const { lines, logger } = captureLogger("warn");
    logger.debug("nope");
    logger.info("nope");
    logger.warn("yes");
    logger.error("yes");
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => JSON.parse(l).level in { warn: 1, error: 1 })).toBe(true);
  });

  it("resolves LOG_LEVEL from env", async () => {
    const lines: string[] = [];
    process.env.LOG_LEVEL = "error";
    vi.resetModules();
    const { createLogger: freshCreateLogger } = await import("../src/logger.js");
    freshCreateLogger({ write: (l) => lines.push(l) }).info("hidden");
    freshCreateLogger({ write: (l) => lines.push(l) }).error("shown");
    delete process.env.LOG_LEVEL;
    expect(lines.map((l) => JSON.parse(l).msg)).toEqual(["shown"]);
  });

  it("ignores invalid LOG_LEVEL values", async () => {
    const lines: string[] = [];
    process.env.LOG_LEVEL = "bogus";
    vi.resetModules();
    const { createLogger: freshCreateLogger } = await import("../src/logger.js");
    freshCreateLogger({ write: (l) => lines.push(l) }).info("shown");
    delete process.env.LOG_LEVEL;
    expect(lines).toHaveLength(1);
  });
});

describe("requestLogger", () => {
  it("stamps requestId on every entry", () => {
    const { lines, logger } = captureLogger("debug");
    const req = requestLogger(logger, "req-1");
    req.warn("http.request", { method: "POST" });
    const entry = JSON.parse(lines[0]);
    expect(entry.requestId).toBe("req-1");
    expect(entry.method).toBe("POST");
    expect(entry.level).toBe("warn");
  });
});

describe("newRequestId", () => {
  it("returns unique UUID-shaped ids", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });
});
