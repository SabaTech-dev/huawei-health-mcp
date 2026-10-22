/**
 * Huawei Health MCP Server — Main Entry Point
 *
 * MCP Server that exposes Huawei Health Kit data as tools for AI agents.
 * Uses the 2025-06-18+ registerTool API with tool annotations
 * (all tools are read-only health-data readers) and structured error
 * responses per the MCP spec.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Backend API URL (configured via env)
const API_URL = process.env.API_URL || "http://localhost:8081";

const SERVER_NAME = "huawei-health";
const SERVER_VERSION = "0.3.0";

/**
 * Helper to call our backend API.
 * Throws ApiError with a structured payload on failure.
 */
class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: string
  ) {
    super(`API error: ${status} ${statusText} — ${body}`);
  }
}

async function callApi<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
  const url = new URL(`${API_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${process.env.API_TOKEN || ""}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, res.statusText, errorText);
  }
  return res.json() as Promise<T>;
}

/** Wrap a tool handler so failures return structured MCP errors (isError: true). */
function withErrorHandling(
  handler: (args: any) => Promise<CallToolResult>
): (args: any) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = err instanceof ApiError ? err.status : undefined;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { error: message, ...(status !== undefined ? { status } : {}) },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  };
}

/** Serialize successful tool output as JSON text content. */
function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// Shared read-only annotation for all health-data tools.
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
} as const;

// Create MCP Server
const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

// Common schemas
// --- Tool 1: Heart Rate ---
server.registerTool(
  "get_heart_rate",
  {
    title: "Get Heart Rate",
    description:
      "Get heart rate data from Huawei Health. Returns instantaneous, continuous, resting, and exercise heart rate data for a given date.",
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today."),
      type: z
        .enum(["instantaneous", "continuous", "resting", "exercise", "all"])
        .optional()
        .describe("Type of heart rate data. Defaults to all."),
    },
  },
  withErrorHandling(async ({ date, type }: { date?: string; type?: string }) => {
    const params: Record<string, unknown> = {};
    if (date) params.date = date;
    if (type) params.type = type;
    return jsonResult(await callApi("/api/v1/heart-rate", params));
  })
);

// --- Tool 2: Sleep Data ---
server.registerTool(
  "get_sleep_data",
  {
    title: "Get Sleep Data",
    description:
      "Get sleep analysis from Huawei Health. Includes sleep phases (deep, light, REM), duration, quality score, and apnea events.",
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
  },
  withErrorHandling(async ({ date }: { date?: string }) => {
    return jsonResult(await callApi("/api/v1/sleep", { date }));
  })
);

// --- Tool 3: SpO2 ---
server.registerTool(
  "get_spo2",
  {
    title: "Get SpO2",
    description: "Get blood oxygen saturation (SpO2) data from Huawei Health for a given date.",
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
  },
  withErrorHandling(async ({ date }: { date?: string }) => {
    return jsonResult(await callApi("/api/v1/spo2", { date }));
  })
);

// --- Tool 4: Steps ---
server.registerTool(
  "get_steps",
  {
    title: "Get Steps",
    description: "Get daily step count, distance, and calories from Huawei Health.",
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
  },
  withErrorHandling(async ({ date }: { date?: string }) => {
    return jsonResult(await callApi("/api/v1/steps", { date }));
  })
);

// --- Tool 5: Stress ---
server.registerTool(
  "get_stress",
  {
    title: "Get Stress",
    description: "Get stress levels and trends from Huawei Health for a given date.",
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
  },
  withErrorHandling(async ({ date }: { date?: string }) => {
    return jsonResult(await callApi("/api/v1/stress", { date }));
  })
);

// --- Tool 6: Temperature ---
server.registerTool(
  "get_temperature",
  {
    title: "Get Skin Temperature",
    description: "Get skin temperature readings from Huawei Health Watch GT 5 Pro.",
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
  },
  withErrorHandling(async ({ date }: { date?: string }) => {
    return jsonResult(await callApi("/api/v1/temperature", { date }));
  })
);

// --- Tool 7: ECG ---
server.registerTool(
  "get_ecg",
  {
    title: "Get ECG",
    description:
      "Get ECG analysis results from Huawei Health. Results can be normal, sinus rhythm with premature beats, or atrial fibrillation.",
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
  },
  withErrorHandling(async ({ date }: { date?: string }) => {
    return jsonResult(await callApi("/api/v1/ecg", { date }));
  })
);

// --- Tool 8: Workouts ---
server.registerTool(
  "get_workout_history",
  {
    title: "Get Workout History",
    description:
      "Get workout and exercise history from Huawei Health. Supports 100+ workout types including running, cycling, swimming, golf, and more.",
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today."),
      workout_type: z.string().optional().describe("Filter by workout type (e.g., running, cycling, swimming)."),
      limit: z.number().min(1).max(50).optional().describe("Max number of results. Defaults to 10."),
    },
  },
  withErrorHandling(
    async ({ date, workout_type, limit }: { date?: string; workout_type?: string; limit?: number }) => {
      const params: Record<string, unknown> = {};
      if (date) params.date = date;
      if (workout_type) params.workout_type = workout_type;
      if (limit) params.limit = limit;
      return jsonResult(await callApi("/api/v1/workouts", params));
    }
  )
);

// --- Tool 9: Health Summary ---
server.registerTool(
  "get_health_summary",
  {
    title: "Get Health Summary",
    description:
      "Get comprehensive daily or weekly health summary combining heart rate, sleep, steps, SpO2, stress, and temperature data.",
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today."),
      period: z.enum(["daily", "weekly"]).optional().describe("Period: daily or weekly."),
    },
  },
  withErrorHandling(async ({ date, period }: { date?: string; period?: string }) => {
    return jsonResult(await callApi("/api/v1/summary", { date, period }));
  })
);

// --- Tool 10: Auth Status ---
server.registerTool(
  "get_auth_status",
  {
    title: "Get Auth Status",
    description: "Check if the Huawei Health API is currently authenticated and ready to serve data.",
    annotations: { ...READ_ONLY_ANNOTATIONS, idempotentHint: true },
    inputSchema: {},
  },
  withErrorHandling(async () => {
    return jsonResult(await callApi("/api/v1/auth/status", {}));
  })
);

// --- Start Server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Huawei Health MCP Server v${SERVER_VERSION} running on stdio`);
  console.error(`Backend API: ${API_URL}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
