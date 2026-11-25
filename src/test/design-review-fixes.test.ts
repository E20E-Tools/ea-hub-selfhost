import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCENTS, accentFor, onAccentFor } from "@/themes/flip-deck/model";

const src = join(__dirname, "..");
const css = (path: string) => readFileSync(join(src, path), "utf8");

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("design review fixes", () => {
  it("gives every Flip Deck accent a readable button text (4.5:1)", () => {
    ACCENTS.forEach((_, i) => {
      expect(contrast(accentFor(i), onAccentFor(i))).toBeGreaterThanOrEqual(
        4.5,
      );
    });
  });

  it("paints the Circuit Core stage dark so its light intro text stays readable", () => {
    const rule = css("themes/circuit-core/theme.css").match(
      /\.cc-stage \{[^}]*\}/,
    )?.[0];
    expect(rule).toMatch(/background: var\(--cc-board\)/);
  });

  it("draws field edges darker than the decorative line token", () => {
    expect(css("studio/workspace.css")).toMatch(
      /--input: color-mix\(in oklab, var\(--ea-muted\) 62%, var\(--ea-line\)\)/,
    );
  });

  it("keeps theme text at 12px or larger", () => {
    const themes = join(src, "themes");
    const tiny: string[] = [];
    for (const dir of readdirSync(themes, { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name === "ea-metropolis") continue; // SVG user units
      let text: string;
      try {
        text = css(`themes/${dir.name}/theme.css`);
      } catch {
        continue;
      }
      text.split("\n").forEach((line, i) => {
        if (line.includes('content: "')) return;
        const m =
          line.match(/font-size:\s*([\d.]+)px/) ??
          line.match(/font:\s*\d+\s+([\d.]+)px/);
        if (m && Number(m[1]) < 12) tiny.push(`${dir.name}:${i + 1}`);
      });
    }
    // Two decorative glyph badges (a star and an OS badge icon) are exempt.
    expect(tiny).toEqual(["digital-mashrabiya:182", "e20e-os:636"]);
  });

  it("no longer ships an unreachable .dark palette", () => {
    expect(css("styles.css")).not.toMatch(/^\.dark \{/m);
  });
});
