import { adminDictionaries } from "@/lib/admin-copy";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getProductReviews,
  setProductReview,
} from "@/lib/archy-quality.functions";
import type { Product } from "@/lib/products";
export type QualityField = "p-description-ar" | "p-url";
export function ProductQuality({
  products,
  ar,
  edit,
}: {
  products: Product[];
  ar: boolean;
  edit: (p: Product, f: QualityField) => void;
}) {
  const reviews = useQuery({
    queryKey: ["product-reviews"],
    queryFn: () => getProductReviews(),
  });
  const [dates, setDates] = useState<Record<string, string>>({}),
    [saving, setSaving] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <details className="mb-4 rounded-lg border p-3">
      <summary>
        {adminDictionaries[ar ? "ar" : "en"].consoleProductDataQuality}
      </summary>
      {reviews.isError ? (
        <button onClick={() => void reviews.refetch()}>
          {adminDictionaries[ar ? "ar" : "en"].consoleLoadFailedRetry}
        </button>
      ) : (
        products.map((p) => {
          const reviewed = reviews.data?.find(
            (r) => r.product_id === p.id,
          )?.reviewed_on;
          const date = dates[p.id] ?? reviewed ?? today;
          let valid = false;
          try {
            const url = new URL(p.url);
            valid =
              ["https:", "http:"].includes(url.protocol) &&
              !url.username &&
              !url.password;
          } catch {
            /* missing or malformed */
          }
          return (
            <div key={p.id} className="grid gap-2 border-t py-3">
              <strong>{p.name}</strong>
              {!/[\u0600-\u06ff]/.test(p.description) && (
                <button
                  className="text-start underline"
                  onClick={() => edit(p, "p-description-ar")}
                >
                  {adminDictionaries[ar ? "ar" : "en"].consoleMissingArabicDescriptionEdit}
                </button>
              )}
              {!p.comingSoon && !valid && (
                <button
                  className="text-start underline"
                  onClick={() => edit(p, "p-url")}
                >
                  {adminDictionaries[ar ? "ar" : "en"].consoleMissingOrMalformedLaunchURLEdit}
                </button>
              )}
              {valid && !p.comingSoon && (
                <a
                  className="underline"
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {adminDictionaries[ar ? "ar" : "en"].consoleOpenLaunchURLToVerify}
                </a>
              )}
              {reviews.data && (
                <label>
                  {adminDictionaries[ar ? "ar" : "en"].consoleLastReviewed} ·{" "}
                  {reviewed ?? (adminDictionaries[ar ? "ar" : "en"].consoleNoDateRecorded)}{" "}
                  <input
                    type="date"
                    max={today}
                    value={date}
                    onChange={(e) =>
                      setDates({ ...dates, [p.id]: e.target.value })
                    }
                  />
                </label>
              )}
              <button
                className="justify-self-start underline"
                disabled={
                  !reviews.data ||
                  !!saving ||
                  !date ||
                  date > today ||
                  date === reviewed
                }
                onClick={async () => {
                  setSaving(p.id);
                  try {
                    await setProductReview({
                      data: { product_id: p.id, reviewed_on: date },
                    });
                    await reviews.refetch();
                  } catch {
                    toast.error(
                      adminDictionaries[ar ? "ar" : "en"].consoleCouldNotSaveReview,
                    );
                  } finally {
                    setSaving("");
                  }
                }}
              >
                {adminDictionaries[ar ? "ar" : "en"].consoleRecordReview}
              </button>
            </div>
          );
        })
      )}
    </details>
  );
}
