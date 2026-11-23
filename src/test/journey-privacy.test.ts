import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const record = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("@/lib/journey.functions", () => ({ recordJourneyEvent: record }));

import { privacySignalInHeaders } from "@/lib/journey.shared";

async function client() {
  vi.resetModules();
  return import("@/lib/journey-client");
}
const setNavigator = (key: string, value: unknown) =>
  Object.defineProperty(window.navigator, key, { value, configurable: true });

beforeEach(() => {
  record.mockClear();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  setNavigator("globalPrivacyControl", undefined);
  setNavigator("doNotTrack", null);
  vi.restoreAllMocks();
});

describe("aggregate metrics respect privacy choices", () => {
  it("sends an anonymous event when no opt-out is present, with no identifiers", async () => {
    const { trackJourney } = await client();
    await trackJourney("comparison_opened", "en");
    expect(record).toHaveBeenCalledTimes(1);
    const data = (record.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(Object.keys(data).sort()).toEqual(["event", "eventKey", "language", "rating"]);
  });
  it("sends nothing under Global Privacy Control", async () => {
    setNavigator("globalPrivacyControl", true);
    const { trackJourney } = await client();
    expect(await trackJourney("comparison_opened", "en")).toBe(false);
    expect(record).not.toHaveBeenCalled();
  });
  it("sends nothing under Do Not Track", async () => {
    setNavigator("doNotTrack", "1");
    const { trackJourney } = await client();
    expect(await trackJourney("demo_completed", "ar")).toBe(false);
    expect(record).not.toHaveBeenCalled();
  });
  it("a saved opt-out stops events and can be reversed", async () => {
    const { trackJourney, setMetricsOptOut, metricsAllowed } = await client();
    expect(setMetricsOptOut(true)).toBe(true);
    expect(await trackJourney("chooser_started", "en")).toBe(false);
    expect(record).not.toHaveBeenCalled();
    setMetricsOptOut(false);
    expect(metricsAllowed()).toBe(true);
  });
  it("keeps the opt-out for the page even when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const { trackJourney, setMetricsOptOut } = await client();
    expect(setMetricsOptOut(true)).toBe(false);
    expect(await trackJourney("chooser_started", "en")).toBe(false);
    expect(record).not.toHaveBeenCalled();
  });
  it("server recognises GPC and DNT request headers", () => {
    expect(privacySignalInHeaders(new Headers({ "sec-gpc": "1" }))).toBe(true);
    expect(privacySignalInHeaders(new Headers({ dnt: "1" }))).toBe(true);
    expect(privacySignalInHeaders(new Headers({ dnt: "0" }))).toBe(false);
  });
});
