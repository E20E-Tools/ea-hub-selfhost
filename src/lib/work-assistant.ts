import { z } from "zod";
export const features = ["summary", "start", "review", "ask", "issue"] as const;
export type Feature = (typeof features)[number];
export const names = {
  summary: ["ملخص قرار الفريق", "Team decision brief"],
  start: ["ساعدني أبدأ", "Help me start"],
  review: ["راجع بطاقتي", "Review my card"],
  ask: ["اسأل بيانات هذا الجهاز", "Ask this device’s records"],
  issue: ["جهّز تحديث الشهر", "Draft the monthly update"],
} as const;
export const sections = {
  summary: [
    ["الهدف ومعيار النجاح", "Goal and success criterion"],
    ["نتائج المحاولات وآراء الفريق", "Attempts and team feedback"],
  ],
  start: [
    ["اسم المنتج ونوع البطاقة", "Product and card type"],
    ["اسم العنصر والمسؤول والهدف", "Item name, owner and goal"],
  ],
  review: [
    ["اسم المنتج ونوع البطاقة", "Product and card type"],
    [
      "حقول البطاقة بما فيها المسؤول ونص المسودة",
      "Card fields including owner and draft text",
    ],
  ],
  ask: [
    ["سؤال المستخدم", "Visitor question"],
    ["عناوين السجلات المطابقة", "Matching record titles"],
  ],
  issue: [
    ["شهر النشرة", "Issue month"],
    ["التحديثات المنشورة وروابطها", "Published updates and links"],
  ],
} as const;
const rule = z.object({
  enabled: z.boolean(),
  context: z.boolean(),
  content: z.boolean(),
});
export const policySchema = z.object({
  summary: rule,
  start: rule,
  review: rule,
  ask: rule,
  issue: rule,
});
export type Policy = z.infer<typeof policySchema>;
const local = { enabled: true, context: false, content: false };
export const initialPolicy: Policy = {
  summary: local,
  start: local,
  review: local,
  ask: local,
  issue: local,
};
export const inputSchema = z.object({
  feature: z.enum(features),
  lang: z.enum(["ar", "en"]),
  context: z.string().max(1200),
  content: z.string().max(8000),
});
export type WorkInput = z.infer<typeof inputSchema>;
export function permittedFields(input: WorkInput, policy: Policy) {
  const rule = policy[input.feature];
  if (!rule.enabled) return {};
  return {
    ...(rule.context && input.context ? { context: input.context } : {}),
    ...(rule.content && input.content ? { content: input.content } : {}),
  };
}
