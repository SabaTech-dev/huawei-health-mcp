/**
 * Huawei Health MCP Server — Main Entry Point
 * 
 * MCP Server that exposes Huawei Health Kit data as tools for AI agents.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Backend API URL (configured via env)
const API_URL = process.env.API_URL || "http://localhost:8081";

/**
 * Helper to call our backend API
 */
async function callApi<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
  const url = new URL(`${API_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString(), {
    headers: {
      "Authorization": `Bearer ${process.env.API_TOKEN || ""}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`API error: ${res.status} ${res.statusText} — ${errorText}`);
  }
  return res.json() as Promise<T>;
}

// Create MCP Server
const server = new McpServer({
  name: "huawei-health",
  version: "0.2.0",
});

// Common schemas
const dateParam = {
  date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today."),
};

const periodParam = {
  ...dateParam,
  period: z.enum(["daily", "weekly"]).optional().describe("Period: daily or weekly."),
};

// --- Tool 1: Heart Rate ---
server.tool(
  "get_heart_rate",
  "Get heart rate data from Huawei Health. Returns instantaneous, continuous, resting, and exercise heart rate data for a given date.",
  {
    ...dateParam,
    type: z.enum(["instantaneous", "continuous", "resting", "exercise", "all"]).optional()
      .describe("Type of heart rate data. Defaults to all."),
  },
  async ({ date, type }) => {
    const params: Record<string, unknown> = {};
    if (date) params.date = date;
    if (type) params.type = type;
    const data = await callApi("/api/v1/heart-rate", params);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// --- Tool 2: Sleep Data ---
server.tool(
  "get_sleep_data",
  "Get sleep analysis from Huawei Health. Includes sleep phases (deep, light, REM), duration, quality score, and apnea events.",
  dateParam,
  async ({ date }) => {
    const params: Record<string, unknown> = {};
    if (date) params.date = date;
    const data = await callApi("/api/v1/sleep", params);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// --- Tool 3: SpO2 ---
server.tool(
  "get_spo2",
  "Get blood oxygen saturation (SpO2) data from Huawei Health for a given date.",
  dateParam,
  async ({ date }) => {
    const params: Record<string, unknown> = {};
    if (date) params.date = date;
    const data = await callApi("/api/v1/spo2", params);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// --- Tool 4: Steps ---
server.tool(
  "get_steps",
  "Get daily step count, distance, and calories from Huawei Health.",
  dateParam,
  async ({ date }) => {
    const params: Record<string, unknown> = {};
    if (date) params.date = date;
    const data = await callApi("/api/v1/steps", params);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// --- Tool 5: Stress ---
server.tool(
  "get_stress",
  "Get stress levels and trends from Huawei Health for a given date.",
  dateParam,
  async ({ date }) => {
    const params: Record<string, unknown> = {};
    if (date) params.date = date;
    const data = await callApi("/api/v1/stress", params);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// --- Tool 6: Temperature ---
server.tool(
  "get_temperature",
  "Get skin temperature readings from Huawei Health Watch GT 5 Pro.",
  dateParam,
  async ({ date }) => {
    const params: Record<string, unknown> = {};
    if (date) params.date = date;
    const data = await callApi("/api/v1/temperature", params);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// --- Tool 7: ECG ---
server.tool(
  "get_ecg",
  "Get ECG analysis results from Huawei Health. Results can be normal, sinus rhythm with premature beats, or atrial fibrillation.",
  dateParam,
  async ({ date }) => {
    const params: Record<string, unknown> = {};
    if (date) params.date = date;
    const data = await callApi("/api/v1/ecg", params);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// --- Tool 8: Workouts ---
server.tool(
  "get_workout_history",
  "Get workout and exercise history from Huawei Health. Supports 100+ workout types including running, cycling, swimming, golf, and more.",
  {
    ...dateParam,
    workout_type: z.string().optional().describe("Filter by workout type (e.g., running, cycling, swimming)."),
    limit: z.number().min(1).max(50).optional().describe("Max number of results. Defaults to 10."),
  },
  async ({ date, workout_type, limit }) => {
    const params: Record<string, unknown> = {};
    if (date) params.date = date;
    if (workout_type) params.workout_type = workout_type;
    if (limit) params.limit = limit;
    const data = await callApi("/api/v1/workouts", params);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// --- Tool 9: Health Summary ---
server.tool(
  "get_health_summary",
  "Get comprehensive daily or weekly health summary combining heart rate, sleep, steps, SpO2, stress, and temperature data.",
  periodParam,
  async ({ date, period }) => {
    const params: Record<string, unknown> = {};
    if (date) params.date = date;
    if (period) params.period = period;
    const data = await callApi("/api/v1/summary", params);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// --- Tool 10: Auth Status ---
server.tool(
  "get_auth_status",
  "Check if the Huawei Health API is currently authenticated and ready to serve data.",
  {},
  async () => {
    const data = await callApi("/api/v1/auth/status", {});
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// --- Start Server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Huawei Health MCP Server v0.2.0 running on stdio");
  console.error(`Backend API: ${API_URL}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
