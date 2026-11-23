import type { Product } from "./products";
import {
  normalizeBeneficiaryDetails,
  type DiscoveryGoal,
  type MaturityLevel,
  type OrganizationSize,
} from "./beneficiary-metadata";
import { pick, type Language } from "./language-core";

export type DiscoveryAnswers = {
  goal: DiscoveryGoal | "";
  organizationSize: OrganizationSize | "";
  maturity: MaturityLevel | "";
};

/** Search terms only locate literal catalog evidence; they are not a compatibility score. */
const GOAL_TERMS: Record<DiscoveryGoal, { ar: string[]; en: string[] }> = {
  architecture: {
    ar: ["معمارية", "البنية", "المؤسسية", "القدرات", "العمليات", "نمذجة"],
    en: ["architecture", "capabilit", "process", "model"],
  },
  applications: {
    ar: [
      "خريطة التقنيات",
      "خريطة التطبيقات",
      "التطبيقات وعلاقاتها",
      "التطبيقات والعلاقات",
      "العلاقات بينها",
      "التداخل بين الأنظمة",
      "مسار البيانات",
    ],
    en: [
      "application landscape",
      "applications and their relationships",
      "applications and how they relate",
      "application map",
      "technology landscape",
      "overlap between systems",
      "data flow",
    ],
  },
  technology: {
    ar: ["التقنيات", "التقنية", "رادار"],
    en: ["technolog", "radar"],
  },
  governance: {
    ar: ["حوكمة", "صلاحيات", "سجل", "مراجعات", "قرارات"],
    en: ["governance", "permission", "audit", "review", "decision"],
  },
  innovation: {
    ar: ["ابتكار", "تجربة"],
    en: ["innovation", "experiment", "trial"],
  },
  cost: {
    ar: ["تكلفة", "تكاليف", "مالية", "ميزانية"],
    en: ["cost", "financial", "budget", "itfm"],
  },
};

export type DiscoveryEvidence = {
  field: "name" | "label" | "description" | "overview" | "feature" | "metadata";
  /** Exact visitor-facing catalog text; empty only for an explicit metadata-goal match. */
  text: string;
  matchedTerm: string;
};

export type DiscoveryMatch = {
  product: Product;
  evidence: DiscoveryEvidence[];
  matchedTerms: string[];
  organizationFit: boolean | null;
  maturityFit: boolean | null;
};

function containsTerm(text: string, term: string): boolean {
  return text.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}

type EvidenceCandidate = {
  field: Exclude<DiscoveryEvidence["field"], "metadata">;
  text: string;
  searchText: string;
};

function evidenceCandidates(product: Product, language: Language): EvidenceCandidate[] {
  const fields: EvidenceCandidate[] = [
    { field: "name", text: product.name, searchText: product.name },
    {
      field: "label",
      text: pick(language, product.label, product.labelEn ?? ""),
      searchText: `${product.label} ${product.labelEn ?? ""}`,
    },
    {
      field: "description",
      text: pick(language, product.description, product.descriptionEn ?? ""),
      searchText: `${product.description} ${product.descriptionEn ?? ""}`,
    },
    {
      field: "overview",
      text: pick(language, product.overview, product.overviewEn ?? ""),
      searchText: `${product.overview} ${product.overviewEn ?? ""}`,
    },
  ];
  const featureCount = Math.max(product.features.length, product.featuresEn?.length ?? 0);
  for (let index = 0; index < featureCount; index += 1) {
    const ar = product.features[index] ?? "";
    const en = product.featuresEn?.[index] ?? "";
    fields.push({
      field: "feature",
      text: pick(language, ar, en),
      searchText: `${ar} ${en}`,
    });
  }
  return fields.filter((field) => field.text.trim() && field.searchText.trim());
}

/** Ask only questions for which at least one available tool has explicit catalog facts. */
export function discoveryCriteria(products: Product[]) {
  const available = products.filter((product) => !product.comingSoon);
  return {
    organizationSize: available.some(
      (product) =>
        normalizeBeneficiaryDetails(product.beneficiaryDetails).organizationSizes.length > 0,
    ),
    maturity: available.some(
      (product) =>
        normalizeBeneficiaryDetails(product.beneficiaryDetails).maturityLevels.length > 0,
    ),
  };
}

/**
 * Provider-free discovery grounded in exact current product fields. A category or keyword
 * alone never qualifies a tool, and explicit size/maturity mismatches are excluded.
 */
export function discoverProducts(
  products: Product[],
  answers: DiscoveryAnswers,
  language: Language,
  options: { includeComingSoon?: boolean } = {},
): DiscoveryMatch[] {
  const goal = answers.goal;
  if (!goal) return [];
  const terms = [...GOAL_TERMS[goal].ar, ...GOAL_TERMS[goal].en];
  const matches = products.flatMap((product): DiscoveryMatch[] => {
    if (product.comingSoon && !options.includeComingSoon) return [];
    const details = normalizeBeneficiaryDetails(product.beneficiaryDetails);
    const organizationFit = answers.organizationSize
      ? details.organizationSizes.length
        ? details.organizationSizes.includes(answers.organizationSize)
        : null
      : null;
    const maturityFit = answers.maturity
      ? details.maturityLevels.length
        ? details.maturityLevels.includes(answers.maturity)
        : null
      : null;
    if (organizationFit === false || maturityFit === false) return [];

    const evidence: DiscoveryEvidence[] = details.goals.includes(goal)
      ? [{ field: "metadata", text: "", matchedTerm: goal }]
      : [];
    for (const candidate of evidenceCandidates(product, language)) {
      const matchedTerm = terms.find((term) => containsTerm(candidate.searchText, term));
      if (matchedTerm) evidence.push({ ...candidate, matchedTerm });
    }
    const uniqueEvidence = evidence
      .filter(
        (item, index, all) =>
          all.findIndex((other) => other.field === item.field && other.text === item.text) ===
          index,
      )
      .slice(0, 4);
    if (!uniqueEvidence.length) return [];
    return [
      {
        product,
        evidence: uniqueEvidence,
        matchedTerms: [...new Set(uniqueEvidence.map((item) => item.matchedTerm))],
        organizationFit,
        maturityFit,
      },
    ];
  });
  return matches.sort((a, b) => {
    if (Boolean(a.product.comingSoon) !== Boolean(b.product.comingSoon))
      return a.product.comingSoon ? 1 : -1;
    const aKnownFits = Number(a.organizationFit === true) + Number(a.maturityFit === true);
    const bKnownFits = Number(b.organizationFit === true) + Number(b.maturityFit === true);
    if (aKnownFits !== bKnownFits) return bKnownFits - aKnownFits;
    if (a.evidence.length !== b.evidence.length) return b.evidence.length - a.evidence.length;
    return (a.product.sortOrder ?? 0) - (b.product.sortOrder ?? 0);
  });
}

export function planningPhases(
  systems: number,
  users: number,
  weeks: number,
): { discovery: number; pilot: number; review: number } {
  const safeSystems = Math.min(500, Math.max(1, Math.round(systems)));
  const safeUsers = Math.min(100000, Math.max(1, Math.round(users)));
  const safeWeeks = Math.min(52, Math.max(2, Math.round(weeks)));
  const complexity = Math.min(
    0.35,
    Math.log10(safeSystems + 1) * 0.08 + Math.log10(safeUsers + 1) * 0.04,
  );
  const discovery = Math.max(1, Math.round(safeWeeks * (0.2 + complexity)));
  const review = Math.max(1, Math.round(safeWeeks * 0.2));
  return { discovery, pilot: Math.max(1, safeWeeks - discovery - review), review };
}
