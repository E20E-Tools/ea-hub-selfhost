import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import {
  defaultSettings,
  fontsHref,
  pickerFonts,
  themeCss,
} from "@/lib/catalog";

it("offers bundled faces offline and preserves a saved web font", () => {
  const local = pickerFonts(true, "Tajawal").map((font) => font.id);
  expect(local).toEqual(
    expect.arrayContaining([
      "Cairo",
      "Geist",
      "Signifier",
      "IBM Plex Sans Arabic",
      "Tajawal",
    ]),
  );
  expect(local).not.toContain("Alexandria");
  expect(fontsHref("Cairo", "Cairo")).toBe("");
  expect(pickerFonts(false, "Tajawal").map((font) => font.id)).toContain(
    "Cairo",
  );
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

it("sets Cairo as the default heading and body font", () => {
  expect(defaultSettings.headingFont).toBe("Cairo");
  expect(defaultSettings.bodyFont).toBe("Cairo");
});

it("every font stack in the stylesheets starts with Cairo", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".css")) files.push(p);
    }
  };
  walk("src");
  const offenders: string[] = [];
  for (const file of files) {
    let inFace = false;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (/^@font-face/.test(line)) inFace = true;
      else if (inFace && /^\}/.test(line)) inFace = false;
      const m = line.match(
        /^\s*(--[\w-]*(?:font|display|body|sans|mono)[\w-]*|font-family)\s*:\s*([^;]+);/,
      );
      if (
        !inFace &&
        m &&
        /["']/.test(m[2]!) &&
        !m[2]!.trim().startsWith('"Cairo Variable"')
      )
        offenders.push(`${file}: ${line.trim()}`);
    }
  }
  expect(offenders).toEqual([]);
});
