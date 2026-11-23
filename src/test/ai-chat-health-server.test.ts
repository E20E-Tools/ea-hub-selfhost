// @vitest-environment node
// noteAiFailures must log the chat degradation alert in the admin activity log, once an hour.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  counts: new Map<string, number>(),
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  telemetry: [] as {
    operation: string;
    outcome: string;
    duration_ms: number;
    created_at: string;
  }[],
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://www.e20e.tools/"),
}));
vi.mock("@/integrations/supabase/client.server", () => {
  const query = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "gte", "in", "order", "limit"]) q[k] = () => q;
    q["then"] = (resolve: (v: unknown) => void) =>
      resolve(
        table === "application_telemetry"
          ? { data: m.telemetry, error: null }
          : { data: null, error: null },
      );
    q["insert"] = async (row: Record<string, unknown>) => {
      m.inserts.push({ table, row });
      return { error: null };
    };
    return q;
  };
  return {
    supabaseAdmin: {
      from: query,
      rpc: async (_name: string, args: { _bucket: string; _subject: string; _limit: number }) => {
        const key = `${args._bucket}|${args._subject}`;
        const used = m.counts.get(key) ?? 0;
        if (used >= args._limit) return { data: false, error: null };
        m.counts.set(key, used + 1);
        return { data: true, error: null };
      },
    },
  };
});

import { noteAiFailures } from "@/lib/telemetry.server";

const NOW = Date.parse("2026-11-17T12:00:00Z");
const min = (n: number) => new Date(NOW - n * 60_000).toISOString();
const row = (outcome: "success" | "failure", duration_ms: number, minutesAgo: number) => ({
  operation: "assistant",
  outcome,
  duration_ms,
  created_at: min(minutesAgo),
});

beforeEach(() => {
  m.counts.clear();
  m.inserts = [];
  m.telemetry = [];
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "unit-test-root");
});
afterEach(() => vi.unstubAllEnvs());

describe("ai.chat_degraded activity log", () => {
  it("logs a slow-reply alert at most once an hour", async () => {
    m.telemetry = [1, 2, 3, 4, 5].map((i) => row("success", 20000, i));
    await noteAiFailures(NOW);
    await noteAiFailures(NOW);
    const logged = m.inserts.filter((i) => i.table === "admin_activity");
    expect(logged.map((i) => i.row["action"])).toEqual(["ai.chat_degraded"]);
    expect(String(logged[0]?.row["target"])).toContain("slow");
    expect(String(logged[0]?.row["target"])).toContain("median=20000ms");
  });

  it("logs a low-success alert with the measured counts", async () => {
    m.telemetry = [
      row("success", 1000, 1),
      row("success", 1000, 2),
      row("failure", 1000, 3),
      row("failure", 1000, 4),
      row("failure", 1000, 5),
      row("success", 1000, 6),
    ];
    await noteAiFailures(NOW);
    const logged = m.inserts.filter((i) => i.table === "admin_activity");
    // The provider failure-rate alert fires on the same rows; the chat alert is its own entry.
    expect(logged.map((i) => i.row["action"])).toContain("ai.chat_degraded");
    const chat = logged.find((i) => i.row["action"] === "ai.chat_degraded");
    expect(String(chat?.row["target"])).toContain("lowSuccess success=3/6");
  });

  it("logs nothing while answers stay fast and successful", async () => {
    m.telemetry = [1, 2, 3, 4, 5].map((i) => row("success", 1500, i));
    await noteAiFailures(NOW);
    expect(m.inserts).toEqual([]);
  });
});
