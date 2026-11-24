import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const withAuth = (value?: string) =>
  new Request("https://example.test/api/public/jobs/newsletter", {
    headers: value ? { authorization: value } : {},
  });

describe("scheduled job routes", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the current and previous secret and rejects anything else", async () => {
    vi.stubEnv("CRON_SECRET", "current-secret");
    vi.stubEnv("CRON_SECRET_PREVIOUS", "previous-secret");
    expect(
      await authenticateCronRequest(withAuth("Bearer current-secret")),
    ).toBeNull();
    expect(
      await authenticateCronRequest(withAuth("Bearer previous-secret")),
    ).toBeNull();
    expect(
      (await authenticateCronRequest(withAuth("Bearer wrong")))?.status,
    ).toBe(401);
    expect((await authenticateCronRequest(withAuth()))?.status).toBe(401);
  });

  it("fails closed when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await authenticateCronRequest(withAuth("Bearer x")))?.status).toBe(
      500,
    );
  });

  it("both job routes use the shared constant-time check before doing work", () => {
    const newsletter = readFileSync(
      "src/routes/api/public/jobs/newsletter.ts",
      "utf8",
    );
    expect(newsletter).toContain("authenticateCronRequest(request)");
    expect(newsletter).not.toMatch(/!==\s*"Bearer "/);
    const cleanup = readFileSync(
      "src/routes/api/public/jobs/daily-cleanup.ts",
      "utf8",
    );
    expect(cleanup).toMatch(
      /GET:\s*\(\{ request \}\) => runDailyCleanup\(request\)/,
    );
  });

  it("Vercel schedules both jobs", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: { path: string }[];
    };
    expect(vercel.crons.map((c) => c.path).sort()).toEqual([
      "/api/public/jobs/daily-cleanup",
      "/api/public/jobs/newsletter",
    ]);
  });
});
