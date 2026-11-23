import { expect, it } from "vitest";
import { OFFER_STATUSES } from "@/lib/requests.shared";

it("support requests use exactly New, Replied, Follow-up and Cancelled", () => {
  expect([...OFFER_STATUSES]).toEqual(["new", "replied", "follow_up", "cancelled"]);
});
