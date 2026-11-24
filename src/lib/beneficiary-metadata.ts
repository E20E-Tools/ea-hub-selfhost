import { z } from "zod";
import { pick, pickList, type Language } from "./language-core";

export const DISCOVERY_GOALS = [
  "architecture",
  "applications",
  "technology",
  "governance",
  "innovation",
  "cost",
] as const;
export const ORGANIZATION_SIZES = ["small", "medium", "large", "enterprise"] as const;
export const MATURITY_LEVELS = ["starting", "developing", "established"] as const;
export type DiscoveryGoal = (typeof DISCOVERY_GOALS)[number];
export type OrganizationSize = (typeof ORGANIZATION_SIZES)[number];
export type MaturityLevel = (typeof MATURITY_LEVELS)[number];

export type LocalText = { ar: string; en: string };
/** Enterprise-architecture layer a tool serves; "" means use the category default. */
export const EA_LAYERS = ["business", "applications", "data", "technology"] as const;
export type EaLayer = (typeof EA_LAYERS)[number];
export type LocalList = { ar: string[]; en: string[] };
export type BeneficiaryDetails = {
  operations?: { account:LocalText; inputs:LocalText; exchange:LocalText; reviewed:string };
  goals: DiscoveryGoal[];
  organizationSizes: OrganizationSize[];
  maturityLevels: MaturityLevel[];
  audience: LocalText;
  notFor: LocalText;
  prerequisites: LocalList;
  integrations: LocalList;
  limitations: LocalList;
  exampleOutput: LocalText;
  /** Optional per-tool purchase steps; coming-soon tools fall back to the shared default path. */
  purchaseSteps: LocalList;
  /** Short problem the tool solves, shown by the problem-to-tool design. */
  problem: LocalText;
  /** Optional EA layer override for the ea-layers design. */
  eaLayer: EaLayer | "";
  /** Real screenshots from inside the tool, shown on the product page (HTTPS images, max 6). */
  screenshots: Screenshot[];
};

/**
 * `url` is what the admin saved (library path or https link). `src` is the displayable
 * link the catalog adds on read (a signed link for library paths); it is never stored.
 */
export type Screenshot = { url: string; caption: LocalText; src?: string };
export const MAX_SCREENSHOTS = 6;

/**
 * A screenshot is an absolute HTTPS image link or a path in the site's image library
 * (e.g. "products/radar-1.png", signed when the catalog is read). Anything else is dropped.
 */
export function isScreenshotUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 1000) return false;
  if (/^[a-z0-9-]+\/[\w.-]+(?:\/[\w.-]+)*$/i.test(value) && !value.includes("..")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const text = z.object({ ar: z.string().trim().max(800), en: z.string().trim().max(800) });
const list = z.object({
  ar: z.array(z.string().trim().min(1).max(240)).max(12),
  en: z.array(z.string().trim().min(1).max(240)).max(12),
});
export const beneficiaryDetailsSchema = z.object({
  operations:z.object({account:text,inputs:text,exchange:text,reviewed:z.union([z.literal(""),z.iso.date()])}).optional(),
  goals: z.array(z.enum(DISCOVERY_GOALS)).max(DISCOVERY_GOALS.length),
  organizationSizes: z.array(z.enum(ORGANIZATION_SIZES)).max(ORGANIZATION_SIZES.length),
  maturityLevels: z.array(z.enum(MATURITY_LEVELS)).max(MATURITY_LEVELS.length),
  audience: text,
  notFor: text,
  prerequisites: list,
  integrations: list,
  limitations: list,
  exampleOutput: text,
  purchaseSteps: list.default({ ar: [], en: [] }),
  problem: z
    .object({ ar: z.string().trim().max(200), en: z.string().trim().max(200) })
    .default({ ar: "", en: "" }),
  eaLayer: z.enum(["", ...EA_LAYERS]).default(""),
  screenshots: z
    .array(
      z.object({
        url: z.string().trim().refine(isScreenshotUrl, "https image link"),
        caption: z
          .object({ ar: z.string().trim().max(160), en: z.string().trim().max(160) })
          .default({ ar: "", en: "" }),
      }),
    )
    .max(MAX_SCREENSHOTS)
    .default([]),
});

export const EMPTY_BENEFICIARY_DETAILS: BeneficiaryDetails = {
  goals: [],
  organizationSizes: [],
  maturityLevels: [],
  audience: { ar: "", en: "" },
  notFor: { ar: "", en: "" },
  prerequisites: { ar: [], en: [] },
  integrations: { ar: [], en: [] },
  limitations: { ar: [], en: [] },
  exampleOutput: { ar: "", en: "" },
  purchaseSteps: { ar: [], en: [] },
  problem: { ar: "", en: "" },
  eaLayer: "",
  screenshots: [],
};

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
}
function localText(value: unknown): LocalText {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    ar: typeof row["ar"] === "string" ? row["ar"].trim().slice(0, 800) : "",
    en: typeof row["en"] === "string" ? row["en"].trim().slice(0, 800) : "",
  };
}
function localList(value: unknown): LocalList {
  const textValue = localText(value);
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    ar: Array.isArray(row["ar"]) ? stringList(row["ar"]) : textValue.ar ? [textValue.ar] : [],
    en: Array.isArray(row["en"]) ? stringList(row["en"]) : textValue.en ? [textValue.en] : [],
  };
}
function allowed<T extends string>(value: unknown, values: readonly T[]): T[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter((item): item is T => typeof item === "string" && values.includes(item as T)),
        ),
      ]
    : [];
}

/** Public reads tolerate old rows and malformed optional metadata without inventing facts. */
export function normalizeBeneficiaryDetails(value: unknown): BeneficiaryDetails {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    ...(row["operations"] && typeof row["operations"]==="object" ? { operations:(()=>{
      const op=row["operations"] as Record<string,unknown>;
      return {account:localText(op["account"]),inputs:localText(op["inputs"]),exchange:localText(op["exchange"]),reviewed:typeof op["reviewed"]==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(op["reviewed"])?op["reviewed"]:""};
    })()}:{}),
    goals: allowed(row["goals"], DISCOVERY_GOALS),
    organizationSizes: allowed(row["organizationSizes"], ORGANIZATION_SIZES),
    maturityLevels: allowed(row["maturityLevels"], MATURITY_LEVELS),
    audience: localText(row["audience"]),
    notFor: localText(row["notFor"]),
    prerequisites: localList(row["prerequisites"]),
    integrations: localList(row["integrations"]),
    limitations: localList(row["limitations"]),
    exampleOutput: localText(row["exampleOutput"]),
    purchaseSteps: localList(row["purchaseSteps"]),
    problem: (() => {
      const v = localText(row["problem"]);
      return { ar: v.ar.slice(0, 200), en: v.en.slice(0, 200) };
    })(),
    eaLayer: EA_LAYERS.includes(row["eaLayer"] as EaLayer) ? (row["eaLayer"] as EaLayer) : "",
    screenshots: Array.isArray(row["screenshots"])
      ? (row["screenshots"] as unknown[])
          .map((item) => {
            const shot =
              item && typeof item === "object" ? (item as Record<string, unknown>) : {};
            const caption = localText(shot["caption"]);
            const src = shot["src"];
            return {
              url: typeof shot["url"] === "string" ? shot["url"].trim() : "",
              caption: { ar: caption.ar.slice(0, 160), en: caption.en.slice(0, 160) },
              ...(typeof src === "string" && /^https:\/\//i.test(src) ? { src } : {}),
            };
          })
          .filter((shot) => isScreenshotUrl(shot.url))
          .slice(0, MAX_SCREENSHOTS)
      : [],
  };
}

export type LocalizedBeneficiaryDetails = {
  goals: DiscoveryGoal[];
  organizationSizes: OrganizationSize[];
  maturityLevels: MaturityLevel[];
  audience: string;
  notFor: string;
  prerequisites: string[];
  integrations: string[];
  limitations: string[];
  exampleOutput: string;
  purchaseSteps: string[];
  screenshots: { url: string; caption: string }[];
};
export function localizeBeneficiaryDetails(
  value: unknown,
  language: Language,
): LocalizedBeneficiaryDetails {
  const details = normalizeBeneficiaryDetails(value);
  return {
    goals: details.goals,
    organizationSizes: details.organizationSizes,
    maturityLevels: details.maturityLevels,
    audience: pick(language, details.audience.ar, details.audience.en),
    notFor: pick(language, details.notFor.ar, details.notFor.en),
    prerequisites: pickList(language, details.prerequisites.ar, details.prerequisites.en),
    integrations: pickList(language, details.integrations.ar, details.integrations.en),
    limitations: pickList(language, details.limitations.ar, details.limitations.en),
    exampleOutput: pick(language, details.exampleOutput.ar, details.exampleOutput.en),
    purchaseSteps: pickList(language, details.purchaseSteps.ar, details.purchaseSteps.en),
    screenshots: details.screenshots
      .map((shot) => ({
        url: shot.src || (/^https:\/\//i.test(shot.url) ? shot.url : ""),
        caption: pick(language, shot.caption.ar, shot.caption.en),
      }))
      .filter((shot) => shot.url),
  };
}
