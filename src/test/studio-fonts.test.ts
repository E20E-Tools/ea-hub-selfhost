import { expect, it } from "vitest";
import { defaultSettings, fontsHref, pickerFonts, themeCss } from "@/lib/catalog";

it("offers bundled faces offline and preserves a saved web font", () => {
  const local = pickerFonts(true, "Tajawal").map((font) => font.id);
  expect(local).toEqual(
    expect.arrayContaining(["Geist", "Signifier", "IBM Plex Sans Arabic", "Alexandria", "Tajawal"]),
  );
  expect(local).not.toContain("Cairo");
  expect(pickerFonts(false, "Tajawal").map((font) => font.id)).toContain("Cairo");
  expect(fontsHref("Geist", "IBM Plex Sans Arabic")).toBe("");
  expect(fontsHref("Signifier", "Tajawal")).toContain("family=Tajawal");
  expect(fontsHref("Signifier", "Tajawal")).not.toContain("Signifier");
});

it("applies user-selected heading and body families only when explicitly customized", () => {
  const defaults = themeCss(defaultSettings);
  expect(defaults).not.toContain("--s-font:");
  expect(defaults).not.toContain(":is(h1,h2,h3,h4,h5,h6)");
  const custom = themeCss({
    ...defaultSettings,
    bodyFont: "IBM Plex Sans Arabic",
    headingFont: "Signifier",
  });
  expect(custom).toContain('--s-font:"IBM Plex Sans Arabic"');
  expect(custom).toContain('h5,h6){font-family:"Signifier"');
});
