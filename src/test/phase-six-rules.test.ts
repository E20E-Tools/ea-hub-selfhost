import { expect, it } from "vitest";
import { searchSettings } from "@/lib/settings-search.shared";
import {
  chatCleanupEligible,
  retentionPolicySchema,
  sanitizeSettingsValue,
  summarizeTelemetry,
} from "@/lib/operations.shared";
import { aiBaseUrlProblem, boundedAiFetch } from "@/lib/ai-settings.shared";
import { archyContext, archyComparePrompt } from "@/lib/archy-context.shared";
import { fallbackCatalog } from "@/lib/catalog";

it("does not confuse measured answers with admissions or invent empty durations", () => {
  const empty = summarizeTelemetry([]);
  expect(empty[0]?.meanMs).toBeNull();
  const m = summarizeTelemetry([
    { operation: "assistant", outcome: "success", duration_ms: 100 },
    { operation: "assistant", outcome: "failure", duration_ms: 300 },
  ])[0];
  expect(m).toEqual({
    operation: "assistant",
    samples: 2,
    success: 1,
    failure: 1,
    meanMs: 200,
  });
});
it("retains active chats regardless of age", () => {
  expect(
    chatCleanupEligible(
      { status: "active", lastMessageAt: "2020-01-01", openSupport: false },
      Date.parse("2026-11-14"),
    ),
  ).toBe(false);
});
it("retains waiting chats regardless of age", () => {
  expect(
    chatCleanupEligible(
      { status: "waiting", lastMessageAt: "2020-01-01", openSupport: false },
      Date.parse("2026-11-14"),
    ),
  ).toBe(false);
});
it("retains chats linked to open support", () => {
  expect(
    chatCleanupEligible(
      { status: "closed", lastMessageAt: "2020-01-01", openSupport: true },
      Date.parse("2026-11-14"),
    ),
  ).toBe(false);
});
it("only admits inactive chats strictly older than 90 days", () => {
  const now = Date.parse("2026-11-14");
  expect(
    chatCleanupEligible(
      {
        status: "closed",
        lastMessageAt: new Date(now - 90 * 86400000).toISOString(),
        openSupport: false,
      },
      now,
    ),
  ).toBe(false);
  expect(
    chatCleanupEligible(
      {
        status: "closed",
        lastMessageAt: new Date(now - 91 * 86400000).toISOString(),
        openSupport: false,
      },
      now,
    ),
  ).toBe(true);
});
it("cannot change existing chat retention away from 90 days", () => {
  expect(
    retentionPolicySchema.safeParse({
      type: "chats",
      days: 89,
      manualEnabled: false,
      revision: 0,
    }).success,
  ).toBe(false);
  expect(
    retentionPolicySchema.safeParse({
      type: "chats",
      days: 90,
      manualEnabled: false,
      revision: 0,
    }).success,
  ).toBe(true);
});
it("sanitizes credentials and nested keys rather than recording encrypted blobs", () => {
  const value = sanitizeSettingsValue({
    api_key: "encrypted:fixture",
    nested: { token: "fixture", model: "real-model" },
    url: "https://provider.test/file?token=fixture",
    text: "sk-abcdefghijklmnop",
  });
  expect(value).toEqual({
    nested: { model: "real-model" },
    url: "https://provider.test/file",
    text: "[redacted]",
  });
});
it("searches English and Arabic keywords to existing specific controls", () => {
  expect(searchSettings("public email")).toEqual([
    expect.objectContaining({ tab: "contact", control: "c-email" }),
  ]);
  expect(searchSettings("إشعارات")).toContainEqual(
    expect.objectContaining({ tab: "notifications", control: "n-email" }),
  );
  expect(searchSettings("api key")).toContainEqual(
    expect.objectContaining({ tab: "ai", control: "ai-key" }),
  );
  expect(searchSettings("شروط")).toContainEqual(
    expect.objectContaining({ tab: "terms" }),
  );
  expect(searchSettings("journey")).toContainEqual(
    expect.objectContaining({ tab: "journey" }),
  );
  expect(searchSettings("voice").map((x) => x.control)).toContain(
    "archy-voice",
  );
  expect(searchSettings("صوت").map((x) => x.control)).toContain("archy-voice");
  expect(searchSettings("شعار").map((x) => x.tab)).toContain("general");
  expect(searchSettings("assistant").map((x) => x.control)).toContain(
    "feature-assistant",
  );
  expect(searchSettings("إصدارات").map((x) => x.tab)).toContain("history");
});
it("rejects arbitrary DNS names and trusted-host suffix tricks", async () => {
  expect(aiBaseUrlProblem("https://public-attacker.example/v1")).not.toBeNull();
  expect(
    aiBaseUrlProblem("https://api.groq.com.attacker.example/v1"),
  ).not.toBeNull();
  expect(aiBaseUrlProblem("https://api.groq.com/openai/v1")).toBeNull();
  let called = false;
  const f = boundedAiFetch(
    "https://public-attacker.example/v1",
    1000,
    async () => {
      called = true;
      return new Response();
    },
  );
  await expect(f("https://public-attacker.example/v1")).rejects.toThrow();
  expect(called).toBe(false);
});
it("contextual reasons use available live catalog records only", () => {
  const products = fallbackCatalog.products.map((p, i) => ({
    ...p,
    comingSoon: i !== 0,
  }));
  const context = archyContext(products, "en", "/");
  expect(context).toHaveLength(1);
  expect(context[0]?.reason).toBe(
    products[0]?.descriptionEn || products[0]?.description,
  );
  expect(archyComparePrompt(["A", "B"], "ar")).toContain("A و B");
});
