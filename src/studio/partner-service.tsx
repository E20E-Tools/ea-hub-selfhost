import { BookOpen, BriefcaseBusiness, ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { JourneyHeading } from "./journey-heading";

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
            ? ar
              ? "الدورات التدريبية"
              : "Courses"
            : ar
              ? "الاستشارات"
              : "Consultations"
        }
        description={
          learning
            ? ar
              ? "اختر مجال التعلّم واطّلع على منهج الدورة لدى DT.Guide."
              : "Choose a subject and explore the syllabus at DT.Guide."
            : ar
              ? "جهّز سؤال فريقك ثم انتقل إلى خدمة الاستشارات لدى DT.Guide."
              : "Frame the decision your team needs to make, then visit the DT.Guide consultation service."
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
          <h2>{ar ? "قبل طلب الاستشارة" : "Prepare for the discussion"}</h2>
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
          ? ar
            ? "كل الدورات على DT.Guide"
            : "All courses on DT.Guide"
          : ar
            ? "انتقل إلى استشارات DT.Guide"
            : "Visit DT.Guide consultations"}
        <ArrowUpRight size={18} />
      </a>
    </main>
  );
}
