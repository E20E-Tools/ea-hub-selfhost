import { cases, scopeDetails } from "./product-cases";
const pages = [
  "product",
  "services",
  "service-request",
  "contact",
  "about",
] as const;
const kinds = ["implementation", "rollout", "training", "support"];
export function archyPage(value: unknown) {
  const raw = (value ?? {}) as Record<string, unknown>;
  if (!pages.some((x) => x === raw["page"])) return null;
  const tool =
    typeof raw["tool"] === "string" && Object.hasOwn(cases, raw["tool"])
      ? raw["tool"]
      : "";
  const service =
    typeof raw["service"] === "string" && kinds.includes(raw["service"])
      ? raw["service"]
      : "";
  return { page: String(raw["page"]), tool, service };
}
export type ArchyPage = NonNullable<ReturnType<typeof archyPage>>;
export function pagePrompts(ctx: ArchyPage, ar: boolean) {
  if (ctx.service || ctx.page === "services" || ctx.page === "service-request")
    return ar
      ? ["ماذا أجهّز قبل البدء؟", "ما مخرجات الخدمة المحددة؟"]
      : ["What should I prepare?", "What will this service deliver?"];
  if (ctx.tool)
    return [
      cases[ctx.tool]!.follow[ar ? 0 : 1],
      ar ? "ما أول تمرين يمكنني تجربته؟" : "What exercise should I try first?",
    ];
  if (ctx.page === "contact")
    return ar
      ? ["كيف أتابع استفساري؟", "كيف أطلب دعم منتج؟"]
      : ["How do I track my enquiry?", "How do I request product support?"];
  return ar
    ? ["أي أداة تناسب فريقي؟", "كيف أبدأ التجربة؟"]
    : ["Which tool fits my team?", "How can I get started?"];
}
export function contextForAnswer(ctx: ArchyPage, ar: boolean) {
  const name =
    (
      {
        radar: "Tech Radar",
        landscape: "APM & App Landscape",
        archone: "ArchONE",
      } as Record<string, string>
    )[ctx.tool] ?? "";
  return [
    ctx.page,
    name,
    ctx.service,
    ...(ctx.service ? scopeDetails(ctx.tool, ctx.service, ar) : []),
  ]
    .filter(Boolean)
    .join(" · ");
}
