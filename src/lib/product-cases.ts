type Pair = [string, string];
type CaseStudy = {
  question: Pair;
  input: Pair;
  result: Pair;
  subject: Pair;
  follow: Pair;
};
export const cases: Record<string, CaseStudy> = {
  archone: {
    question: [
      "ما الأنظمة التي تعتمد عليها معالجة الطلبات؟",
      "Which systems does order fulfilment depend on?",
    ],
    input: [
      "قدرة تنفيذ الطلبات، عملية التحقق، وتطبيقا المبيعات والمخزون.",
      "The fulfilment capability, the validation process, and the sales and inventory applications.",
    ],
    result: [
      "تكشف الخريطة أن التحقق يعتمد على المخزون. يُشرك الفريق مالك المخزون قبل تغيير العملية.",
      "The map shows validation depends on inventory. The team involves its owner before changing the process.",
    ],
    subject: [
      "خريطة القدرة والعملية والتطبيق",
      "a capability-to-application map",
    ],
    follow: [
      "كيف أتحقق من علاقات الاعتماد؟",
      "How do I validate a dependency?",
    ],
  },
  landscape: {
    question: [
      "هل نحتاج إلى تجديد اشتراك التطبيقين؟",
      "Should we renew both applications?",
    ],
    input: [
      "تطبيقان لإدارة طلبات الشراء، مالك كل تطبيق، والأنظمة التي تتبادل البيانات معه.",
      "Two purchasing applications, their owners and their upstream and downstream connections.",
    ],
    result: [
      "يظهر التداخل في اعتماد المشتريات. يراجع الفريق اعتماديات المالية قبل اقتراح دمج التطبيقين.",
      "The map reveals both tools handle purchase approvals. The team checks finance integrations before recommending consolidation.",
    ],
    subject: ["خريطة التطبيقات والاعتماديات", "an application dependency map"],
    follow: [
      "كيف أبدأ حصر التطبيقات؟",
      "How do I start an application inventory?",
    ],
  },
  radar: {
    question: [
      "متى ننقل تقنية من التقييم إلى التجربة؟",
      "When should a technology move from Assess to Trial?",
    ],
    input: [
      "تقنية لمعالجة الرسائل، نتائج اختبار أولي، ومالك للتجربة.",
      "A messaging technology, initial benchmark results and a pilot owner.",
    ],
    result: [
      "بعد نجاح اختبار الحمل، ينقل الفريق التقنية إلى «تجربة»، ويحدد مراجعة بعد أربعة أسابيع قبل قرار التبنّي.",
      "After a successful load test, the team moves it to Trial and schedules a four-week review before deciding on adoption.",
    ],
    subject: ["سجل قرارات الرادار", "a radar decision log"],
    follow: ["كيف أحدد حلقة التقنية؟", "How do I choose a technology ring?"],
  },
};
export function scopeDetails(tool: string, service: string, ar: boolean) {
  const idx = ar ? 0 : 1;
  const subject =
    cases[tool]?.subject[idx] ??
    (ar ? "نموذج من عمل الفريق" : "a sample of the team’s work");
  const descriptions: Record<string, Pair[]> = {
    implementation: [
      [
        "أحضر قائمة المالكين وعينة من بيانات الأداة.",
        "Bring owner names and a sample dataset.",
      ],
      ["إعداد أولي موثّق يضم", "A documented first configuration with"],
    ],
    rollout: [
      [
        "حدّد الفريق التجريبي ومسؤول الإطلاق.",
        "Identify a pilot team and rollout owner.",
      ],
      [
        "قائمة تحقق للإطلاق ومعيار قبول مبني على",
        "A launch checklist and acceptance criterion based on",
      ],
    ],
    training: [
      [
        "اختر حالة واحدة من عمل الفريق ليطبّقها المشاركون.",
        "Choose one team scenario for participants to work through.",
      ],
      ["تمرين عملي ينتج عنه", "A hands-on exercise that produces"],
    ],
    support: [
      [
        "جهّز وصف المشكلة وخطوات ظهورها.",
        "Bring a description of the issue and the steps leading to it.",
      ],
      [
        "خطة معالجة واختبار يتناول",
        "A remediation plan and verification exercise using",
      ],
    ],
  };
  const entry = descriptions[service] ?? descriptions["training"]!;
  return [entry[0]![idx], entry[1]![idx] + " " + subject + "."];
}
