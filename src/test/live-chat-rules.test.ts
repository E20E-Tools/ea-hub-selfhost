import { describe, expect, it } from "vitest";
import { cleanMessage, isWithPerson, retentionCutoff } from "@/lib/live-chat.shared";

describe("live chat rules", () => {
  it("keeps chats for three months (90 days)", () => {
    const now = Date.parse("2026-11-12T00:00:00Z");
    expect(retentionCutoff(now)).toBe("2026-08-14T00:00:00.000Z");
  });
  it("routes messages to a person only while waiting or active", () => {
    expect(isWithPerson("waiting")).toBe(true);
    expect(isWithPerson("active")).toBe(true);
    expect(isWithPerson("ai")).toBe(false);
    expect(isWithPerson("closed")).toBe(false);
  });
  it("caps message length at 2000 characters", () => {
    expect(cleanMessage("x".repeat(2500))).toHaveLength(2000);
  });
});
