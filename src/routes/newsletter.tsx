import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/language";
import {
  joinNewsletter,
  manageNewsletter,
  newsletterPreferences,
} from "@/lib/newsletter.functions";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/newsletter")({ component: Newsletter });
function Newsletter() {
  const { language } = useLanguage();
  const [params, setParams] = useState<URLSearchParams | null>(null),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [done, setDone] = useState(false);
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const [general, setGeneral] = useState(true),
    [products, setProducts] = useState<string[]>([]),
    [loaded, setLoaded] = useState(false);
  const [invalidPreferences, setInvalidPreferences] = useState(false);
  const initialProducts = useRef(catalog.products);
  useEffect(() => {
    let active = true;
    const q = new URLSearchParams(location.hash.slice(1));
    setParams(q);
    const id = q.get("product");
    if (id && initialProducts.current.some((p) => p.id === id)) {
      setProducts([id]);
      setGeneral(false);
    }
    if (q.get("action") === "preferences" && q.get("token")) {
      newsletterPreferences({ data: { token: q.get("token")! } }).then(
        (p) => {
          if (active) {
            setGeneral(p.general);
            setProducts(p.products);
            setLoaded(true);
          }
        },
        () => {
          if (active) setInvalidPreferences(true);
        },
      );
    } else setLoaded(true);
    return () => {
      active = false;
    };
  }, []);
  const ar = (params?.get("lang") || language) === "ar",
    t = (a: string, b: string) => (ar ? a : b);
  const token = params?.get("token"),
    action = params?.get("action");
  const managing =
    !!token &&
    (action === "confirm" ||
      action === "unsubscribe" ||
      action === "preferences");
  const title =
    action === "preferences"
      ? t("تفضيلات الاشتراك", "Subscription preferences")
      : managing
        ? action === "confirm"
          ? t("تأكيد الاشتراك", "Confirm subscription")
          : t("إلغاء الاشتراك", "Unsubscribe")
        : t("نشرة EA-Hub الشهرية", "EA-Hub monthly newsletter");
  return (
    <main className="bx-page" dir={ar ? "rtl" : "ltr"}>
      <section className="bx-panel newsletter-panel mx-auto grid max-w-xl gap-4">
        <h1>{title}</h1>
        {!managing && (<a className="ea-guide-step" href={`/guide/${(ar ? "ar" : "en")}.html#s4`}>{ar ? "كيف أتابع منتجات محددة؟" : "How do I follow specific products?"}</a>)}
        {!done && params && (
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setNote("");
              try {
                if (action === "preferences" && token) {
                  await newsletterPreferences({
                    data: { token, prefs: { general, products } },
                  });
                  setDone(true);
                  setNote(t("تم حفظ تفضيلاتك.", "Preferences saved."));
                } else if (
                  managing &&
                  (action === "confirm" || action === "unsubscribe")
                ) {
                  const ok = await manageNewsletter({
                    data: { token, action },
                  });
                  setDone(ok);
                  setNote(
                    ok
                      ? action === "confirm"
                        ? t("تم تأكيد اشتراكك.", "Subscription confirmed.")
                        : t("تم إلغاء اشتراكك.", "You have unsubscribed.")
                      : t(
                          "الرابط منتهي أو غير صالح.",
                          "This link has expired or is invalid.",
                        ),
                  );
                } else {
                  const result = await joinNewsletter({
                    data: {
                      email,
                      lang: ar ? "ar" : "en",
                      prefs: { general, products },
                    },
                  });
                  setDone(true);
                  setNote(
                    result.queued
                      ? t(
                          "تم تسجيل طلبك. ستصلك رسالة التأكيد عند تفعيل الإرسال.",
                          "Request received. Your confirmation will be sent when email delivery is enabled.",
                        )
                      : t(
                          "إذا كان بريدك جديدًا، ستصلك رسالة لتأكيد الاشتراك.",
                          "If this address is new, look for a confirmation email.",
                        ),
                  );
                }
              } catch {
                setNote(
                  t(
                    "تعذّر تنفيذ الطلب. حاول لاحقًا.",
                    "Could not complete your request. Try again later.",
                  ),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {!managing && (
              <>
                <p>
                  {t(
                    "رسالة شهرية بمستجدات الموقع والأدوات بعد تأكيد بريدك. يمكنك إلغاء الاشتراك من كل رسالة.",
                    "Get monthly site and tool updates after confirming your email. Every issue includes an unsubscribe link.",
                  )}
                </p>
                <label>
                  {t("البريد الإلكتروني", "Email address")}
                  <input
                    className="block w-full rounded border p-2"
                    required
                    type="email"
                    autoComplete="email"
                    dir="ltr"
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              </>
            )}
            {(!managing || action === "preferences") && (
              <fieldset className="newsletter-topics">
                <legend>
                  {t("ما الذي تريد متابعته؟", "What would you like to follow?")}
                </legend>
                <label>
                  <input
                    type="checkbox"
                    checked={general}
                    onChange={(e) => setGeneral(e.target.checked)}
                  />{" "}
                  {t("كل مستجدات النشرة الشهرية", "All monthly updates")}
                </label>
                {catalog.products.map((p) => (
                  <label key={p.id}>
                    <input
                      type="checkbox"
                      checked={products.includes(p.id)}
                      onChange={(e) =>
                        setProducts((ids) =>
                          e.target.checked
                            ? [...new Set([...ids, p.id])]
                            : ids.filter((id) => id !== p.id),
                        )
                      }
                    />{" "}
                    <span><bdi>{p.name}</bdi><small>
                    {p.comingSoon
                      ? t(
                          "إشعار الإطلاق والتحديثات",
                          "Launch alert and updates",
                        )
                      : t("تحديثات المنتج", "Product updates")}</small></span>
                  </label>
                ))}
              </fieldset>
            )}
            <Button
              disabled={
                busy ||
                !loaded ||
                ((!managing || action === "preferences") &&
                  !general &&
                  !products.length)
              }
            >
              {busy
                ? "…"
                : managing
                  ? title
                  : t("اشترك في النشرة", "Subscribe")}
            </Button>
          </form>
        )}
        <p role="status">{invalidPreferences ? t("رابط التفضيلات غير صالح.", "Invalid preferences link.") : note}</p>
      </section>
    </main>
  );
}
