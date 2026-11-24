import type { BeneficiaryDetails } from "./beneficiary-metadata";

export type ProductCategory = string;

export type Product = {
  id: string;
  name: string;
  category: string;
  label: string;
  description: string;
  overview: string;
  features: string[];
  version?: string;
  whatsNew?: string;
  url: string;
  keywords: string;
  servicesEnabled?: boolean;
  comingSoon?: boolean;
  /** Stored admin flag; comingSoon is false once the launch moment has passed. */
  comingSoonSetting?: boolean;
  publicationDate?: string;
  image?: string;
  imageAlt?: string;
  imagePath?: string;
  /** Smaller rendition of `image` for cards; absent when no resizer is available. */
  imageThumb?: string;
  sortOrder?: number;
  /** English wording the admin can fill in; empty falls back to the Arabic field. */
  labelEn?: string;
  descriptionEn?: string;
  overviewEn?: string;
  featuresEn?: string[];
  imageAltEn?: string;
  whatsNewEn?: string;
  /** Source code repository link shown on the tool page. */
  githubUrl?: string;
  /** Optional catalog-owned beneficiary facts; empty fields mean not provided. */
  beneficiaryDetails?: BeneficiaryDetails;
};

export const products: Product[] = [
  {
    id: "archone",
    name: "ArchONE",
    category: "architecture",
    label: "البنية المؤسسية",
    description: "نمذجة البنية المؤسسية وتوثيق المكونات والتطبيقات.",
    overview:
      "ArchONE يبني مع فريقك نموذجًا واضحًا للمؤسسة: القدرات، العمليات، التطبيقات وعلاقاتها في مساحة واحدة، فتنتهي الاجتماعات بقرار موثّق بدل نقاش عام.",
    features: [
      "نمذجة القدرات والعمليات في طبقات واضحة",
      "ربط كل تطبيق بالقدرات والعمليات التي يخدمها",
      "كشف الفجوات والتكرار بين الإدارات",
      "لوحات جاهزة للعرض على الإدارة",
      "تصدير النماذج صورًا ومراجعات",
      "سجل تعديلات يوضّح من غيّر وماذا",
    ],
    url: "https://archone.e20e.tools/",
    keywords: "نمذجة قدرات عمليات توثيق architecture modeling",
  },
  {
    id: "landscape",
    name: "APM & App Landscape",
    category: "technology",
    label: "خريطة التقنيات",
    description: "دليل التقنيات والتطبيقات ومعلوماتهم التفصيلية.",
    overview:
      "Landscape يرسم صورة حيّة للتطبيقات والعلاقات بينها، فتعرف فورًا ما يعمل، وما يتكرر، وما يقترب من نهاية عمره، ومن يملك كل جزء.",
    features: [
      "خريطة تفاعلية للتطبيقات وعلاقاتها",
      "تصنيف حسب المجال والإدارة والحالة",
      "كشف التكرار والتداخل بين الأنظمة",
      "مسار البيانات بين الأنظمة",
      "بحث وتصفية سريعة حسب الطبقة",
      "تصدير الخريطة للاجتماعات والقرارات",
    ],
    url: "https://apm.e20e.tools/",
    keywords: "خريطة تطبيقات علاقات استكشاف technology map applications",
  },
  {
    id: "radar",
    name: "Tech Radar",
    category: "technology",
    label: "تقييم التقنيات",
    description: "تقييم التقنيات وتصنيفها: تبنٍّ، تجربة، تقييم، إيقاف.",
    overview:
      "Tech Radar يحوّل قرارات التقنية إلى ممارسة دورية: كل تقنية في مكان واضح على الرادار، مع سببها وتاريخها، فتتكرّر المراجعة في جلسة واحدة.",
    features: [
      "رادار بأربع حلقات: تبنٍّ، تجربة، تقييم، إيقاف",
      "بطاقة لكل تقنية مع السبب والتاريخ",
      "مراجعة دورية في جلسة واحدة",
      "تتبّع التغيّرات بين المراجعات",
      "توصيات مرتبطة بحالة التقنية",
      "تصدير الرادار للعروض",
    ],
    url: "https://radar.e20e.tools/",
    keywords: "رادار تقييم تبني تجربة تصنيف radar assessment",
  },
  {
    id: "platform",
    name: "EA Tool",
    category: "platform",
    label: "منصة متكاملة",
    description: "منصة E20E المتكاملة لإدارة البنية المؤسسية.",
    overview:
      "EA Tool تجمع نموذج المؤسسة وخريطة التقنيات والرادار في منصة واحدة: تبدأ من صورة واحدة وتنتهي بقرار موثّق. الإطلاق قريبًا.",
    features: [
      "نموذج المؤسسة وخريطة التقنيات في مكان واحد",
      "رادار التقنيات موصول بخريطة التطبيقات",
      "تقارير موحّدة لأصحاب القرار",
      "صلاحيات لعدة إدارات",
      "سجل قرارات وتاريخ مراجعات",
      "تكامل مع أدوات التصميم والإدارة",
    ],
    url: "https://platform.e20e.tools/",
    keywords: "منصة إدارة معمارية البنية المؤسسية enterprise platform e20e",
    comingSoon: true,
  },
];

export function getProduct(id: string): Product | undefined {
  return products.find((product) => product.id === id);
}
