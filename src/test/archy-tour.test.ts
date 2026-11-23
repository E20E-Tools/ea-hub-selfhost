import { afterEach, describe, expect, it } from "vitest";
import {
  ARCHY_TOUR_KEY,
  ARCHY_TOUR_MS,
  ARCHY_TOUR_PHASES,
  ARCHY_TOUR_SPEECH_CAP_MS,
  archyTour,
  archyTourNeedsRewind,
  archyTourRobotReady,
  cancelArchyTour,
  markArchyTourDone,
  quadraticArc,
  resetArchyTour,
  shouldRunArchyTour,
  tourDuration,
  tourEase,
} from "@/lib/archy-tour";

afterEach(() => {
  resetArchyTour();
  localStorage.clear();
});
describe("first browser visit gate", () => {
  it("runs once per browser and forced replay ignores completion", () => {
    expect(shouldRunArchyTour(localStorage)).toBe(true);
    markArchyTourDone(localStorage);
    expect(localStorage.getItem(ARCHY_TOUR_KEY)).toBe("done");
    expect(shouldRunArchyTour(localStorage)).toBe(false);
    expect(shouldRunArchyTour(localStorage, true)).toBe(true);
  });
  it("works with missing or blocked storage", () => {
    const blocked = {
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("blocked");
      },
    };
    expect(shouldRunArchyTour(blocked)).toBe(true);
    expect(shouldRunArchyTour(null)).toBe(true);
    expect(() => markArchyTourDone(blocked)).not.toThrow();
  });
});
it("arcs touch both endpoints and lift through the midpoint", () => {
  const start = { x: 0, y: 0 },
    control = { x: 50, y: -120 },
    end = { x: 100, y: 0 };
  expect(quadraticArc(start, control, end, 0)).toEqual(start);
  expect(quadraticArc(start, control, end, 1)).toEqual(end);
  expect(quadraticArc(start, control, end, 0.5)).toEqual({ x: 50, y: -60 });
  expect(tourEase(0)).toBe(0);
  expect(tourEase(0.5)).toBe(0.5);
  expect(tourEase(1)).toBe(1);
});
it("preserves the choreography order and scales every duration", () => {
  expect(ARCHY_TOUR_PHASES).toEqual(["rewind", "fly", "grab", "drag", "celebrate", "return"]);
  expect(ARCHY_TOUR_MS).toEqual({
    wait: 250,
    rewind: 500,
    fly: 1100,
    grab: 300,
    drag: 3600,
    celebrate: 2200,
    return: 1000,
  });
  for (const phase of Object.keys(ARCHY_TOUR_MS) as Array<keyof typeof ARCHY_TOUR_MS>) {
    expect(tourDuration(phase, 2)).toBe(ARCHY_TOUR_MS[phase] / 2);
  }
});
it("rewinds only when the handle is not already at Legacy", () => {
  expect(archyTourNeedsRewind(1)).toBe(false);
  expect(archyTourNeedsRewind(0.98)).toBe(false);
  expect(archyTourNeedsRewind(0.97)).toBe(true);
  expect(archyTourNeedsRewind(0)).toBe(true);
});

describe("greeting-delivered readiness", () => {
  const ready = {
    greetingChecked: true,
    sceneFinal: true,
    greetingPending: false,
    greetingStartedAt: 1_000,
    now: 2_000,
    animation: "Idle" as const,
    speaking: false,
    open: false,
    hidden: false,
  };
  it("does not wait for the greeting bubble timer", () => {
    expect(archyTourRobotReady(ready)).toBe(true);
  });
  it("waits for the first Wave and speech to finish", () => {
    expect(archyTourRobotReady({ ...ready, animation: "Wave" })).toBe(false);
    expect(archyTourRobotReady({ ...ready, speaking: true })).toBe(false);
    expect(archyTourRobotReady({ ...ready, greetingPending: true })).toBe(false);
    expect(archyTourRobotReady({ ...ready, sceneFinal: false })).toBe(false);
  });
  it("proceeds when speech passes the six-second safety cap", () => {
    expect(
      archyTourRobotReady({
        ...ready,
        speaking: true,
        now: 1_000 + ARCHY_TOUR_SPEECH_CAP_MS - 1,
      }),
    ).toBe(false);
    expect(
      archyTourRobotReady({
        ...ready,
        speaking: true,
        now: 1_000 + ARCHY_TOUR_SPEECH_CAP_MS,
      }),
    ).toBe(true);
  });
  it("is immediately ready after the scene settles in an already-greeted session", () => {
    expect(
      archyTourRobotReady({ ...ready, greetingStartedAt: null, animation: "Wave", speaking: true }),
    ).toBe(true);
    expect(archyTourRobotReady({ ...ready, greetingStartedAt: null, open: true })).toBe(false);
    expect(archyTourRobotReady({ ...ready, greetingStartedAt: null, hidden: true })).toBe(false);
  });
});

it("publishes cancellation and unsubscribes listeners", () => {
  let calls = 0;
  const stop = archyTour.subscribe(() => {
    calls++;
  });
  const before = archyTour.getSnapshot().cancelSignal;
  cancelArchyTour(true);
  expect(archyTour.getSnapshot().cancelSignal).toBe(before + 1);
  expect(archyTour.getSnapshot().cancelSnap).toBe(true);
  expect(calls).toBe(1);
  stop();
  cancelArchyTour();
  expect(calls).toBe(1);
});
