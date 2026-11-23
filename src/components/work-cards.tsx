import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "./ui/button";
import { CloudOption, useWorkPolicy } from "./work-assistant";
import { allTrials } from "@/lib/team-trials";
import { productPractice } from "@/lib/product-practice";
const cardSchema = z.object({
  title: z.string(),
  owner: z.string(),
  goal: z.string(),
  text: z.string(),
});
type Card = z.infer<typeof cardSchema>;
const blank: Card = { title: "", owner: "", goal: "", text: "" };
const prefix = "ea-work-card:v1:";
function read(id: string) {
  const raw = localStorage.getItem(prefix + id);
  return raw ? cardSchema.parse(JSON.parse(raw)) : blank;
}
const kinds: Record<string, readonly [string, string]> = {
  landscape: ["تطبيق", "Application"],
  radar: ["تقنية", "Technology"],
  archone: ["قدرة مؤسسية", "Business capability"],
};
export function WorkCard({
  id,
  name,
  ar,
}: {
  id: string;
  name: string;
  ar: boolean;
}) {
  const policy = useWorkPolicy().data,
    [card, set] = useState<Card>(blank),
    [review, check] = useState(false),
    [status, note] = useState(""),
    [ready, loaded] = useState(false);
  const l = (a: string, e: string) => (ar ? a : e);
  useEffect(() => {
    try {
      set(read(id));
      loaded(true);
    } catch {
      note(ar ? "تعذرت قراءة المسودة" : "Draft could not be loaded");
    }
  }, [id, ar]);
  if (!policy?.start.enabled && !policy?.review.enabled) return null;
  const kind = (kinds[id] ?? ["عنصر", "Item"])[ar ? 0 : 1]!,
    practice = productPractice[id]?.[ar ? "ar" : "en"] ?? [];
  function edit(key: keyof Card, v: string) {
    set({ ...card, [key]: v });
    check(false);
    note("");
  }
  const context = name + " · " + kind;
  const answers = [card.title, card.owner, card.goal]
    .filter(Boolean)
    .join("\n");
  const gap = !card.title
    ? l(
        "أضف اسمًا لتسهيل العثور على البطاقة.",
        "Give the card a name so the team can find it.",
      )
    : !card.owner
      ? l(
          "حدّد المسؤول عن متابعة النتيجة.",
          "Identify who will follow up on the outcome.",
        )
      : !card.goal
        ? l(
            "حدّد نتيجة قابلة للتحقق قبل المراجعة.",
            "Define a verifiable outcome before review.",
          )
        : !card.text
          ? l(
              "أضف وصفًا وخطوة تحقق.",
              "Add a description and a verification step.",
            )
          : practice[2]
            ? l("تحقّق من معيار المنتج: ", "Check the product criterion: ") +
              practice[2]
            : l(
                "راجع الوصف مع المسؤول وأرفق دليلًا على النتيجة المطلوبة.",
                "Review the description with the owner and add evidence for the intended outcome.",
              );
  return (
    <details id="archy-work-card" className="bx-panel">
      <summary>{l("بطاقة عمل مع Archy", "Work card with Archy")}</summary>
      <div className="grid gap-3 p-3">
        <p>
          {l(
            "مسودة واحدة لهذا المنتج محفوظة على هذا الجهاز.",
            "One working draft for this product, saved on this device.",
          )}
        </p>
        {(["title", "owner", "goal"] as const).map((k, i) => (
          <label key={k}>
            {
              [
                l("اسم العنصر", "Item name") + " · " + kind,
                l("المسؤول (اختياري)", "Owner (optional)"),
                l("ما النتيجة المطلوبة؟", "What outcome do you need?"),
              ][i]
            }
            <input
              className="block w-full rounded border p-2"
              maxLength={300}
              value={card[k]}
              onChange={(e) => edit(k, e.target.value)}
            />
          </label>
        ))}
        {policy?.start.enabled && (
          <>
            <Button
              disabled={!card.title.trim()}
              onClick={() =>
                edit(
                  "text",
                  [
                    kind + " · " + card.title,
                    card.goal && l("الهدف", "Goal") + " · " + card.goal,
                    card.owner && l("المسؤول", "Owner") + " · " + card.owner,
                    ...practice,
                  ]
                    .filter(Boolean)
                    .join("\n"),
                )
              }
            >
              {l("جهّز مسودة", "Prepare draft")}
            </Button>
            <CloudOption
              key={"start" + answers + ar}
              feature="start"
              ar={ar}
              context={context}
              content={answers}
              onApply={(v) => edit("text", v)}
            />
          </>
        )}
        <label>
          {l("مسودتي", "My draft")}
          <textarea
            className="w-full rounded border p-2"
            rows={5}
            maxLength={8000}
            value={card.text}
            onChange={(e) => edit("text", e.target.value)}
          />
        </label>
        {policy?.review.enabled && (
          <>
            <Button
              variant="outline"
              disabled={!answers && !card.text}
              onClick={() => check(true)}
            >
              {l("راجع بطاقتي", "Review my card")}
            </Button>
            {review && (
              <div role="status">
                <p>{gap}</p>
                <CloudOption
                  key={card.text + answers + ar}
                  feature="review"
                  ar={ar}
                  context={context}
                  content={answers + "\n" + card.text}
                />
              </div>
            )}
          </>
        )}
        <Button
          disabled={!ready || !card.title.trim() || !card.text.trim()}
          onClick={() => {
            try {
              localStorage.setItem(prefix + id, JSON.stringify(card));
              note(l("حُفظت البطاقة على جهازك", "Card saved on this device"));
            } catch {
              note(l("تعذر الحفظ على الجهاز", "Device storage unavailable"));
            }
          }}
        >
          {l("حفظ البطاقة على جهازي", "Save card on my device")}
        </Button>
        <p role="status">{status}</p>
      </div>
    </details>
  );
}
type Hit = {
  title: string;
  href: string;
  owner: string;
  body: string;
  type: "trial" | "card";
};
function records(): Hit[] {
  const hits: Hit[] = allTrials().map((t) => ({
    title: t.tool + " · " + t.goal,
    owner: t.owner,
    body: t.criterion,
    href: "#trial-" + t.id,
    type: "trial",
  }));
  for (const k of Object.keys(localStorage).filter((k) =>
    k.startsWith(prefix),
  )) {
    const id = k.slice(prefix.length);
    try {
      const c = read(id);
      hits.push({
        title: c.title,
        owner: c.owner,
        body: c.text + " " + c.goal,
        href: "/product/" + encodeURIComponent(id) + "#archy-work-card",
        type: "card",
      });
    } catch {
      /* Skip unreadable cards. */
    }
  }
  return hits;
}
export function AskRecords({ ar }: { ar: boolean }) {
  const policy = useWorkPolicy().data,
    [q, set] = useState(""),
    [hits, result] = useState<Hit[] | null>(null),
    [error, fail] = useState(false);
  const l = (a: string, e: string) => (ar ? a : e);
  if (!policy?.ask.enabled) return null;
  function search(s: string) {
    set(s);
    fail(false);
    try {
      const words = s
        .toLowerCase()
        .replace(/[؟?.,]/g, "")
        .split(/\s+/)
        .filter(Boolean);
      const missing =
        /(بلا مسؤول|بدون مسؤول|دون مسؤول|لم يحدد|لم نحدد|unassigned|no owner|without an? owner|missing owner)/i.test(
          s,
        );
      const trial = /تجارب|تجربة|trials?/i.test(s),
        card = /بطاق|البطاقات|cards?|تطبيقات|applications?/i.test(s);
      const candidates = records().filter(
        (r) =>
          (!missing || !r.owner.trim()) &&
          (!trial || r.type === "trial") &&
          (!card || r.type === "card"),
      );
      const meaningful = words.filter(
        (w) =>
          ![
            "ما",
            "هي",
            "التي",
            "كل",
            "اعرض",
            "عرض",
            "لي",
            "عن",
            "find",
            "my",
            "show",
            "the",
            "all",
            "which",
            "are",
            "me",
          ].includes(w),
      );
      const generic =
        missing ||
        ((trial || card) &&
          meaningful.every((w) =>
            /^(تجارب|التجارب|تجربة|بطاقات|البطاقات|cards?|trials?)$/i.test(w),
          )) ||
        /^(all (cards|trials)|كل (البطاقات|التجارب))$/i.test(s.trim());
      result(
        candidates.filter(
          (r) =>
            generic ||
            meaningful.some((w) =>
              (r.title + " " + r.body + " " + r.owner)
                .toLowerCase()
                .includes(w),
            ),
        ),
      );
    } catch {
      result(null);
      fail(true);
    }
  }
  return (
    <section className="bx-panel grid gap-2">
      <h2>{l("اسأل بيانات هذا الجهاز", "Ask this device’s records")}</h2>
      <p>
        {l(
          "ابحث في بطاقات العمل وتجارب الفريق المحفوظة هنا.",
          "Search work cards and team trials saved here.",
        )}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search(q);
        }}
      >
        <label>
          {l("سؤالك أو كلمة البحث", "Question or keyword")}
          <input
            className="block w-full rounded border p-2"
            maxLength={300}
            value={q}
            onChange={(e) => {
              set(e.target.value);
              result(null);
            }}
          />
        </label>
        <Button disabled={!q.trim()}>{l("بحث", "Search")}</Button>
      </form>
      <div className="flex gap-2 flex-wrap">
        {[
          l("بطاقات بلا مسؤول", "Cards without an owner"),
          l("كل التجارب", "All trials"),
        ].map((s) => (
          <Button variant="outline" key={s} onClick={() => search(s)}>
            {s}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert">
          {l("تعذرت قراءة سجلات الجهاز", "Device records unavailable")}
        </p>
      )}
      {hits && (
        <div aria-live="polite">
          <p>
            {l("السجلات المطابقة", "Matching records")} · {hits.length}
          </p>
          <ul>
            {hits.map((r) => (
              <li key={r.href}>
                <a className="underline" href={r.href}>
                  {r.title}
                </a>
              </li>
            ))}
          </ul>
          {hits.length > 0 && (
            <CloudOption
              key={q + ar}
              feature="ask"
              ar={ar}
              context={q}
              content={hits.map((r) => r.title).join("\n")}
            />
          )}
        </div>
      )}
    </section>
  );
}
