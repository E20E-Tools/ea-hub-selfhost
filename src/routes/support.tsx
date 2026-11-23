import { FormTermsNote } from "@/components/form-terms-note";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { localizedProduct } from "@/lib/catalog";
import { submitSupportOffer } from "@/lib/support.functions";
import {
  AMOUNT_RANGES,
  CURRENCIES,
  FINANCIAL_KINDS,
  HOURS,
  OFFER_TYPES,
  ORG_TYPES,
  PARTNER_AREAS,
  SKILLS,
  supportSchema,
  type OfferType,
} from "@/lib/requests.shared";
import { useLanguage } from "@/lib/language";
import { FeatureGate } from "@/components/feature-gate";
import { dictionaries, type Copy } from "@/lib/copy";
import { pageUrl } from "@/lib/seo";

export const Route = createFileRoute("/support")({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQueryOptions),
  head: () => ({
    meta: [
      { title: "Support us — E20E Tools | ادعمنا" },
      {
        name: "description",
        content:
          "Partner with E20E Tools, offer financial support, or contribute to development. شارك أو ادعم أو ساهم في تطوير أدوات E20E.",
      },
      { property: "og:title", content: "Support E20E Tools" },
      {
        property: "og:description",
        content: "Built by EA for EA — partner, sponsor or contribute to the tools.",
      },
      { property: "og:url", content: pageUrl("/support") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: pageUrl("/support") }],
  }),
  component: SupportPage,
});

const hiddenTrap = {
  position: "absolute",
  width: 1,
  height: 1,
  opacity: 0,
  overflow: "hidden",
  clipPath: "inset(50%)",
  pointerEvents: "none",
} as const;

function SupportPage() {
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const { language, dir, t } = useLanguage();
  const k = (key: string) => t(key as keyof Copy);
  const tr = (key: string) => (key in dictionaries.ar ? k(key) : key);
  const products = catalog.products.map((p) => localizedProduct(p, language));
  const [offerType, setOfferType] = useState<OfferType>("partnership");
  const [f, setF] = useState<Record<string, string>>({ currency: "SAR" });
  const [skills, setSkills] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ id: string; createdAt: string } | null>(null);
  const requestId = useRef("");
  const send = useServerFn(submitSupportOffer);
  const set = (key: string) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [key]: e.target.value }));
  const v = (key: string) => f[key] ?? "";

  function payload() {
    const base = {
      requestId: requestId.current,
      offerType,
      name: v("name"),
      email: v("email"),
      phone: v("phone"),
      message: v("message"),
      website: (document.getElementById("support-website") as HTMLInputElement | null)?.value ?? "",
    };
    if (offerType === "partnership")
      return {
        ...base,
        organization: v("organization"),
        orgType: v("orgType"),
        jobTitle: v("jobTitle"),
        area: v("area"),
      };
    if (offerType === "financial")
      return {
        ...base,
        organization: v("organization"),
        kind: v("kind"),
        amount: v("amount"),
        currency: v("currency") || "SAR",
        productId: v("productId"),
      };
    return {
      ...base,
      skills,
      hours: v("hours"),
      links: v("links")
        .split(/[\s,]+/)
        .filter(Boolean),
      interest: v("interest"),
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const data = payload();
    const check = supportSchema.safeParse(data);
    if (!check.success) {
      setError(tr(check.error.issues[0]?.message ?? "rqErrInvalid"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await send({ data });
      if (result.ok) {
        setReceipt({ id: result.id, createdAt: result.createdAt });
        window.scrollTo({ top: 0, behavior: "instant" });
      } else setError(tr(result.message));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(/^(rq|sp)Err/.test(message) ? tr(message) : t("rqErrSave"));
    } finally {
      setBusy(false);
    }
  }

  const select = (
    key: string,
    label: keyof Copy,
    options: readonly string[],
    prefix: string,
    required = true,
    emptyLabel?: string,
  ) => (
    <label className="request-field">
      <span>{t(label)}</span>
      <select className="form-select" value={v(key)} onChange={set(key)} required={required}>
        <option value="">{emptyLabel ?? t("spSelect")}</option>
        {options.filter(Boolean).map((option) => (
          <option key={option} value={option}>
            {k(`${prefix}${option}`)}
          </option>
        ))}
      </select>
    </label>
  );
  const text = (
    key: string,
    label: keyof Copy,
    props: { type?: string; ltr?: boolean; required?: boolean; max?: number } = {},
  ) => (
    <label className="request-field">
      <span>{t(label)}</span>
      <Input
        type={props.type ?? "text"}
        dir={props.ltr ? "ltr" : undefined}
        value={v(key)}
        onChange={set(key)}
        required={props.required}
        maxLength={props.max ?? 150}
      />
    </label>
  );

  return (
    <FeatureGate featureKey="support">
      <main className="library-page request-page ea-workspace ea-support" dir={dir}>
        <div className="request-shell">
          {receipt ? (
            <div className="request-success" role="status">
              <CheckCircle2 size={40} aria-hidden="true" />
              <h1>{t("spReceivedTitle")}</h1>
              <p>{t("spReceivedBody")}</p>
              <dl className="request-receipt">
                <dt>{t("requestNumberLabel")}</dt>
                <dd dir="ltr">{receipt.id}</dd>
                <dt>{t("requestTimeLabel")}</dt>
                <dd>
                  {new Date(receipt.createdAt).toLocaleString(
                    language === "ar" ? "ar-SA" : "en-GB",
                  )}
                </dd>
              </dl>
              <Button asChild variant="outline">
                <Link to="/">{t("requestBrowse")}</Link>
              </Button>
            </div>
          ) : (
            <form className="request-form" onSubmit={submit} aria-busy={busy}>
              <input
                id="support-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={hiddenTrap}
              />
              <header className="request-head">
                <span className="request-eyebrow" dir="ltr">
                  {t("spEyebrow")}
                </span>
                <h1>{t("spTitle")}</h1>
                <p>{t("spLead")}</p>
              </header>

              <fieldset className="choice-cards" disabled={busy}>
                <legend className="sr-only">{t("spChoose")}</legend>
                {OFFER_TYPES.map((option) => (
                  <label key={option} className="choice-card" data-selected={offerType === option}>
                    <input
                      type="radio"
                      name="offer-type"
                      value={option}
                      checked={offerType === option}
                      onChange={() => {
                        setOfferType(option);
                        setError("");
                      }}
                    />
                    <strong>{k(`spType_${option}`)}</strong>
                    <small>{k(`spType_${option}_hint`)}</small>
                  </label>
                ))}
              </fieldset>

              <fieldset className="request-section" disabled={busy}>
                <legend>
                  <span>01</span> {k(`spType_${offerType}`)}
                </legend>
                <div className="request-grid">
                  {offerType === "partnership" ? (
                    <>
                      {text("organization", "spOrgName", { required: true })}
                      {select("orgType", "spOrgType", ORG_TYPES, "spOrg_")}
                      {text("name", "spContactPerson", { required: true, max: 100 })}
                      {text("jobTitle", "spJobTitle", { max: 100 })}
                    </>
                  ) : offerType === "financial" ? (
                    <>
                      {text("name", "spNameOrOrg", { required: true })}
                      {select("kind", "spKind", FINANCIAL_KINDS, "spKind_")}
                    </>
                  ) : (
                    text("name", "requestNameLabel", { required: true, max: 100 })
                  )}
                  {text("email", "requestEmailLabel", {
                    type: "email",
                    ltr: true,
                    required: true,
                    max: 255,
                  })}
                  {text("phone", "rqPhoneOptional", { type: "tel", ltr: true, max: 20 })}
                  {offerType === "partnership"
                    ? select("area", "spArea", PARTNER_AREAS, "spArea_")
                    : null}
                  {offerType === "financial" ? (
                    <>
                      {select(
                        "amount",
                        "spAmount",
                        AMOUNT_RANGES,
                        "spAmount_",
                        false,
                        t("spAmount_none"),
                      )}
                      <label className="request-field">
                        <span>{t("spCurrency")}</span>
                        <select
                          className="form-select"
                          value={v("currency") || "SAR"}
                          onChange={set("currency")}
                        >
                          {CURRENCIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="request-field">
                        <span>{t("spTargetProduct")}</span>
                        <select
                          className="form-select"
                          value={v("productId")}
                          onChange={set("productId")}
                        >
                          <option value="">{t("spAnyProduct")}</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="support-note request-field-wide" role="note">
                        {t("spPaymentNote")}
                      </p>
                    </>
                  ) : null}
                  {offerType === "contribution" ? (
                    <>
                      <fieldset
                        className="request-field request-field-wide"
                        style={{ border: 0, padding: 0, margin: 0 }}
                      >
                        <legend style={{ marginBottom: 6 }}>{t("spSkills")}</legend>
                        <div className="check-grid">
                          {SKILLS.map((skill) => (
                            <label key={skill} className="check-chip">
                              <input
                                type="checkbox"
                                checked={skills.includes(skill)}
                                onChange={(e) =>
                                  setSkills((prev) =>
                                    e.target.checked
                                      ? [...prev, skill]
                                      : prev.filter((s) => s !== skill),
                                  )
                                }
                              />
                              {k(`spSkill_${skill}`)}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      {select("hours", "spHours", HOURS, "spHours_")}
                      {text("interest", "spInterest", { max: 200 })}
                      <label className="request-field request-field-wide">
                        <span>{t("spLinks")}</span>
                        <Textarea
                          dir="ltr"
                          value={v("links")}
                          onChange={set("links")}
                          rows={2}
                          maxLength={950}
                          placeholder="https://github.com/…"
                        />
                      </label>
                    </>
                  ) : null}
                  <label className="request-field request-field-wide">
                    <span>{t("spMessage")}</span>
                    <Textarea
                      value={v("message")}
                      onChange={set("message")}
                      rows={4}
                      maxLength={2000}
                    />
                  </label>
                </div>
              </fieldset>

              {error && (
                <p className="request-error" role="alert">
                  {error}
                </p>
              )}
              <div className="request-dock">
                <span className="request-submit-status" aria-live="polite">
                  {busy ? t("requestSaving") : ""}
                </span>
                <Button type="submit" className="request-submit" disabled={busy}>
                  {busy ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Send size={16} aria-hidden="true" />
                  )}
                  <span>{busy ? t("requestSaving") : t("spSend")}</span>
                </Button>
              </div>
              <FormTermsNote />
            </form>
          )}
        </div>
      </main>
    </FeatureGate>
  );
}
