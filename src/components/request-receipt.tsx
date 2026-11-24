import { useState } from "react";
import { useLanguage } from "@/lib/language";
import { Button } from "./ui/button";

export type Receipt = { id: string; createdAt: string; tracking: "none" | "guest" | "account" };

export function RequestReceipt({ receipt, subject, summary }: { receipt: Receipt; subject: string; summary: string }) {
  const { language, t } = useLanguage();
  const ar = language === "ar";
  const [copy, setCopy] = useState<"idle" | "done" | "manual">("idle");
  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(receipt.id);
      setCopy("done");
    } catch {
      setCopy("manual");
    }
  }
  return (
    <div className="grid gap-3">
      <dl className="request-receipt">
        <dt>{t("requestNumberLabel")}</dt><dd dir="ltr" className="select-all">{receipt.id}</dd>
        <dt>{t("requestTimeLabel")}</dt><dd><time dateTime={receipt.createdAt}>{new Date(receipt.createdAt).toLocaleString(language)}</time></dd>
      </dl>
      <div><Button type="button" variant="outline" onClick={copyNumber}>{ar ? "نسخ رقم الطلب" : "Copy receipt number"}</Button>
        <span role="status">{copy === "done" ? (ar ? " تم النسخ" : " Copied") : copy === "manual" ? (ar ? " حدّد الرقم وانسخه يدويًا." : " Select the number to copy it manually.") : ""}</span></div>
      <strong>{subject}</strong>
      <p dir="auto" className="ea-request-summary">{summary}</p>
      <p>{ar ? "الخطوة التالية هي مراجعة الفريق لطلبك." : "The team will review your request next."} {receipt.tracking === "none" ? t("bxTrackingUnavailable") : t("bxTrackingEnabled")}</p>
      {receipt.tracking !== "none" && <Button asChild><a href={"/my-requests#receipt-" + receipt.id}>{t("bxTrackRequests")}</a></Button>}
    </div>
  );
}
