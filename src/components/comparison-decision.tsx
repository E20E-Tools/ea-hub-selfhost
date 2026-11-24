import {startTrial} from "@/lib/team-trials";
import { FeatureOnly } from "@/components/feature-gate";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { encodeComparisonIds } from "@/lib/my-tools";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
type Item = { id: string; name: string };
type Decision = {
  id: string;
  date: string;
  reason: string;
  chosen: string;
  items: Item[];
};
const prefix = "ea-hub:comparison-decision:";
export function SaveDecision({ items }: { items: Item[] }) {
  const { language } = useLanguage(),
    ar = language === "ar";
  const [chosen, setChosen] = useState(items[0]?.id ?? ""),
    [reason, setReason] = useState(""),
    [note, setNote] = useState("");
  const selection = items.some((p) => p.id === chosen) ? chosen : items[0]?.id;
  return (
    <details className="bx-panel">
      <summary>{ar ? "حفظ قرار المقارنة" : "Save comparison decision"}</summary>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!selection || !reason.trim()) return;
          const decision: Decision = {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            reason: reason.trim(),
            chosen: selection,
            items: items.map(({ id, name }) => ({ id, name })),
          };
          try {
            localStorage.setItem(
              prefix + decision.id,
              JSON.stringify(decision),
            );
            setNote(ar ? "تم الحفظ على هذا الجهاز." : "Saved on this device.");
            setReason("");
          } catch {
            setNote(
              ar ? "تعذّر الحفظ على الجهاز." : "Device storage unavailable.",
            );
          }
        }}
      >
        <label>
          {ar ? "الأداة المختارة" : "Chosen tool"}
          <select
            className="block border rounded p-2"
            value={selection}
            onChange={(e) => setChosen(e.target.value)}
          >
            {items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {ar ? "سبب الاختيار" : "Reason for selection"}
          <textarea
            className="block w-full border rounded p-2"
            required
            maxLength={1200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <Button disabled={!reason.trim()}>
          {ar ? "احفظ في أدواتي" : "Save to My tools"}
        </Button>
        <span role="status">{note}</span>
        <a href="/my-tools#decisions">
          {ar ? "قراراتي المحفوظة" : "My saved decisions"}
        </a>
      </form>
    </details>
  );
}
function CopyDecision({ decision, ar }: { decision: Decision; ar: boolean }) {
  const [feedback, setFeedback] = useState("");
  const [manual, setManual] = useState("");
  async function copy() {
    const chosen = decision.items.find(item => item.id === decision.chosen)?.name ?? decision.chosen;
    const alternatives = decision.items.filter(item => item.id !== decision.chosen).map(item => item.name);
    const url = new URL("/compare", window.location.origin);
    url.searchParams.set("ids", encodeComparisonIds(decision.items.map(item => item.id)));
    url.searchParams.set("lang", ar ? "ar" : "en");
    const summary = [
      (ar ? "الأداة المختارة: " : "Selected tool: ") + chosen,
      (ar ? "البدائل: " : "Alternatives: ") + alternatives.join(ar ? "، " : ", "),
      (ar ? "سبب الاختيار: " : "Reason: ") + decision.reason,
      url.href,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      setManual("");
      setFeedback(ar ? "تم نسخ الملخص." : "Summary copied.");
    } catch {
      setManual(summary);
      setFeedback(ar ? "حدّد النص وانسخه يدويًا." : "Select the text and copy it manually.");
    }
  }
  return <div className="ea-copy-decision">
    <Button type="button" variant="outline" onClick={copy}>{ar ? "نسخ ملخص القرار" : "Copy decision summary"}</Button>
    <p role="status">{feedback}</p>
    {manual && <textarea readOnly aria-label={ar ? "ملخص القرار" : "Decision summary"} value={manual} onFocus={e => e.currentTarget.select()} />}
  </div>;
}

function TeamTrial({decision, ar}: {decision:Decision; ar:boolean}) {
  const tool = decision.items.find(item => item.id === decision.chosen)?.name ?? decision.chosen;
  const [goal,setGoal] = useState(decision.reason);
  const [owner,setOwner] = useState("");
  const [date,setDate] = useState("");
  const [criterion,setCriterion] = useState("");
  const [feedback,setFeedback] = useState("");
  const [manual,setManual] = useState("");
  const labels = ar ? ["هدف التجربة","المسؤول","تاريخ المراجعة","معيار النجاح"] : ["Trial goal","Owner","Review date","Success criterion"];
  return <details className="ea-team-trial"><summary>{ar ? "تجهيز تجربة للفريق" : "Prepare a team trial"}</summary>
    <form onChange={()=>{setFeedback("");setManual("")}} onSubmit={async e=>{
      e.preventDefault();
      if (((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "start") {
        try { startTrial({id:decision.id,tool,reason:decision.reason,goal:goal.trim(),owner:owner.trim(),date,criterion:criterion.trim()}); location.hash="team-trials"; document.getElementById("team-trials")?.scrollIntoView(); setFeedback(ar?"التجربة متاحة في أدواتي.":"Your trial is available in My tools."); }
        catch {setFeedback(ar?"تعذر الحفظ على هذا الجهاز.":"Could not save on this device.");} return;
      }
      const plan = [(ar ? "تجربة الفريق · " : "Team trial · ") + tool, (ar ? "سبب الاختيار: " : "Decision rationale: ") + decision.reason,
        ...[goal,owner,date,criterion].map((value,i)=>labels[i] + ": " + value.trim())].join("\n");
      try { await navigator.clipboard.writeText(plan); setFeedback(ar ? "تم نسخ خطة التجربة." : "Trial plan copied."); }
      catch { setManual(plan); }
    }}><div className="bx-demo-grid">{[goal,owner,date,criterion].map((value,i)=><label key={i}>{labels[i]}<input required pattern={i === 2 ? undefined : ".*\\S.*"} type={i===2?"date":"text"} maxLength={600} value={value} onChange={e=>[setGoal,setOwner,setDate,setCriterion][i]!(e.target.value)}/></label>)}</div>
    <Button value="start">{ar?"حفظ وبدء التجربة":"Save and start trial"}</Button> <Button>{ar ? "نسخ خطة التجربة" : "Copy trial plan"}</Button></form>
    {feedback && <p role="status">{feedback}</p>}{manual && <label>{ar ? "انسخ الخطة" : "Copy the plan"}<textarea readOnly value={manual} onFocus={e=>e.target.select()}/></label>}
  </details>;
}

export function SavedDecisions() {
  const { language } = useLanguage(),
    ar = language === "ar";
  const [list, setList] = useState<Decision[]>([]);
  useEffect(() => {
    const load = () => {
      const next: Decision[] = [];
      try {
        for (const key of Object.keys(localStorage)) {
          if (!key.startsWith(prefix)) continue;
          try {
            const d = JSON.parse(localStorage.getItem(key) ?? "null");
            if (
              typeof d?.reason === "string" &&
              typeof d.date === "string" &&
              Array.isArray(d.items) &&
              d.items.every(
                (p: Item) =>
                  typeof p?.id === "string" && typeof p.name === "string",
              )
            )
              next.push(d);
          } catch {
            /* Skip damaged entries. */
          }
        }
      } catch {
        /* Storage unavailable. */
      }
      setList(next.sort((a, b) => b.date.localeCompare(a.date)));
    };
    load();
    window.addEventListener("storage", load);
    return () => window.removeEventListener("storage", load);
  }, []);
  return (
    <section id="decisions" className="bx-panel" style={{marginBlockEnd:"max(10rem, env(safe-area-inset-bottom))"}}>
      <style>{`@media print {
        body:has([data-print-decision]) *:not(:has([data-print-decision])):not([data-print-decision]):not([data-print-decision] *) {display:none!important}
        [data-print-decision] :is(.ea-copy-decision,button,a[href^="/compare"]) {display:none!important}
        body:has([data-print-decision]) main {display:block!important;width:100%!important}
      }`}</style>
      <h2>
        {ar
          ? "قرارات المقارنة على هذا الجهاز"
          : "Comparison decisions on this device"}
      </h2>
      {!list.length && (
        <p>
          {ar
            ? "يمكنك حفظ قرار من صفحة المقارنة."
            : "Save a decision from the comparison page."}
        </p>
      )}
      {list.map((d) => (
        <article key={d.id} className="border-t py-4">
          <h3>{d.items.find((i) => i.id === d.chosen)?.name}</h3>
          <time>{new Date(d.date).toLocaleDateString(language)}</time>
          <p dir="auto">{d.reason}</p>
          <ul>
            {d.items.map((i) => (
              <li key={i.id}>
                {i.id === d.chosen
                  ? ar
                    ? "المختارة"
                    : "Selected"
                  : ar
                    ? "البديل"
                    : "Alternative"}{" "}
                · {i.name} ·{" "}
                <a
                  href={
                    "/product/" + encodeURIComponent(i.id) + "#capabilities"
                  }
                >
                  {ar ? "الإمكانات" : "Capabilities"}
                </a>{" "}
                ·{" "}
                <a href={"/product/" + encodeURIComponent(i.id) + "#fit"}>
                  {ar ? "الملاءمة" : "Fit"}
                </a>
              </li>
            ))}
          </ul>
          <a href={"/product/" + encodeURIComponent(d.chosen) + "#practice"}>{ar ? "المهمة الأولى للأداة المختارة" : "First task for the selected tool"}</a>
          <TeamTrial decision={d} ar={ar}/>
          <CopyDecision decision={d} ar={ar} />
          <FeatureOnly feature="compare">
            <Button asChild variant="outline">
              <Link to="/compare" search={{ ids: encodeComparisonIds(d.items.map((item) => item.id)) }}>
                {ar ? "إعادة فتح المقارنة" : "Reopen comparison"}
              </Link>
            </Button>
          </FeatureOnly>
          <Button
            className="mx-auto flex w-full max-w-xs"
            variant="outline"
            onClick={(e) => {
              const article=e.currentTarget.closest("article");
              if(!article)return;
              document.querySelector("[data-print-decision]")?.removeAttribute("data-print-decision");
              article.setAttribute("data-print-decision","");
              window.addEventListener("afterprint",()=>article.removeAttribute("data-print-decision"),{once:true});
              window.print();
            }}
          >
            {ar ? "طباعة القرار" : "Print decision"}
          </Button>
        </article>
      ))}
    </section>
  );
}
