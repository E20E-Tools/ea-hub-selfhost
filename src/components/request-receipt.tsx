import { useState } from "react";
import { useLanguage } from "@/lib/language";
import { Button } from "./ui/button";
import { dictionaries } from "@/lib/copy";

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
      <div><Button type="button" variant="outline" onClick={copyNumber}>{dictionaries[ar ? "ar" : "en"].requestReceiptCopyReceiptNumber}</Button>
        <span role="status">{copy === "done" ? (dictionaries[ar ? "ar" : "en"].requestReceiptCopied) : copy === "manual" ? (dictionaries[ar ? "ar" : "en"].requestReceiptSelectTheNumberTo) : ""}</span></div>
      <strong>{subject}</strong>
      <p dir="auto" className="ea-request-summary">{summary}</p>
      <p>{dictionaries[ar ? "ar" : "en"].requestReceiptTheTeamWillReview} {receipt.tracking === "none" ? t("bxTrackingUnavailable") : t("bxTrackingEnabled")}</p>
      {receipt.tracking !== "none" && <Button asChild><a href={"/my-requests#receipt-" + receipt.id}>{t("bxTrackRequests")}</a></Button>}
    </div>
  );
}
