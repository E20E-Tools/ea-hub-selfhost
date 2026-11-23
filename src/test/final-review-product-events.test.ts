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
  window.addEventListener("e20e-product-event", track);
});
afterEach(() => {
  window.removeEventListener("e20e-product-event", track);
});

describe("optional product events follow the privacy choice", () => {
  it("sends nothing after the visitor opts out", () => {
    setMetricsOptOut(true);
    trackProductEvent("project.request_receipt_confirmed", { request_type: "general" });
    expect(track).not.toHaveBeenCalled();
  });

  it("sends when allowed", () => {
    trackProductEvent("project.request_receipt_confirmed");
    expect(track).toHaveBeenCalledWith(expect.objectContaining({ detail: { name: "project.request_receipt_confirmed", properties: undefined } }));
  });

  it("contains a collector failure", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent").mockImplementation(() => {
      throw new Error("collector down");
    });
    expect(() => trackProductEvent("project.archy_tour_started")).not.toThrow();
    dispatch.mockRestore();
  });

  it("follows a choice changed in another tab instead of this tab's earlier choice", () => {
    setMetricsOptOut(true);
    window.localStorage.removeItem(METRICS_OPT_OUT_KEY); // another tab opted back in
    expect(metricsOptedOut()).toBe(false);
  });
});
