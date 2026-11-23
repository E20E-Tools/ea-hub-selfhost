import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  METRICS_OPT_OUT_KEY,
  metricsOptedOut,
  setMetricsOptOut,
  trackProductEvent,
} from "@/lib/journey-client";

vi.mock("@/lib/journey.functions", () => ({ recordJourneyEvent: vi.fn() }));

const track = vi.fn();
beforeEach(() => {
  window.localStorage.clear();
  track.mockReset();
  (window as unknown as { __lovableEvents: unknown }).__lovableEvents = { track };
});
afterEach(() => {
  delete (window as unknown as { __lovableEvents?: unknown }).__lovableEvents;
});

describe("optional product events follow the privacy choice", () => {
  it("sends nothing after the visitor opts out", () => {
    setMetricsOptOut(true);
    trackProductEvent("project.request_receipt_confirmed", { request_type: "general" });
    expect(track).not.toHaveBeenCalled();
  });

  it("sends when allowed", () => {
    trackProductEvent("project.request_receipt_confirmed");
    expect(track).toHaveBeenCalledWith("project.request_receipt_confirmed", undefined);
  });

  it("contains a collector failure", () => {
    track.mockImplementation(() => {
      throw new Error("collector down");
    });
    expect(() => trackProductEvent("project.archy_tour_started")).not.toThrow();
  });

  it("follows a choice changed in another tab instead of this tab's earlier choice", () => {
    setMetricsOptOut(true);
    window.localStorage.removeItem(METRICS_OPT_OUT_KEY); // another tab opted back in
    expect(metricsOptedOut()).toBe(false);
  });
});
