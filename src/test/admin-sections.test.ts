import { describe, expect, it } from "vitest";
import {
  ADMIN_SECTIONS,
  ADMIN_SECTION_TABS,
  SETTINGS_GROUPS,
  SECTION_ALIASES,
  resolveAdminLocation,
} from "@/lib/admin-sections";

describe("admin sections", () => {
  it("groups each existing settings deep link exactly once without changing its route", () => {
    const tabs = SETTINGS_GROUPS.flatMap((g) => [...g.tabs]);
    expect([...tabs].sort()).toEqual(
      ADMIN_SECTION_TABS.settings.filter((tab) => tab !== "overview").sort(),
    );
    expect(new Set(tabs).size).toBe(16);
    for (const tab of tabs)
      expect(resolveAdminLocation("settings", tab)).toEqual({
        section: "settings",
        tab,
      });
  });
  it("includes the unified customer workspace", () => {
    expect(ADMIN_SECTIONS.map((s) => s.id)).toEqual([
      "dashboard",
      "customers",
      "enterprise",
      "content",
      "settings",
      "security",
    ]);
  });

  it("falls back to the dashboard for unknown or missing sections", () => {
    expect(resolveAdminLocation(undefined)).toEqual({
      section: "dashboard",
      tab: undefined,
    });
    expect(resolveAdminLocation("events")).toEqual({
      section: "dashboard",
      tab: undefined,
    });
  });

  it("opens the first tab when the tab is missing or invalid", () => {
    expect(resolveAdminLocation("settings")).toEqual({
      section: "settings",
      tab: "overview",
    });
    expect(resolveAdminLocation("settings", "nope")).toEqual({
      section: "settings",
      tab: "overview",
    });
    expect(resolveAdminLocation("settings", "ai")).toEqual({
      section: "settings",
      tab: "ai",
    });
  });

  it("maps every old section link to the new section and tab", () => {
    const expected: Record<string, [string, string | undefined]> = {
      identity: ["settings", "general"],
      menu: ["settings", "navigation"],
      appearance: ["settings", "appearance"],
      "design-theme": ["settings", "appearance"],
      "site-features": ["settings", "features"],
      features: ["settings", "features"],
      contact: ["settings", "contact"],
      ai: ["settings", "ai"],
      "ai-settings": ["settings", "ai"],
      "ai-usage": ["settings", "ai"],
      "ai-chats": ["customers", "assistant"],
      inbox: ["customers", "requests"],
      livechat: ["customers", "conversations"],
      feedback: ["customers", "feedback"],
      "live-chat": ["customers", "conversations"],
      products: ["content", "products"],
      releases: ["content", "products"],
      gallery: ["content", "media"],
      affiliates: ["content", "affiliates"],
      requests: ["customers", "requests"],
      offers: ["customers", "offers"],
      team: ["security", "admins"],
      activity: ["security", "activity"],
      account: ["security", "account"],
    };
    for (const [old, [section, tab]] of Object.entries(expected)) {
      expect(resolveAdminLocation(old)).toEqual({ section, tab });
    }
  });

  it("only aliases to tabs that exist", () => {
    for (const alias of Object.values(SECTION_ALIASES)) {
      if (alias.tab)
        expect(ADMIN_SECTION_TABS[alias.section] as readonly string[]).toContain(alias.tab);
    }
  });
});
