// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("@/lib/server-keys.server", () => ({
  deriveSigningSecret: async () => "synthetic-test-only-key",
}));
import { signRetentionPreview, verifyRetentionPreview } from "@/lib/retention-preview.server";
it("binds cleanup proof to administrator, type, revision and exact displayed IDs", async () => {
  const token = await signRetentionPreview("admin-a", "chats", 2, ["one"], 1000);
  expect(await verifyRetentionPreview(token, "admin-a", "chats", 2, ["one"], 1100)).toBe(true);
  expect(await verifyRetentionPreview(token, "admin-b", "chats", 2, ["one"], 1100)).toBe(false);
  expect(await verifyRetentionPreview(token, "admin-a", "visits", 2, ["one"], 1100)).toBe(false);
  expect(await verifyRetentionPreview(token, "admin-a", "chats", 3, ["one"], 1100)).toBe(false);
  expect(await verifyRetentionPreview(token, "admin-a", "chats", 2, ["other"], 1100)).toBe(false);
});
it("expires previews after ten minutes and rejects forged signatures", async () => {
  const token = await signRetentionPreview("admin-a", "chats", 2, ["one"], 1000);
  expect(await verifyRetentionPreview(token, "admin-a", "chats", 2, ["one"], 601001)).toBe(false);
  expect(
    await verifyRetentionPreview(
      { ...token, body: token.body.replace("one", "other") },
      "admin-a",
      "chats",
      2,
      ["other"],
      1100,
    ),
  ).toBe(false);
});
