import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Users } from "lucide-react";
import type { Product } from "@/lib/catalog";
import { launchDayLabel, launchInstantFor } from "@/lib/archone-launch";
import { getWaitlistCount, joinWaitlist } from "@/lib/newsletter.functions";
import { useFeature } from "@/lib/use-feature";

/** Visitor-facing count text; small numbers are shown as-is, zero invites the first signup. */
export function waitlistCountText(count: number, ar: boolean): string {
  if (count <= 0) return ar ? "كن أول من ينتظرها" : "Be the first on the list";
  if (!ar)
    return count === 1 ? "1 person is waiting" : `${count} people are waiting`;
  if (count === 1) return "شخص واحد بانتظارها";
  if (count === 2) return "شخصان بانتظارها";
  if (count <= 10) return `${count} أشخاص بانتظارها`;
  return `${count} شخصًا بانتظارها`;
}

/**
 * Waitlist for a coming-soon product: the expected launch day, how many people are
 * waiting, and one question about the problem the visitor wants the tool to solve.
 */
export function ProductWaitlist({
  product,
  ar,
  className = "",
}: {
  product: Pick<Product, "id" | "name" | "comingSoon" | "publicationDate">;
  ar: boolean;
  className?: string;
}) {
  const id = useId();
  const client = useQueryClient();
  const allowed = useFeature("waitlist");
  const enabled = Boolean(product.comingSoon) && allowed;
  const count = useQuery({
    queryKey: ["waitlist-count", product.id],
    queryFn: () => getWaitlistCount({ data: { productId: product.id } }),
    enabled,
    staleTime: 60_000,
  });
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState("");
  const [state, setState] = useState<
    "idle" | "busy" | "done" | "error" | "limit"
  >("idle");
  const [confirm, setConfirm] = useState(false);
  if (!enabled) return null;
  const at = launchInstantFor(product.id, product.publicationDate);
  const n = count.data?.count ?? 0;
  return (
    <section className={`ea-waitlist ${className}`} aria-labelledby={`${id}-t`}>
      <div className="ea-waitlist-head">
        <h2 id={`${id}-t`}>
          <Bell size={18} aria-hidden="true" />
          {ar
            ? `انضم لقائمة انتظار ${product.name}`
            : `Join the ${product.name} waitlist`}
        </h2>
        <p className="ea-waitlist-meta">
          {at && (
            <span>
              {ar ? "الإطلاق المتوقع: " : "Expected launch: "}
              <b>{launchDayLabel(at, ar)}</b>
            </span>
          )}
          {count.isSuccess && (
            <span>
              <Users size={14} aria-hidden="true" /> {waitlistCountText(n, ar)}
            </span>
          )}
        </p>
      </div>
      {state === "done" ? (
        <p className="ea-waitlist-done" role="status">
          <Check size={18} aria-hidden="true" />
          {confirm
            ? ar
              ? "أُضفت للقائمة. أكّد بريدك من الرسالة التي ستصلك لنبلغك يوم الإطلاق."
              : "You're on the list. Confirm your email from the message we send, and we'll tell you on launch day."
            : ar
              ? "أُضفت للقائمة. سنبلغك يوم الإطلاق."
              : "You're on the list. We'll tell you on launch day."}
        </p>
      ) : (
        <form
          className="ea-waitlist-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setState("busy");
            try {
              const result = await joinWaitlist({
                data: {
                  productId: product.id,
                  email,
                  lang: ar ? "ar" : "en",
                  problem,
                },
              });
              if (result.ok) {
                setConfirm(result.confirm);
                setState("done");
                void client.invalidateQueries({
                  queryKey: ["waitlist-count", product.id],
                });
              } else setState(result.message === "limit" ? "limit" : "error");
            } catch {
              setState("error");
            }
          }}
        >
          <label htmlFor={`${id}-p`}>
            {ar
              ? "ما المشكلة التي تريد أن تحلها هذه الأداة لفريقك؟ (اختياري)"
              : "What problem should this tool solve for your team? (optional)"}
          </label>
          <textarea
            id={`${id}-p`}
            rows={2}
            maxLength={600}
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder={
              ar
                ? "مثال: لا نعرف أي التطبيقات تتداخل وظائفها"
                : "e.g. We can't see which applications overlap"
            }
          />
          <label htmlFor={`${id}-e`}>
            {ar ? "بريدك الإلكتروني" : "Your email"}
          </label>
          <div className="ea-waitlist-row">
            <input
              id={`${id}-e`}
              type="email"
              dir="ltr"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" disabled={state === "busy"}>
              {state === "busy"
                ? ar
                  ? "جارٍ الإضافة…"
                  : "Adding…"
                : ar
                  ? "أبلغني عند الإطلاق"
                  : "Notify me at launch"}
            </button>
          </div>
          {(state === "error" || state === "limit") && (
            <p className="ea-waitlist-error" role="alert">
              {state === "limit"
                ? ar
                  ? "محاولات كثيرة. حاول بعد ساعة."
                  : "Too many attempts. Try again in an hour."
                : ar
                  ? "تعذّرت الإضافة. تحقق من البريد وحاول مجددًا."
                  : "Couldn't add you. Check the email and try again."}
            </p>
          )}
          <p className="ea-waitlist-fine">
            {ar
              ? "نستخدم بريدك لإبلاغك بالإطلاق فقط، ويمكنك إلغاء المتابعة من أي رسالة."
              : "We only use your email for the launch notice; unsubscribe from any message."}
          </p>
        </form>
      )}
    </section>
  );
}
