import { exerciseKey, readExercise } from "./saved-exercises";
import { useFeature } from "@/lib/use-feature";
import { StepHelp } from "./step-help";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/products";
import { trackJourney } from "@/lib/journey-client";

export function ProductExercise({
  product,
  language,
}: {
  product: Product;
  language: "ar" | "en";
}) {
  const ar = language === "ar",
    radar = product.id === "radar",
    apm = product.id === "landscape";
  const showMyTools = useFeature("myTools");
  const [result, setResult] = useState(""),
    [error, setError] = useState(""),
    [started, setStarted] = useState(false);
  const labels = radar
    ? ar
      ? ["التقنية", "الحلقة", "سبب القرار", "موعد المراجعة"]
      : ["Technology", "Ring", "Decision rationale", "Review date"]
    : apm
      ? ar
        ? [
            "التطبيق الأول",
            "القدرة التي يدعمها",
            "التطبيق الثاني",
            "القدرة التي يدعمها التطبيق الثاني",
          ]
        : [
            "First application",
            "Capability it supports",
            "Second application",
            "Capability of the second application",
          ]
      : ar
        ? ["القدرة", "العملية", "التطبيقات التي تعتمد عليها العملية"]
        : ["Capability", "Process", "Applications the process depends on"];
  const defaults = radar
    ? [
        "RabbitMQ",
        "trial",
        ar ? "أتم اختبار الحمل بنجاح" : "Passed the initial load test",
        new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      ]
    : apm
      ? [
          ar ? "نظام الشراء" : "Purchasing",
          ar ? "اعتماد المشتريات" : "Purchase approval",
          ar ? "بوابة الموردين" : "Supplier portal",
          ar ? "اعتماد المشتريات" : "Purchase approval",
        ]
      : [
          ar ? "تنفيذ الطلبات" : "Order fulfilment",
          ar ? "التحقق من المخزون" : "Inventory validation",
          ar ? "المبيعات، المخزون" : "Sales, Inventory",
        ];
  const rings = ar
    ? ["تبنّي", "تجربة", "تقييم", "إيقاف"]
    : ["Adopt", "Trial", "Assess", "Hold"];
  const ringIds = ["adopt", "trial", "assess", "hold"];
  const [values, setValues] = useState(defaults);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("resume") !== "exercise") return;
    const record = readExercise(product.id);
    if (record) { setValues(record.values); setResult(record.result); setSaved(true); }
    else setError(ar ? "لم نجد التمرين المحفوظ على هذا الجهاز." : "No saved exercise was found on this device.");
  }, [product.id, ar]);
  function save() {
    try {
      localStorage.setItem(exerciseKey(product.id), JSON.stringify({ name:product.name, values, result, language }));
      setSaved(true); setError("");
    } catch { setError(ar ? "تعذر الحفظ على الجهاز. يمكنك تنزيل النتيجة." : "Device storage is unavailable. You can download the result."); }
  }
  function start() {
    if (!started) {
      setStarted(true);
      void trackJourney("exercise_started", language, { oncePerSession: true });
    }
  }
  function change(i: number, v: string) {
    start();
    setSaved(false);
    setResult("");
    setError("");
    setValues((prev) => prev.map((x, k) => (k === i ? v : x)));
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + product.name + "\n" + result], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = product.id + "-exercise.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function attach() {
    try {
      const key = crypto.randomUUID();
      sessionStorage.setItem(
        "e20e-exercise:" + key,
        JSON.stringify({
          tool: product.id,
          result,
          expires: Date.now() + 900000,
        }),
      );
      window.location.assign(
        "/enterprise-services/request?service=training&tool=" +
          encodeURIComponent(product.id) +
          "#exercise-" +
          key,
      );
    } catch {
      setError(
        ar
          ? "تعذر نقل النتيجة. يمكنك تنزيلها ونسخها في طلب الخدمة."
          : "Could not transfer the result. Download it and copy it into your request.",
      );
    }
  }
  return (
    <section className="bx-panel ea-exercise" id="exercise">
      <h2>{ar ? "جرّبها على مثال" : "Try a worked example"}</h2>
      <p>{radar
        ? (ar ? "راجع سبب تجربة التقنية وحدّد تاريخ المراجعة، ثم أنشئ سجل القرار." : "Review the trial rationale and review date, then generate the decision record.")
        : apm ? (ar ? "غيّر القدرة التي يدعمها التطبيق الثاني، ثم قارن النتيجة لمعرفة أين يوجد تداخل." : "Change the second application’s capability and generate the finding to see how overlap changes.")
        : (ar ? "غيّر التطبيقات التي تدعم العملية، ثم أنشئ خريطة الاعتماديات." : "Change the applications supporting the process, then generate its dependency map.")}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start();
          const v = values.map((x) => x.trim());
          if (v.some((x) => !x)) return;
          const lines = v.map(
            (x, i) =>
              labels[i] +
              " — " +
              (radar && i === 1 ? rings[ringIds.indexOf(x)] : x),
          );
          if (apm)
            lines.push(
              v[1]?.toLocaleLowerCase() === v[3]?.toLocaleLowerCase()
                ? ar
                  ? "النتيجة: التطبيقان يدعمان القدرة نفسها. تحقّق من الاعتماديات قبل اقتراح الدمج."
                  : "Finding: both applications support the same capability. Check dependencies before consolidation."
                : ar
                  ? "النتيجة: القدرتان المدخلتان مختلفتان."
                  : "Finding: the two capabilities entered are distinct.",
            );
          if (!apm && !radar) lines.push(v.join(" → "));
          setResult(lines.join("\n"));
          void trackJourney("exercise_completed", language, {
            oncePerSession: true,
          });
        }}
      >
        <div className="bx-demo-grid">
          {labels.map((label, i) => (
            <label key={label}>
              {label}
              {radar && i === 1 ? (
                <select
                  value={values[i]}
                  onChange={(e) => change(i, e.target.value)}
                >
                  {ringIds.map((id, k) => (
                    <option key={id} value={id}>
                      {rings[k]}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={radar && i === 3 ? "date" : "text"}
                  required
                  maxLength={240}
                  value={values[i]}
                  onChange={(e) => change(i, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>
        <Button>{ar ? "إنشاء النتيجة" : "Generate result"}</Button>
      </form>
      {result && (
        <div role="status">
          <pre className="whitespace-pre-wrap">{result}</pre>
          <div className="bx-actions">
            <Button onClick={save}>{ar ? "حفظ على هذا الجهاز" : "Save on this device"}</Button>
            {saved && (showMyTools ? <a href="/my-tools">{ar ? "تم الحفظ · عرض تماريني" : "Saved · View my exercises"}</a> : <span role="status">{ar ? "تم الحفظ" : "Saved"}</span>)}
            <Button onClick={download}>
              {ar ? "تنزيل النتيجة" : "Download result"}
            </Button>
            {product.servicesEnabled !== false && (
              <Button variant="outline" onClick={attach}>
                {ar
                  ? "أرفق النتيجة بطلب تدريب"
                  : "Attach result to a training request"}
              </Button>
            )}
          </div>
        </div>
      )}
      <StepHelp key={result} product={product} ar={ar} step={ar ? "التمرين العملي" : "Worked example"} result={result} />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
