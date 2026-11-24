import type { Product } from "./products";
import type { Language } from "./language-core";
/** Reasons are literal catalog descriptions, never invented abilities or launch promises. */
export function archyContext(
  products: Product[],
  language: Language,
  path: string,
) {
  const available = products.filter((p) => !p.comingSoon);
  const id = /^\/product\/([^/]+)/.exec(path)?.[1];
  const focus = available.find((p) => p.id === id);
  const choices = (
    focus ? [focus, ...available.filter((p) => p.id !== id)] : available
  ).slice(0, 3);
  return choices.map((p) => ({
    id: p.id,
    name: p.name,
    reason: (language === "en" && p.descriptionEn) || p.description,
  }));
}
export function archyComparePrompt(names: string[], language: Language) {
  return language === "ar"
    ? `قارن بين ${names.join(" و ")} باستخدام خصائص الكتالوج، واسألني عن احتياجي قبل التوصية.`
    : `Compare ${names.join(" and ")} using catalog capabilities, and ask about my needs before recommending.`;
}
