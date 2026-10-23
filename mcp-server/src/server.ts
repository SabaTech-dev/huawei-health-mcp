/**
 * McpServer factory: registers the 10 Huawei Health tools (read-only)
 * with structured tool errors and per-request logging.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { callApi, jsonResult, withErrorHandling, type ApiDeps } from "./api.js";
import { type Logger } from "./logger.js";

export const SERVER_NAME = "huawei-health";
export const SERVER_VERSION = "0.4.0";

/** Wrap a handler with request logging (tool, latency, outcome) + structured errors. */
function withLogging(
  name: string,
  logger: Logger,
  handler: (args: any) => Promise<CallToolResult>
): (args: any) => Promise<CallToolResult> {
  return async (args) => {
    const start = Date.now();
    const result = await handler(args);
    logger.info("tool.call", {
      tool: name,
      latency_ms: Date.now() - start,
      isError: result.isError === true,
    });
    return result;
  };
}

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
} as const;

export function createMcpServer(deps: ApiDeps, logger: Logger): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const tool = (
    name: string,
    config: Record<string, unknown>,
    handler: (args: any) => Promise<CallToolResult>
  ) => {
    server.registerTool(
      name,
      config as never,
      withLogging(
        name,
        logger,
        withErrorHandling(handler) as (args: any) => Promise<CallToolResult>
      )
    );
  };

  tool(
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
    async ({ date, type }: { date?: string; type?: string }) => {
      const params: Record<string, unknown> = {};
      if (date) params.date = date;
      if (type) params.type = type;
      return jsonResult(await callApi(deps, "/api/v1/heart-rate", params));
    }
  );

  tool(
    "get_sleep_data",
    {
      title: "Get Sleep Data",
      description:
        "Get sleep analysis from Huawei Health. Includes sleep phases (deep, light, REM), duration, quality score, and apnea events.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    },
    async ({ date }: { date?: string }) => jsonResult(await callApi(deps, "/api/v1/sleep", { date }))
  );

  tool(
    "get_spo2",
    {
      title: "Get SpO2",
      description: "Get blood oxygen saturation (SpO2) data from Huawei Health for a given date.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    },
    async ({ date }: { date?: string }) => jsonResult(await callApi(deps, "/api/v1/spo2", { date }))
  );

  tool(
    "get_steps",
    {
      title: "Get Steps",
      description: "Get daily step count, distance, and calories from Huawei Health.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    },
    async ({ date }: { date?: string }) => jsonResult(await callApi(deps, "/api/v1/steps", { date }))
  );

  tool(
    "get_stress",
    {
      title: "Get Stress",
      description: "Get stress levels and trends from Huawei Health for a given date.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    },
    async ({ date }: { date?: string }) => jsonResult(await callApi(deps, "/api/v1/stress", { date }))
  );

  tool(
    "get_temperature",
    {
      title: "Get Skin Temperature",
      description: "Get skin temperature readings from Huawei Health Watch GT 5 Pro.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    },
    async ({ date }: { date?: string }) =>
      jsonResult(await callApi(deps, "/api/v1/temperature", { date }))
  );

  tool(
    "get_ecg",
    {
      title: "Get ECG",
      description:
        "Get ECG analysis results from Huawei Health. Results can be normal, sinus rhythm with premature beats, or atrial fibrillation.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: { date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today.") },
    },
    async ({ date }: { date?: string }) => jsonResult(await callApi(deps, "/api/v1/ecg", { date }))
  );

  tool(
    "get_workout_history",
    {
      title: "Get Workout History",
      description:
        "Get workout and exercise history from Huawei Health. Supports 100+ workout types including running, cycling, swimming, golf, and more.",
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today."),
        workout_type: z
          .string()
          .optional()
          .describe("Filter by workout type (e.g., running, cycling, swimming)."),
        limit: z.number().min(1).max(50).optional().describe("Max number of results. Defaults to 10."),
      },
    },
    async ({ date, workout_type, limit }: { date?: string; workout_type?: string; limit?: number }) => {
      const params: Record<string, unknown> = {};
      if (date) params.date = date;
      if (workout_type) params.workout_type = workout_type;
      if (limit) params.limit = limit;
      return jsonResult(await callApi(deps, "/api/v1/workouts", params));
    }
  );

  tool(
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
    async ({ date, period }: { date?: string; period?: string }) =>
      jsonResult(await callApi(deps, "/api/v1/summary", { date, period }))
  );

  tool(
    "get_auth_status",
    {
      title: "Get Auth Status",
      description:
        "Check if the Huawei Health API is currently authenticated and ready to serve data.",
      annotations: { ...READ_ONLY_ANNOTATIONS, idempotentHint: true },
      inputSchema: {},
    },
    async () => jsonResult(await callApi(deps, "/api/v1/auth/status", {}))
  );

  return server;
}
