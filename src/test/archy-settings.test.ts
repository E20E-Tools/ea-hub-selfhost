import { expect, it } from "vitest";
import {
  archyGreetingSchema,
  archyGreetingText,
  normalizeArchyGreeting,
  suggestArchyRoute,
} from "@/lib/archy-settings";

it("uses the admin greeting for the visitor language and the built-in one when empty", () => {
  const s = normalizeArchyGreeting({ ar: "أهلًا بك", en: "" });
  expect(archyGreetingText(s, "ar", "built-in ar")).toBe("أهلًا بك");
  expect(archyGreetingText(s, "en", "built-in en")).toBe("built-in en");
});

it("keeps voice on by default and clamps speed and pitch to 0.6–1.4", () => {
  expect(normalizeArchyGreeting({}).voiceOn).toBe(true);
  expect(normalizeArchyGreeting({ voiceOn: false }).voiceOn).toBe(false);
  expect(normalizeArchyGreeting({ rate: 5, pitch: 0.1 })).toMatchObject({ rate: 1.4, pitch: 0.6 });
  expect(() =>
    archyGreetingSchema.parse({ ar: "", en: "", voiceOn: true, rate: 2, pitch: 1 }),
  ).toThrow();
});

it("suggests a chat from the page first, then from open support requests", () => {
  expect(suggestArchyRoute("/product/tech-radar", 2)).toBe("tool");
  expect(suggestArchyRoute("/support", 0)).toBe("support");
  expect(suggestArchyRoute("/request", 0)).toBe("request");
  expect(suggestArchyRoute("/", 1)).toBe("support");
  expect(suggestArchyRoute("/", 0)).toBe("guide");
});

it("opens the guide automatically by default after 3 s, delay kept within 1–30 s", () => {
  expect(normalizeArchyGreeting({})).toMatchObject({ autoGuide: true, guideDelay: 3 });
  expect(normalizeArchyGreeting({ autoGuide: false, guideDelay: 90 })).toMatchObject({
    autoGuide: false,
    guideDelay: 30,
  });
});
