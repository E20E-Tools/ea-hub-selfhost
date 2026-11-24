import { exerciseKey, readExercise } from "./saved-exercises";
import { useFeature } from "@/lib/use-feature";
import { StepHelp } from "./step-help";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/products";
import { trackJourney } from "@/lib/journey-client";
import { dictionaries } from "@/lib/copy";

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
        dictionaries[ar ? "ar" : "en"].productExercisePassedTheInitialLoad,
        new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      ]
    : apm
      ? [
          dictionaries[ar ? "ar" : "en"].productExercisePurchasing,
          dictionaries[ar ? "ar" : "en"].productExercisePurchaseApproval,
          dictionaries[ar ? "ar" : "en"].productExerciseSupplierPortal,
          dictionaries[ar ? "ar" : "en"].productExercisePurchaseApproval,
        ]
      : [
          dictionaries[ar ? "ar" : "en"].productExerciseOrderFulfilment,
          dictionaries[ar ? "ar" : "en"].productExerciseInventoryValidation,
          dictionaries[ar ? "ar" : "en"].productExerciseSalesInventory,
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
    else setError(dictionaries[ar ? "ar" : "en"].productExerciseNoSavedExerciseWas);
  }, [product.id, ar]);
  function save() {
    try {
      localStorage.setItem(exerciseKey(product.id), JSON.stringify({ name:product.name, values, result, language }));
      setSaved(true); setError("");
    } catch { setError(dictionaries[ar ? "ar" : "en"].productExerciseDeviceStorageIsUnavailable); }
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
        dictionaries[ar ? "ar" : "en"].productExerciseCouldNotTransferThe,
      );
    }
  }
  return (
    <section className="bx-panel ea-exercise" id="exercise">
      <h2>{dictionaries[ar ? "ar" : "en"].productExerciseTryAWorkedExample}</h2>
      <p>{radar
        ? (dictionaries[ar ? "ar" : "en"].productExerciseReviewTheTrialRationale)
        : apm ? (dictionaries[ar ? "ar" : "en"].productExerciseChangeTheSecondApplication)
        : (dictionaries[ar ? "ar" : "en"].productExerciseChangeTheApplicationsSupporting)}</p>
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
                ? dictionaries[ar ? "ar" : "en"].productExerciseFindingBothApplicationsSupport
                : dictionaries[ar ? "ar" : "en"].productExerciseFindingTheTwoCapabilities,
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
        <Button>{dictionaries[ar ? "ar" : "en"].productExerciseGenerateResult}</Button>
      </form>
      {result && (
        <div role="status">
          <pre className="whitespace-pre-wrap">{result}</pre>
          <div className="bx-actions">
            <Button onClick={save}>{dictionaries[ar ? "ar" : "en"].productExerciseSaveOnThisDevice}</Button>
            {saved && (showMyTools ? <a href="/my-tools">{dictionaries[ar ? "ar" : "en"].productExerciseSavedViewMyExercises}</a> : <span role="status">{dictionaries[ar ? "ar" : "en"].productExerciseSaved}</span>)}
            <Button onClick={download}>
              {dictionaries[ar ? "ar" : "en"].productExerciseDownloadResult}
            </Button>
            {product.servicesEnabled !== false && (
              <Button variant="outline" onClick={attach}>
                {dictionaries[ar ? "ar" : "en"].productExerciseAttachResultToA}
              </Button>
            )}
          </div>
        </div>
      )}
      <StepHelp key={result} product={product} ar={ar} step={dictionaries[ar ? "ar" : "en"].productExerciseWorkedExample} result={result} />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
