import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const record = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useRouterState: () => false }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/site-visits.functions", () => ({ recordVisit: record }));
import { VisitTracker } from "@/components/visit-tracker";
import { VISIT_DAY_STORAGE } from "@/lib/site-visits.shared";
afterEach(cleanup);
it("failed visitor counting is handled without marking today as recorded", async () => {
  localStorage.clear();
  record.mockRejectedValue(new Error("offline"));
  render(<VisitTracker />);
  await act(async () => undefined);
  expect(record).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(VISIT_DAY_STORAGE)).toBeNull();
});
