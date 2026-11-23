import type { Product } from "./catalog";

export const ROADMAP_YEARS = [2026, 2027] as const;
export type RoadmapPeriod = { id: string; year: number; quarter: number };
export type RoadmapPhase = "unrecorded" | "plan" | "pilot" | "adopt" | "optimize" | "conditional";
export const ROADMAP_PHASES: Record<
  RoadmapPhase,
  { label: string; detail: string; labelEn: string; detailEn: string }
> = {
  unrecorded: {
    label: "—",
    detail: "لا توجد بيانات تاريخية معتمدة",
    labelEn: "—",
    detailEn: "No confirmed historical data",
  },
  plan: {
    label: "تخطيط",
    detail: "تحديد الاحتياج والنطاق وتجهيز البيانات",
    labelEn: "Plan",
    detailEn: "Agree the need and scope, prepare the data",
  },
  pilot: {
    label: "تجربة",
    detail: "تجربة محدودة وتقييم النتائج",
    labelEn: "Pilot",
    detailEn: "A limited trial with results assessed",
  },
  adopt: {
    label: "تبنّي",
    detail: "توسيع الاستخدام بعد نجاح التجربة",
    labelEn: "Adopt",
    detailEn: "Wider use once the pilot succeeds",
  },
  optimize: {
    label: "تحسين",
    detail: "مراجعة الأثر وتحسين الاستخدام",
    labelEn: "Improve",
    detailEn: "Review the impact and improve usage",
  },
  conditional: {
    label: "عند الإتاحة",
    detail: "تجربة مشروطة بإتاحة الأداة؛ ليست موعد إطلاق",
    labelEn: "When available",
    detailEn: "A trial conditional on the tool being available; not a release date",
  },
};

/** Phase wording in the visitor's language. */
export function roadmapPhaseLabel(phase: RoadmapPhase, language: "ar" | "en"): string {
  return language === "en" ? ROADMAP_PHASES[phase].labelEn : ROADMAP_PHASES[phase].label;
}

export function roadmapPhaseDetail(phase: RoadmapPhase, language: "ar" | "en"): string {
  return language === "en" ? ROADMAP_PHASES[phase].detailEn : ROADMAP_PHASES[phase].detail;
}

export function roadmapPeriods(year?: number): RoadmapPeriod[] {
  return ROADMAP_YEARS.filter((value) => year === undefined || value === year).flatMap((value) =>
    [1, 2, 3, 4].map((quarter) => ({ id: `${value}-Q${quarter}`, year: value, quarter })),
  );
}

// Planning suggestions only: never infer actual releases or historical completion.
export function proposedPhase(
  product: Pick<Product, "comingSoon">,
  period: RoadmapPeriod,
): RoadmapPhase {
  if (period.year === 2026) return period.quarter < 4 ? "unrecorded" : "plan";
  if (period.year !== 2027) return "unrecorded";
  if (product.comingSoon) return period.quarter < 3 ? "plan" : "conditional";
  return period.quarter === 1 ? "pilot" : period.quarter === 2 ? "adopt" : "optimize";
}

export function buildTechnologyRoadmap(products: Product[], year?: number) {
  const periods = roadmapPeriods(year);
  return products.map((product) => ({
    product,
    milestones: periods.map((period) => ({ ...period, phase: proposedPhase(product, period) })),
  }));
}
