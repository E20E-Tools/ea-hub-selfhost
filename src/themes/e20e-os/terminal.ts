/** Pure E20E OS terminal: parsing, commands and tab completion. */
import type { Copy } from "@/lib/copy";
import { fill } from "@/lib/copy";
import type { Language } from "@/lib/language-core";
import { formatLaunchDate } from "../launch";

export type TermProduct = {
  id: string;
  name: string;
  label: string;
  comingSoon?: boolean | undefined;
  publicationDate?: string | undefined;
};
export type TermAction =
  | { type: "open"; id: string }
  | { type: "lang"; language: Language }
  | { type: "clear" };
export type TermContext = {
  products: TermProduct[];
  t: (key: keyof Copy) => string;
  language: Language;
  now: Date;
};
export type TermResult = { lines: string[]; action?: TermAction };

export const COMMANDS = [
  "help",
  "ls",
  "open",
  "info",
  "lang",
  "whoami",
  "date",
  "clear",
] as const;

/** Matches by exact id, exact name (case-insensitive), then unique prefix of either. */
export function findProduct(
  query: string,
  products: TermProduct[],
): TermProduct | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const exact = products.find(
    (p) => p.id.toLowerCase() === q || p.name.toLowerCase() === q,
  );
  if (exact) return exact;
  const starts = products.filter(
    (p) =>
      p.id.toLowerCase().startsWith(q) || p.name.toLowerCase().startsWith(q),
  );
  return starts.length === 1 ? starts[0] : undefined;
}

function status(p: TermProduct, ctx: TermContext): string {
  return p.comingSoon ? ctx.t("comingSoonBadge") : ctx.t("inspectorAvailable");
}

export function riyadhNow(now: Date, language: Language): string {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-GB", {
    timeZone: "Asia/Riyadh",
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);
}

export function runCommand(raw: string, ctx: TermContext): TermResult {
  const input = raw.trim();
  if (!input) return { lines: [] };
  const [cmdRaw = "", ...rest] = input.split(/\s+/);
  const cmd = cmdRaw.toLowerCase();
  const arg = rest.join(" ");
  switch (cmd) {
    case "help":
      return { lines: ctx.t("osTermHelp").split("\n") };
    case "ls": {
      const width = Math.max(...ctx.products.map((p) => p.id.length), 2) + 2;
      return {
        lines: ctx.products.map(
          (p) =>
            `${p.comingSoon ? "◌" : "●"} ${p.id.padEnd(width)}${p.name} — ${status(p, ctx)}`,
        ),
      };
    }
    case "open": {
      if (!arg) return { lines: ["usage: open <id|name>"] };
      const p = findProduct(arg, ctx.products);
      if (!p) return { lines: [fill(ctx.t("osTermNoMatch"), arg)] };
      return {
        lines: [fill(ctx.t("osTermOpening"), p.name)],
        action: { type: "open", id: p.id },
      };
    }
    case "info": {
      if (!arg) return { lines: ["usage: info <id>"] };
      const p = findProduct(arg, ctx.products);
      if (!p) return { lines: [fill(ctx.t("osTermNoMatch"), arg)] };
      const lines = [
        `name:     ${p.name}`,
        `category: ${p.label}`,
        `status:   ${status(p, ctx)}`,
      ];
      if (p.comingSoon && p.publicationDate) {
        lines.push(
          `launch:   ${formatLaunchDate(p.publicationDate, ctx.language)}`,
        );
      }
      return { lines };
    }
    case "lang": {
      const next = arg.toLowerCase();
      if (next !== "ar" && next !== "en")
        return { lines: ["usage: lang ar|en"] };
      return {
        lines: [fill(ctx.t("osTermLang"), next)],
        action: { type: "lang", language: next },
      };
    }
    case "whoami":
      return { lines: ["guest"] };
    case "date":
      return { lines: [riyadhNow(ctx.now, ctx.language)] };
    case "clear":
      return { lines: [], action: { type: "clear" } };
    default:
      return { lines: [`command not found: ${cmdRaw}`] };
  }
}

/** Tab completion: command names, then product ids after open/info. Returns input unchanged when ambiguous. */
export function completeCommand(
  input: string,
  products: TermProduct[],
): string {
  const m = /^(\s*)(\S*)(\s+)?(\S*)$/.exec(input);
  if (!m) return input;
  const [, lead = "", cmd = "", space, partial = ""] = m;
  const commonPrefix = (items: string[]) =>
    items.reduce((acc, item) => {
      let i = 0;
      while (i < acc.length && acc[i] === item[i]) i++;
      return acc.slice(0, i);
    });
  if (!space) {
    const hits = COMMANDS.filter((c) => c.startsWith(cmd.toLowerCase()));
    if (hits.length === 1) return `${lead}${hits[0]} `;
    return hits.length ? `${lead}${commonPrefix([...hits])}` : input;
  }
  if (!["open", "info"].includes(cmd.toLowerCase())) return input;
  const hits = products
    .map((p) => p.id)
    .filter((id) => id.startsWith(partial.toLowerCase()));
  if (hits.length === 1) return `${lead}${cmd} ${hits[0]}`;
  if (hits.length > 1) return `${lead}${cmd} ${commonPrefix(hits)}`;
  return input;
}
