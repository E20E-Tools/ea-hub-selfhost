import type { Product } from "@/lib/catalog";
import type { localizeBeneficiaryDetails } from "@/lib/beneficiary-metadata";

export type Beneficiary = ReturnType<typeof localizeBeneficiaryDetails>;

export type OperationRow = {
  key: "account" | "inputs" | "exchange";
  label: string;
  text: string;
};

/** Operating rows with text; import/export falls back to the documented integrations. */
export function operationRows(
  product: Product,
  beneficiary: Beneficiary,
  language: "ar" | "en",
): OperationRow[] {
  const ar = language === "ar";
  const labels = ar
    ? {
        account: "الحساب",
        inputs: "البيانات المطلوبة للبدء",
        exchange: "الاستيراد والتصدير",
      }
    : {
        account: "Account",
        inputs: "Starting data",
        exchange: "Import and export",
      };
  return (["account", "inputs", "exchange"] as const)
    .map((key) => {
      const text =
        product.beneficiaryDetails?.operations?.[key]?.[language]?.trim() ?? "";
      const fallback =
        key === "exchange" && beneficiary.integrations?.length
          ? beneficiary.integrations.join(ar ? "، " : ", ")
          : "";
      return { key, label: labels[key], text: text || fallback };
    })
    .filter((row) => row.text);
}

/** The four Tech-Radar-style rings named in a product's own copy, if it uses them. */
export const RING_COLORS = [
  "#3ee39a",
  "#7fd1ff",
  "#e6b25c",
  "#ff8a7a",
] as const;

/** Readiness share (0–100) from ticked prerequisites. */
export function readiness(ticked: readonly boolean[]): number {
  if (!ticked.length) return 0;
  return Math.round((ticked.filter(Boolean).length / ticked.length) * 100);
}

/** Short, human date for "last reviewed" (keeps the raw value when it is not ISO). */
export function reviewedLabel(
  raw: string | undefined,
  language: "ar" | "en",
): string {
  if (!raw) return "";
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(
    language === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(date);
}
