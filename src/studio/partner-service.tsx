import { BookOpen, BriefcaseBusiness, ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { JourneyHeading } from "./journey-heading";
import { dictionaries } from "@/lib/copy";

const courses = [
  [
    "دورة المعماري المؤسسي",
    "Enterprise Architect Course",
    "enterprise-architect-course",
  ],
  ["الإدارة المالية للتقنية", "FinOps Course", "finops-course-arabic"],
  [
    "استراتيجية الحوسبة السحابية",
    "Cloud Computing Strategy",
    "cloud-computing-strategy",
  ],
];
export function PartnerService({ learning }: { learning: boolean }) {
  const { language, dir } = useLanguage();
  const ar = language === "ar";
  return (
    <main className="bx-page ea-workspace ea-partner" dir={dir}>
      <JourneyHeading
        icon={learning ? BookOpen : BriefcaseBusiness}
        title={
          learning
            ? dictionaries[ar ? "ar" : "en"].partnerServiceCourses
            : dictionaries[ar ? "ar" : "en"].affiliatesConsultations
        }
        description={
          learning
            ? dictionaries[ar ? "ar" : "en"].partnerServiceChooseASubjectAnd
            : dictionaries[ar ? "ar" : "en"].partnerServiceFrameTheDecisionYour
        }
      />
      {learning ? (
        <div className="ea-course-list">
          {courses.map(([arabic, english, slug]) => (
            <a key={slug} href={"https://www.dt.guide/courses/" + slug + "/"}>
              <BookOpen size={20} />
              <strong>{ar ? arabic : english}</strong>
              <ArrowUpRight size={18} />
            </a>
          ))}
        </div>
      ) : (
        <section className="bx-panel">
          <h2>
            {
              dictionaries[ar ? "ar" : "en"]
                .partnerServicePrepareForTheDiscussion
            }
          </h2>
          <ol className="ea-prep">
            {(ar
              ? [
                  "اكتب القرار الذي تحتاج إلى اتخاذه.",
                  "لخّص الوضع الحالي والقيود التي تؤثر في القرار.",
                  "حدّد النتيجة التي تريد الخروج بها من الجلسة.",
                ]
              : [
                  "Write down the decision you need to make.",
                  "Summarize the current situation and constraints.",
                  "Define the outcome you want from the conversation.",
                ]
            ).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      )}
      <a
        className="ea-partner-action"
        href={
          learning
            ? "https://www.dt.guide/courses/"
            : "https://www.dt.guide/itconsultations/"
        }
      >
        {learning
          ? dictionaries[ar ? "ar" : "en"].partnerServiceAllCoursesOnDt
          : dictionaries[ar ? "ar" : "en"]
              .partnerServiceVisitDtGuideConsultations}
        <ArrowUpRight size={18} />
      </a>
    </main>
  );
}
