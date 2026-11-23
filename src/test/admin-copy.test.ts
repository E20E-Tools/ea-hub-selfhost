import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { actionLabel, adminDictionaries, adminText } from "@/lib/admin-copy";

describe("admin dictionary", () => {
  it("has every key in both Arabic and English, none empty", () => {
    const ar = Object.keys(adminDictionaries.ar).sort();
    const en = Object.keys(adminDictionaries.en).sort();
    expect(en).toEqual(ar);
    for (const lang of ["ar", "en"] as const)
      for (const [key, value] of Object.entries(adminDictionaries[lang]))
        expect(value.trim(), `${lang}.${key}`).not.toBe("");
  });

  it("fills placeholders and translates audit actions", () => {
    expect(adminText("en", "editProduct", { name: "Radar" })).toBe("Edit Radar");
    expect(actionLabel("en", "product.save")).toBe("Saved a product");
    expect(actionLabel("ar", "product.save")).toBe("حفظ منتج");
    expect(actionLabel("en", "unknown.thing")).toBe("unknown.thing");
  });

  it("resolves every message key returned by admin server functions", () => {
    const files = [
      "admin.functions.ts",
      "ai-settings.functions.ts",
      "contact-settings.functions.ts",
    ];
    for (const file of files) {
      const source = readFileSync(join(__dirname, "../lib", file), "utf8");
      for (const [, key] of source.matchAll(/message: "([^"]+)"/g))
        expect(adminDictionaries.en, `${file}: ${key}`).toHaveProperty(key!);
    }
  });

  it("keeps Arabic text out of admin components (it belongs in the dictionary)", () => {
    const dir = join(__dirname, "../components/admin");
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), "utf8");
      // The language names in aria labels are the only allowed literal Arabic.
      const stripped = source.replace(/"العربية"/g, "");
      expect(/[\u0600-\u06FF]/.test(stripped), file).toBe(false);
    }
  });
});
