import { describe, expect, it } from "vitest";
import { dictionaries } from "@/lib/copy";
import { completeCommand, findProduct, runCommand } from "@/themes/e20e-os/terminal";
import { BOOT_STORAGE_KEY, appGradient, markBooted, shouldBoot } from "@/themes/e20e-os/boot";

const products = [
  { id: "landscape", name: "APM & App Landscape", label: "Technology Landscape" },
  { id: "radar", name: "Tech Radar", label: "Technology Assessment" },
  {
    id: "archone",
    name: "ArchONE",
    label: "Enterprise Architecture",
    comingSoon: true,
    publicationDate: "2026-11-22",
  },
  { id: "innovation", name: "Innovation", label: "Innovation", comingSoon: true },
  { id: "itfm", name: "ITFM", label: "Cost", comingSoon: true },
];
const ctx = {
  products,
  t: (k: keyof typeof dictionaries.en) => dictionaries.en[k],
  language: "en" as const,
  now: new Date("2026-11-10T20:00:00Z"),
};

describe("terminal commands", () => {
  it("open by id or name returns an open action", () => {
    expect(runCommand("open radar", ctx).action).toEqual({ type: "open", id: "radar" });
    expect(runCommand("open tech radar", ctx).action).toEqual({ type: "open", id: "radar" });
    expect(runCommand("OPEN arch", ctx).action).toEqual({ type: "open", id: "archone" });
  });
  it("open with an unknown or ambiguous name prints a message and no action", () => {
    const r = runCommand("open i", ctx);
    expect(r.action).toBeUndefined();
    expect(r.lines[0]).toBe("No tool matches i");
  });
  it("info prints name, category, status and launch date", () => {
    const lines = runCommand("info archone", ctx).lines.join("\n");
    expect(lines).toContain("ArchONE");
    expect(lines).toContain("Enterprise Architecture");
    expect(lines).toContain("Coming soon");
    expect(lines).toContain("22 Nov 2026");
  });
  it("unknown commands report command not found", () => {
    expect(runCommand("sudo rm", ctx).lines).toEqual(["command not found: sudo"]);
  });
  it("lang, whoami and clear", () => {
    expect(runCommand("lang ar", ctx).action).toEqual({ type: "lang", language: "ar" });
    expect(runCommand("whoami", ctx).lines).toEqual(["guest"]);
    expect(runCommand("clear", ctx).action).toEqual({ type: "clear" });
  });
  it("ls lists every tool", () => {
    expect(runCommand("ls", ctx).lines).toHaveLength(products.length);
  });
  it("findProduct needs a unique prefix", () => {
    expect(findProduct("i", products)).toBeUndefined();
    expect(findProduct("itf", products)?.id).toBe("itfm");
  });
});

describe("tab completion", () => {
  it("completes commands and product ids", () => {
    expect(completeCommand("op", products)).toBe("open ");
    expect(completeCommand("open ra", products)).toBe("open radar");
    expect(completeCommand("info arc", products)).toBe("info archone");
  });
  it("extends to the common prefix when ambiguous, else leaves input", () => {
    expect(completeCommand("open i", products)).toBe("open i");
    expect(completeCommand("open in", products)).toBe("open innovation");
    expect(completeCommand("lang e", products)).toBe("lang e");
    expect(completeCommand("xyz", products)).toBe("xyz");
  });
});

describe("boot once per session", () => {
  const store = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };
  it("boots the first time, then never again in the same session", () => {
    const s = store();
    expect(shouldBoot({ animate: true, store: s })).toBe(true);
    markBooted(s);
    expect(s.getItem(BOOT_STORAGE_KEY)).toBe("1");
    expect(shouldBoot({ animate: true, store: s })).toBe(false);
  });
  it("never boots when motion is off or reduced", () => {
    expect(shouldBoot({ animate: false, store: store() })).toBe(false);
  });
  it("app gradient is deterministic per id", () => {
    expect(appGradient("radar")).toBe(appGradient("radar"));
    expect(appGradient("radar")).not.toBe(appGradient("itfm"));
  });
});
