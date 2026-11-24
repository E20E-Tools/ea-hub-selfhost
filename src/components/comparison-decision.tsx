import {startTrial} from "@/lib/team-trials";
import { FeatureOnly } from "@/components/feature-gate";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { encodeComparisonIds } from "@/lib/my-tools";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { dictionaries } from "@/lib/copy";
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
      <summary>{dictionaries[ar ? "ar" : "en"].comparisonDecisionSaveComparisonDecision}</summary>
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
            setNote(dictionaries[ar ? "ar" : "en"].comparisonDecisionSavedOnThisDevice);
            setReason("");
          } catch {
            setNote(
              dictionaries[ar ? "ar" : "en"].comparisonDecisionDeviceStorageUnavailable,
            );
          }
        }}
      >
        <label>
          {dictionaries[ar ? "ar" : "en"].comparisonDecisionChosenTool}
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
          {dictionaries[ar ? "ar" : "en"].comparisonDecisionReasonForSelection}
          <textarea
            className="block w-full border rounded p-2"
            required
            maxLength={1200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <Button disabled={!reason.trim()}>
          {dictionaries[ar ? "ar" : "en"].comparisonDecisionSaveToMyTools}
        </Button>
        <span role="status">{note}</span>
        <a href="/my-tools#decisions">
          {dictionaries[ar ? "ar" : "en"].comparisonDecisionMySavedDecisions}
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
      (dictionaries[ar ? "ar" : "en"].comparisonDecisionSelectedTool) + chosen,
      (dictionaries[ar ? "ar" : "en"].comparisonDecisionAlternatives) + alternatives.join(dictionaries[ar ? "ar" : "en"].comparisonDecisionSeparator),
      (dictionaries[ar ? "ar" : "en"].comparisonDecisionReason) + decision.reason,
      url.href,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      setManual("");
      setFeedback(dictionaries[ar ? "ar" : "en"].comparisonDecisionSummaryCopied);
    } catch {
      setManual(summary);
      setFeedback(dictionaries[ar ? "ar" : "en"].comparisonDecisionSelectTheTextAnd);
    }
  }
  return <div className="ea-copy-decision">
    <Button type="button" variant="outline" onClick={copy}>{dictionaries[ar ? "ar" : "en"].comparisonDecisionCopyDecisionSummary}</Button>
    <p role="status">{feedback}</p>
    {manual && <textarea readOnly aria-label={dictionaries[ar ? "ar" : "en"].comparisonDecisionDecisionSummary} value={manual} onFocus={e => e.currentTarget.select()} />}
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
  return <details className="ea-team-trial"><summary>{dictionaries[ar ? "ar" : "en"].comparisonDecisionPrepareATeamTrial}</summary>
    <form onChange={()=>{setFeedback("");setManual("")}} onSubmit={async e=>{
      e.preventDefault();
      if (((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "start") {
        try { startTrial({id:decision.id,tool,reason:decision.reason,goal:goal.trim(),owner:owner.trim(),date,criterion:criterion.trim()}); location.hash="team-trials"; document.getElementById("team-trials")?.scrollIntoView(); setFeedback(dictionaries[ar ? "ar" : "en"].comparisonDecisionYourTrialIsAvailable); }
        catch {setFeedback(dictionaries[ar ? "ar" : "en"].comparisonDecisionCouldNotSaveOn);} return;
      }
      const plan = [(dictionaries[ar ? "ar" : "en"].comparisonDecisionTeamTrial) + tool, (dictionaries[ar ? "ar" : "en"].comparisonDecisionDecisionRationale) + decision.reason,
        ...[goal,owner,date,criterion].map((value,i)=>labels[i] + ": " + value.trim())].join("\n");
      try { await navigator.clipboard.writeText(plan); setFeedback(dictionaries[ar ? "ar" : "en"].comparisonDecisionTrialPlanCopied); }
      catch { setManual(plan); }
    }}><div className="bx-demo-grid">{[goal,owner,date,criterion].map((value,i)=><label key={i}>{labels[i]}<input required pattern={i === 2 ? undefined : ".*\\S.*"} type={i===2?"date":"text"} maxLength={600} value={value} onChange={e=>[setGoal,setOwner,setDate,setCriterion][i]!(e.target.value)}/></label>)}</div>
    <Button value="start">{dictionaries[ar ? "ar" : "en"].comparisonDecisionSaveAndStartTrial}</Button> <Button>{dictionaries[ar ? "ar" : "en"].comparisonDecisionCopyTrialPlan}</Button></form>
    {feedback && <p role="status">{feedback}</p>}{manual && <label>{dictionaries[ar ? "ar" : "en"].comparisonDecisionCopyThePlan}<textarea readOnly value={manual} onFocus={e=>e.target.select()}/></label>}
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
        {dictionaries[ar ? "ar" : "en"].comparisonDecisionComparisonDecisionsOnThis}
      </h2>
      {!list.length && (
        <p>
          {dictionaries[ar ? "ar" : "en"].comparisonDecisionSaveADecisionFrom}
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
                  ? dictionaries[ar ? "ar" : "en"].comparisonDecisionSelected
                  : dictionaries[ar ? "ar" : "en"].comparisonDecisionAlternative}{" "}
                · {i.name} ·{" "}
                <a
                  href={
                    "/product/" + encodeURIComponent(i.id) + "#capabilities"
                  }
                >
                  {dictionaries[ar ? "ar" : "en"].comparisonDecisionCapabilities}
                </a>{" "}
                ·{" "}
                <a href={"/product/" + encodeURIComponent(i.id) + "#fit"}>
                  {dictionaries[ar ? "ar" : "en"].comparisonDecisionFit}
                </a>
              </li>
            ))}
          </ul>
          <a href={"/product/" + encodeURIComponent(d.chosen) + "#practice"}>{dictionaries[ar ? "ar" : "en"].comparisonDecisionFirstTaskForThe}</a>
          <TeamTrial decision={d} ar={ar}/>
          <CopyDecision decision={d} ar={ar} />
          <FeatureOnly feature="compare">
            <Button asChild variant="outline">
              <Link to="/compare" search={{ ids: encodeComparisonIds(d.items.map((item) => item.id)) }}>
                {dictionaries[ar ? "ar" : "en"].comparisonDecisionReopenComparison}
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
            {dictionaries[ar ? "ar" : "en"].comparisonDecisionPrintDecision}
          </Button>
        </article>
      ))}
    </section>
  );
}
