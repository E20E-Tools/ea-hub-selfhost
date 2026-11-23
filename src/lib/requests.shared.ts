import { z } from "zod";

/** Unified requests & contact: one store for every request type. Error messages are copy keys. */
export const REQUEST_TYPES = [
  "new",
  "feature",
  "support",
  "general",
  "service",
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
/** Types offered as cards on /request; enterprise service requests have their own page. */
export const PUBLIC_REQUEST_TYPES = [
  "new",
  "feature",
  "support",
  "general",
] as const;
export type PublicRequestType = (typeof PUBLIC_REQUEST_TYPES)[number];
/** Enterprise Services request choices (match the four service cards). */
export const SERVICE_KINDS = [
  "implementation",
  "rollout",
  "training",
  "support",
] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];
export const TEAM_SIZES = ["1-10", "11-50", "51-200", "200+"] as const;
export const SERVICE_TIMELINES = ["asap", "1-3m", "3-6m", "exploring"] as const;
export const URGENCIES = ["low", "normal", "urgent"] as const;
export type Urgency = (typeof URGENCIES)[number];
export const OPEN_REQUEST_STATUSES = ["new", "in_progress"] as const;
export function needsVisitorReply(request: { status: string; pending_question?: string | null }) {
  return OPEN_REQUEST_STATUSES.some((status) => status === request.status) && Boolean(request.pending_question);
}

export const REQUEST_STATUSES = [
  "new",
  "in_progress",
  "resolved",
  "rejected",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export function isRequestType(value: unknown): value is RequestType {
  return (
    typeof value === "string" &&
    (REQUEST_TYPES as readonly string[]).includes(value)
  );
}
export function isPublicRequestType(
  value: unknown,
): value is PublicRequestType {
  return (
    typeof value === "string" &&
    (PUBLIC_REQUEST_TYPES as readonly string[]).includes(value)
  );
}

const phonePattern = /^$|^[+\d][\d\s()-]*$/;

export const requestSchema = z
  .object({
    source:z.literal("contact").optional(),
    requestId: z.string().uuid(),
    type: z.enum(REQUEST_TYPES),
    name: z.string().trim().min(2, "rqErrName").max(100),
    email: z.string().trim().email("rqErrEmail").max(255).toLowerCase(),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(phonePattern, "rqErrPhone")
      .default(""),
    company: z.string().trim().max(150).default(""),
    need: z.string().trim().min(5, "rqErrMessage").max(2000),
    productId: z.string().trim().max(80).default(""),
    urgency: z.string().trim().max(10).default(""),
    impact: z.string().trim().max(1000).default(""),
    recommendation: z.unknown().optional(),
    services: z
      .array(z.enum(SERVICE_KINDS))
      .max(SERVICE_KINDS.length * 2)
      .default([]),
    tools: z.array(z.string().trim().min(1).max(80)).max(60).default([]),
    exercise:z.string().trim().max(2000).default(""),
    teamSize: z.union([z.literal(""), z.enum(TEAM_SIZES)]).default(""),
    timeline: z.union([z.literal(""), z.enum(SERVICE_TIMELINES)]).default(""),
    website: z.string().max(200).default(""),
  })
  .superRefine((value, ctx) => {
    if ((value.type !== "general" || value.source !== "contact") && value.need.length < 20)
      ctx.addIssue({ code: "custom", path: ["need"], message: "rqErrMessage" });
    if (
      (value.type === "feature" || value.type === "support") &&
      !value.productId
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["productId"],
        message: "rqErrProduct",
      });
    }
    // Phone is relevant to live support and service coordination; other types keep it optional.
    if (
      (value.type === "support" || value.type === "service") &&
      value.phone.replace(/\D/g, "").length < 7
    )
      ctx.addIssue({ code: "custom", path: ["phone"], message: "rqErrPhone" });
    if (value.type === "support") {
      if (!(URGENCIES as readonly string[]).includes(value.urgency))
        ctx.addIssue({
          code: "custom",
          path: ["urgency"],
          message: "rqErrUrgency",
        });
    }
    // Enterprise service requests need the organisation and at least one service.
    if (value.type === "service") {
      if (value.company.length < 2)
        ctx.addIssue({
          code: "custom",
          path: ["company"],
          message: "srErrOrg",
        });
      if (value.services.length === 0)
        ctx.addIssue({
          code: "custom",
          path: ["services"],
          message: "srErrServices",
        });
    }
  });
export type RequestEntry = z.infer<typeof requestSchema>;

/** Which optional extras each type keeps; everything else is dropped before storing. */
export function normaliseRequest(entry: RequestEntry) {
  return {
    ...entry,
    // A selected catalog tool is useful context for general/new requests too.
    productId: entry.productId,
    urgency: entry.type === "support" ? entry.urgency : "",
    impact: entry.type === "feature" ? entry.impact : "",
    details:
      entry.type === "service"
        ? {
            ...(entry.exercise && {exercise:entry.exercise}),
            services: [...new Set(entry.services)],
            tools: [...new Set(entry.tools)],
            teamSize: entry.teamSize,
            timeline: entry.timeline,
          }
        : {},
    allowImages: entry.type !== "general" && entry.type !== "service",
    allowAnalysis: entry.type === "new",
  };
}

/* ---------------- Support us ---------------- */

export const OFFER_TYPES = [
  "partnership",
  "financial",
  "contribution",
] as const;
export type OfferType = (typeof OFFER_TYPES)[number];
export const OFFER_STATUSES = [
  "new",
  "replied",
  "follow_up",
  "cancelled",
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];
export const ORG_TYPES = [
  "company",
  "government",
  "nonprofit",
  "academic",
] as const;
export const PARTNER_AREAS = [
  "integration",
  "codevelopment",
  "distribution",
  "sponsorship",
  "research",
] as const;
export const FINANCIAL_KINDS = ["once", "recurring", "sponsor_tool"] as const;
export const AMOUNT_RANGES = ["", "lt1k", "1k-5k", "5k-20k", "gt20k"] as const;
export const CURRENCIES = ["SAR", "USD"] as const;
export const SKILLS = [
  "frontend",
  "backend",
  "design",
  "ea",
  "qa",
  "docs",
  "data_ai",
] as const;
export const HOURS = ["lt5", "5-10", "10-20", "gt20"] as const;

const base = {
  requestId: z.string().uuid(),
  name: z.string().trim().min(2, "rqErrName").max(150),
  email: z.string().trim().email("rqErrEmail").max(255).toLowerCase(),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(phonePattern, "rqErrPhone")
    .default(""),
  message: z.string().trim().max(2000).default(""),
  website: z.string().max(200).default(""),
};

const httpsLink = z
  .string()
  .trim()
  .max(300)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !!url.hostname.includes(".");
    } catch {
      return false;
    }
  }, "spErrLink");

export const supportSchema = z.discriminatedUnion("offerType", [
  z.object({
    ...base,
    offerType: z.literal("partnership"),
    organization: z.string().trim().min(2, "spErrOrg").max(150),
    orgType: z.enum(ORG_TYPES, { message: "spErrOrgType" }),
    jobTitle: z.string().trim().max(100).default(""),
    area: z.enum(PARTNER_AREAS, { message: "spErrArea" }),
  }),
  z.object({
    ...base,
    offerType: z.literal("financial"),
    organization: z.string().trim().max(150).default(""),
    kind: z.enum(FINANCIAL_KINDS, { message: "spErrKind" }),
    amount: z.enum(AMOUNT_RANGES).default(""),
    currency: z.enum(CURRENCIES).default("SAR"),
    productId: z.string().trim().max(80).default(""),
  }),
  z.object({
    ...base,
    offerType: z.literal("contribution"),
    skills: z.array(z.enum(SKILLS)).min(1, "spErrSkills").max(SKILLS.length),
    hours: z.enum(HOURS, { message: "spErrHours" }),
    links: z.array(httpsLink).max(3).default([]),
    interest: z.string().trim().max(200).default(""),
  }),
]);
export type SupportEntry = z.infer<typeof supportSchema>;

/** Splits a validated offer into the stored columns and its typed details. */
export function offerRow(entry: SupportEntry) {
  const { requestId, name, email, phone, message, offerType } = entry;
  const common = {
    id: requestId,
    offer_type: offerType,
    name,
    email,
    phone,
    message,
  };
  if (entry.offerType === "partnership")
    return {
      ...common,
      organization: entry.organization,
      details: {
        orgType: entry.orgType,
        jobTitle: entry.jobTitle,
        area: entry.area,
      },
    };
  if (entry.offerType === "financial")
    return {
      ...common,
      organization: entry.organization,
      details: {
        kind: entry.kind,
        amount: entry.amount,
        currency: entry.currency,
        productId: entry.productId,
      },
    };
  return {
    ...common,
    organization: "",
    details: {
      skills: entry.skills,
      hours: entry.hours,
      links: entry.links,
      interest: entry.interest,
    },
  };
}

/** CSV cell that neutralises spreadsheet formulas. */
export function csvCell(value: string) {
  return `"${(/^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
}
export function toCsv(header: string[], rows: string[][]) {
  return (
    "\ufeff" +
    [header.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join(
      "\r\n",
    )
  );
}
