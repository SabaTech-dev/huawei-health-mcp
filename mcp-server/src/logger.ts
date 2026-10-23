/**
 * Structured stderr logging with request correlation ids.
 * Protocol traffic must stay on stdout (stdio transport); all logs go to stderr.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function resolveMinLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || "info").toLowerCase();
  return (["debug", "info", "warn", "error"] as LogLevel[]).includes(raw as LogLevel)
    ? (raw as LogLevel)
    : "info";
}

export interface LoggerOptions {
  minLevel?: LogLevel;
  write?: (line: string) => void;
  now?: () => number;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const minLevel = options.minLevel ?? resolveMinLevel();
  const write = options.write ?? ((line: string) => process.stderr.write(line + "\n"));
  const now = options.now ?? (() => Date.now());

  const emit = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (LEVELS[level] < LEVELS[minLevel]) return;
    const entry = {
      ts: new Date(now()).toISOString(),
      level,
      msg,
      ...(fields ?? {}),
    };
    write(JSON.stringify(entry));
  };

  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
  };
}

/** Per-request child logger that stamps a fresh correlation id on every entry. */
export function requestLogger(base: Logger, requestId: string): Logger {
  return {
    debug: (m, f) => base.debug(m, { requestId, ...f }),
    info: (m, f) => base.info(m, { requestId, ...f }),
    warn: (m, f) => base.warn(m, { requestId, ...f }),
    error: (m, f) => base.error(m, { requestId, ...f }),
  };
}

export function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}
