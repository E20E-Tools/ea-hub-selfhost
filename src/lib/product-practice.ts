type Practice = { en: string[]; ar: string[]; source: string; url: string };
const architecture = {
  source: "The Open Group · ArchiMate 101",
  url: "https://archimate-community.pages.opengroup.org/workgroups/archimate-101/",
};
export const productPractice: Record<string, Practice> = {
  archone: {
    ...architecture,
    en: [
      "Choose one business capability, such as order fulfilment.",
      "Trace one process to its supporting applications and technology.",
      "The process owner can follow the map from the capability to its supporting applications.",
    ],
    ar: [
      "اختر قدرة مؤسسية واحدة مثل تنفيذ الطلبات.",
      "تتبّع عملية واحدة وصولًا إلى التطبيقات والتقنيات التي تدعمها.",
      "يستطيع مالك العملية تتبّع المسار من القدرة إلى التطبيقات الداعمة على الخريطة.",
    ],
  },
  platform: {
    ...architecture,
    en: [
      "Select a proposed architecture change.",
      "Identify the business activity, application and infrastructure it affects.",
      "Review that view with the decision owner and record the next action.",
    ],
    ar: [
      "اختر تغييرًا معماريًا قيد الدراسة.",
      "حدّد النشاط والتطبيق والبنية التقنية التي تتأثر به.",
      "اعرض العلاقات على صاحب القرار واتفق معه على الخطوة التالية.",
    ],
  },
  radar: {
    source: "Thoughtworks · Technology Radar",
    url: "https://www.thoughtworks.com/radar/faq",
    en: [
      "Pick one technology your team is considering.",
      "Add the technology to a ring and record the evidence behind your choice.",
      "The technology has a ring, a documented rationale and a review date.",
    ],
    ar: [
      "اختر تقنية واحدة يفكّر فريقك في استخدامها.",
      "أضف التقنية إلى الحلقة المناسبة وسجّل الدليل الذي يدعم اختيارك.",
      "للتقنية حلقة محددة وسبب موثّق وتاريخ للمراجعة.",
    ],
  },
  landscape: {
    source: "CIO Council · Application Rationalization Playbook",
    url: "https://www.cio.gov/assets/files/Application-Rationalization-Playbook.pdf",
    en: [
      "Gather the names and owners of two applications in one department.",
      "Add the two applications and map each to the business capability it supports.",
      "Your inventory shows whether the two applications support the same capability.",
    ],
    ar: [
      "جهّز اسمي تطبيقين من إدارة واحدة واسم مالك كل تطبيق.",
      "أضف التطبيقين واربط كل تطبيق بالقدرة المؤسسية التي يدعمها.",
      "يوضّح السجل ما إذا كان التطبيقان يدعمان القدرة نفسها.",
    ],
  },
  innovation: {
    source: "Strategyzer · Test Card",
    url: "https://www.strategyzer.com/library/validate-your-ideas-with-the-test-card",
    en: [
      "Turn an idea into a testable assumption.",
      "Choose a small experiment and a success threshold before starting.",
      "Compare the result with the threshold and decide what to change.",
    ],
    ar: [
      "حوّل الفكرة إلى فرضية قابلة للاختبار.",
      "حدّد تجربة صغيرة ومعيارًا للنجاح قبل البدء.",
      "قارن النتيجة بالمعيار وقرّر ما يحتاج إلى تغيير.",
    ],
  },
  itfm: {
    source: "FinOps Foundation · Allocation",
    url: "https://www.finops.org/framework/capabilities/allocation/",
    en: [
      "Select one service and one billing period.",
      "Separate directly attributable spend from costs shared across teams.",
      "Agree on a rule for dividing shared costs and review the result with budget owners.",
    ],
    ar: [
      "اختر خدمة واحدة وفترة فوترة محددة.",
      "افصل المصروفات المباشرة عن التكاليف المشتركة بين الفرق.",
      "اتفق على قاعدة لتوزيع التكلفة المشتركة وراجع الناتج مع مسؤولي الميزانيات.",
    ],
  },
};
