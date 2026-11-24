// AI chat health: last hour of conversation answers — successes, reply times, degradation alert.
import { describe, expect, it } from "vitest";
import { CHAT_HEALTH_SLOW_MS, aiChatHealth } from "@/lib/operations.shared";

const NOW = Date.parse("2026-11-17T12:00:00Z");
const min = (n: number) => new Date(NOW - n * 60_000).toISOString();

const row = (
  operation: string,
  outcome: "success" | "failure",
  duration_ms: number,
  minutesAgo: number,
) => ({ operation, outcome, duration_ms, created_at: min(minutesAgo) });

describe("aiChatHealth", () => {
  it("counts only assistant answers from the last hour", () => {
    const health = aiChatHealth(
      [
        row("assistant", "success", 1200, 5),
        row("assistant", "failure", 900, 10),
        // older than the hour window
        row("assistant", "success", 1000, 61),
        // other operations never feed chat health
        row("recommendation", "success", 5000, 3),
        row("request", "success", 5000, 3),
      ],
      NOW,
    );
    expect(health.hourSamples).toBe(2);
    expect(health.hourSuccess).toBe(1);
    expect(health.successRate).toBeCloseTo(0.5);
  });

  it("takes median and slowest-5% reply times from successful answers only", () => {
    const times = [
      1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 100000,
    ];
    const health = aiChatHealth(
      times
        .map((ms, i) => row("assistant", "success", ms, i + 1))
        .concat(
          // a slow failure must not stretch the reply times
          [row("assistant", "failure", 250000, 20)],
        ),
      NOW,
    );
    expect(health.hourSuccess).toBe(10);
    expect(health.medianMs).toBe(5000);
    expect(health.p95Ms).toBe(100000);
  });

  it("alerts when the median reply time is above the slow threshold", () => {
    const slow = CHAT_HEALTH_SLOW_MS + 1;
    const health = aiChatHealth(
      [1, 2, 3, 4, 5].map((i) => row("assistant", "success", slow, i)),
      NOW,
    );
    expect(health.alert?.reason).toBe("slow");
    expect(health.alert?.medianMs).toBe(slow);
    expect(health.alert?.hourSamples).toBe(5);
  });

  it("does not alert while the median reply time stays at or below the threshold", () => {
    const health = aiChatHealth(
      [1, 2, 3, 4, 5].map((i) =>
        row("assistant", "success", CHAT_HEALTH_SLOW_MS, i),
      ),
      NOW,
    );
    expect(health.alert).toBeNull();
  });

  it("alerts when fewer than 70% of the hour's answers succeeded", () => {
    const health = aiChatHealth(
      [
        row("assistant", "success", 1000, 1),
        row("assistant", "success", 1000, 2),
        row("assistant", "failure", 1000, 3),
        row("assistant", "failure", 1000, 4),
        row("assistant", "failure", 1000, 5),
        row("assistant", "success", 1000, 6),
      ],
      NOW,
    );
    expect(health.alert?.reason).toBe("lowSuccess");
    expect(health.alert?.hourSuccess).toBe(3);
    expect(health.alert?.hourSamples).toBe(6);
  });

  it("ignores the success-rate rule until enough answers were measured", () => {
    const health = aiChatHealth(
      [
        row("assistant", "success", 1000, 1),
        row("assistant", "failure", 1000, 2),
        row("assistant", "failure", 1000, 3),
      ],
      NOW,
    );
    expect(health.alert).toBeNull();
  });

  it("reports unknown reply times when nothing was measured", () => {
    const health = aiChatHealth([], NOW);
    expect(health).toEqual({
      hourSamples: 0,
      hourSuccess: 0,
      successRate: null,
      medianMs: null,
      p95Ms: null,
      alert: null,
    });
  });
});
