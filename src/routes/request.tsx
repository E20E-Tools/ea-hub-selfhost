import { RequestReceipt } from "@/components/request-receipt";
import { FormTermsNote } from "@/components/form-terms-note";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  HandHeart,
  Loader2,
  Mail,
  Send,
  Wand2,
} from "lucide-react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { recommendTools } from "@/lib/recommend.functions";
import type { Recommendation } from "@/lib/recommend.shared";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitRequest } from "@/lib/requests.functions";
import {
  getPublicContactEmail,
  DEFAULT_CONTACT_EMAIL,
} from "@/lib/contact.functions";
import {
  isPublicRequestType,
  requestSchema,
  PUBLIC_REQUEST_TYPES,
  URGENCIES,
  type PublicRequestType,
} from "@/lib/requests.shared";
import { RequestImages } from "@/components/request-images";
import { localizedProduct } from "@/lib/catalog";
import { useLanguage } from "@/lib/language";
import { featureEnabled } from "@/lib/site-features";
import { dictionaries, fill, type Copy } from "@/lib/copy";
import { pageUrl } from "@/lib/seo";
import { currentTourVisit } from "@/lib/archy-tour-visit-client";
import {
  RequestDraftControls,
  RequestReview,
  FieldError,
} from "@/components/request-draft-controls";
import { JourneyRating } from "@/components/journey-rating";
import { MetricsPreference } from "@/components/metrics-preference";
import { metricsAllowed, trackProductEvent } from "@/lib/journey-client";
import { useRequestDraft } from "@/lib/request-draft";
import { currentVisitorAccess } from "@/lib/current-visitor-access";

export const contactEmailQuery = queryOptions({
  queryKey: ["public-contact-email"],
  queryFn: () => getPublicContactEmail(),
  staleTime: 5 * 60_000,
});

type RequestSearch = {
  type?: string | undefined;
  product?: string | undefined;
  from?: "chat" | undefined;
  need?: string | undefined;
};

export const Route = createFileRoute("/request")({
  validateSearch: (search: Record<string, unknown>): RequestSearch => ({
    type: typeof search["type"] === "string" ? search["type"] : undefined,
    product:
      typeof search["product"] === "string"
        ? search["product"].slice(0, 80)
        : undefined,
    from: search["from"] === "chat" ? "chat" : undefined,
    need:
      typeof search["need"] === "string"
        ? search["need"].slice(0, 500)
        : undefined,
  }),
  // Enterprise service requests have their own page.
  beforeLoad: ({ search }) => {
    if (search.type === "service")
      throw redirect({ to: "/enterprise-services/request", replace: true });
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient
        .ensureQueryData(contactEmailQuery)
        .catch(() => DEFAULT_CONTACT_EMAIL),
    ]),
  head: () => ({
    meta: [
      { title: "Requests & contact — E20E Tools | الطلبات والتواصل" },
      {
        name: "description",
        content:
          "Request a new product, a feature, technical support, or send a general inquiry to the E20E Tools team. اطلب منتجًا أو إضافة أو دعمًا فنيًا أو أرسل استفسارًا.",
      },
      { property: "og:title", content: "Requests & contact — E20E Tools" },
      {
        property: "og:description",
        content:
          "One page for product requests, feature requests, technical support and inquiries, with a receipt number.",
      },
      { property: "og:url", content: pageUrl("/request") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: pageUrl("/request") }],
  }),
  component: RequestPage,
});

const TYPE_KEYS: Record<
  PublicRequestType,
  { title: keyof Copy; hint: keyof Copy }
> = {
  new: { title: "rqType_new", hint: "rqType_new_hint" },
  feature: { title: "rqType_feature", hint: "rqType_feature_hint" },
  support: { title: "rqType_support", hint: "rqType_support_hint" },
  general: { title: "rqType_general", hint: "rqType_general_hint" },
};

const hiddenTrap = {
  position: "absolute",
  width: 1,
  height: 1,
  opacity: 0,
  overflow: "hidden",
  clipPath: "inset(50%)",
  pointerEvents: "none",
} as const;

function RequestPage() {
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const { data: contactEmail } = useSuspenseQuery(contactEmailQuery);
  const search = Route.useSearch();
  const { language, dir, t } = useLanguage();
  const tr = (key: string) =>
    key in dictionaries.ar ? t(key as keyof Copy) : key;
  const products = catalog.products.map((p) => localizedProduct(p, language));
  const initialProduct = products.some((p) => p.id === search.product)
    ? (search.product ?? "")
    : "";
  const [type, setType] = useState<PublicRequestType>(
    isPublicRequestType(search.type) ? search.type : "new",
  );
  const [productId, setProductId] = useState(initialProduct);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [need, setNeed] = useState(search.need ?? "");
  const [impact, setImpact] = useState("");
  const [urgency, setUrgency] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{
    id: string;
    createdAt: string;
    tracking: "account" | "guest" | "none";
  } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [images, setImages] = useState<File[]>([]);
  const requestId = useRef("");
  const chatAccess = useRef("");
  const sendRequest = useServerFn(submitRequest);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [recBusy, setRecBusy] = useState(false);
  const [recError, setRecError] = useState("");
  const draftValue = {
    type,
    productId,
    urgency,
    name,
    email,
    company,
    phone,
    need,
    impact,
  };
  const restoreDraft = useCallback((values: Record<string, unknown>) => {
    if (isPublicRequestType(values["type"])) setType(values["type"]);
    if (typeof values["productId"] === "string")
      setProductId(values["productId"]);
    if (typeof values["urgency"] === "string") setUrgency(values["urgency"]);
    if (typeof values["name"] === "string") setName(values["name"]);
    if (typeof values["email"] === "string") setEmail(values["email"]);
    if (typeof values["company"] === "string") setCompany(values["company"]);
    if (typeof values["phone"] === "string") setPhone(values["phone"]);
    if (typeof values["need"] === "string") setNeed(values["need"]);
    if (typeof values["impact"] === "string") setImpact(values["impact"]);
  }, []);
  const resetFields = () => {
    setType(isPublicRequestType(search.type) ? search.type : "new");
    setProductId(initialProduct);
    setName("");
    setEmail("");
    setCompany("");
    setPhone("");
    setNeed("");
    setImpact("");
    setUrgency("");
    setImages([]);
    setRec(null);
    setFieldErrors({});
  };
  // Identity change: drop the previous owner's fields, receipt and review state from memory.
  // Bumped on identity change so an in-flight submit cannot paint the previous owner's receipt.
  const identityEpoch = useRef(0);
  const resetForIdentity = () => {
    identityEpoch.current += 1;
    resetFields();
    requestId.current = "";
    chatAccess.current = "";
    // The chat prefill belongs to the previous owner; it must never be re-applied.
    try {
      sessionStorage.removeItem("e20e-request-prefill");
    } catch {
      /* storage optional */
    }
    setReviewing(false);
    setReceipt(null);
    setError("");
    setRecError("");
    setBusy(false);
    setRecBusy(false);
  };
  const draft = useRequestDraft(
    "request",
    draftValue,
    restoreDraft,
    resetForIdentity,
  );
  const clearDraft = () => {
    draft.clear();
    resetFields();
  };

  // Follow URL changes (e.g. links from a product page while on this page).
  useEffect(() => {
    if (isPublicRequestType(search.type)) setType(search.type);
  }, [search.type]);
  useEffect(() => {
    if (search.product && products.some((p) => p.id === search.product))
      setProductId(search.product);
  }, [search.product]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const match = /^#step-([a-f0-9-]{36})$/i.exec(window.location.hash);
    if (!match || search.type !== "support") return;
    try {
      const key = "ea-step-help:" + match[1];
      const message = sessionStorage.getItem(key);
      if (message) {
        setNeed(message);
        sessionStorage.removeItem(key);
      }
    } catch {
      /* Other request fields are still usable. */
    }
  }, [search.type]);

  // Opened from the chat: reuse the visitor's chat details once.
  useEffect(() => {
    if (search.from !== "chat") return;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("e20e-request-prefill") ?? "null",
      ) as {
        name?: unknown;
        email?: unknown;
        access?: unknown;
      } | null;
      if (typeof saved?.name === "string")
        setName((v) => v || (saved.name as string));
      if (typeof saved?.email === "string")
        setEmail((v) => v || (saved.email as string));
      if (typeof saved?.access === "string") chatAccess.current = saved.access;
    } catch {
      /* ignore unreadable prefill */
    }
  }, [search.from]);

  const needsProduct = type === "feature" || type === "support";
  const allowImages = type !== "general";

  async function analyze() {
    if (recBusy) return;
    setRecBusy(true);
    setRecError("");
    const epoch = identityEpoch.current;
    try {
      const result = await recommendTools({ data: { need, language } });
      if (epoch !== identityEpoch.current) return;
      if (result.ok) setRec(result.recommendation);
      else setRecError(result.message);
    } catch {
      if (epoch !== identityEpoch.current) return;
      setRecError(t("requestAnalyseError"));
    } finally {
      // A stale run must not unlock a newer owner's in-flight analysis.
      if (epoch === identityEpoch.current) setRecBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const validation = requestSchema.safeParse({
      requestId: requestId.current,
      type,
      name,
      email,
      company,
      phone,
      need,
      productId,
      urgency,
      impact,
    });
    if (!validation.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        const field = String(issue.path[0] ?? "form");
        if (!nextErrors[field]) nextErrors[field] = tr(issue.message);
      }
      setFieldErrors(nextErrors);
      setReviewing(false);
      setError(tr(validation.error.issues[0]?.message ?? "rqErrInvalid"));
      requestAnimationFrame(() =>
        document
          .getElementById(
            `request-${String(validation.error.issues[0]?.path[0] ?? "name")}`,
          )
          ?.focus(),
      );
      return;
    }
    setFieldErrors({});
    if (!reviewing) {
      setError("");
      setReviewing(true);
      return;
    }
    setBusy(true);
    setError("");
    const epoch = identityEpoch.current;
    try {
      const form = new FormData();
      form.set("language", language);
      form.set("metrics", metricsAllowed() ? "on" : "off");
      const visitorAccess =
        chatAccess.current || (await currentVisitorAccess());
      if (epoch !== identityEpoch.current) return;
      if (visitorAccess) form.set("visitorAccess", visitorAccess);
      Object.entries(validation.data).forEach(([key, value]) => {
        if (typeof value === "string") form.set(key, value);
      });
      if (rec && type === "new")
        form.set("recommendation", JSON.stringify(rec));
      const trap = document.getElementById(
        "request-website",
      ) as HTMLInputElement | null;
      form.set("website", trap?.value ?? "");
      const tourToken = type === "support" ? currentTourVisit() : "";
      if (tourToken) form.set("tourToken", tourToken);
      if (search.from === "chat") {
        form.set("fromChat", "1");
        form.set("chatAccess", chatAccess.current);
      }
      if (allowImages) images.forEach((image) => form.append("images", image));
      const result = await sendRequest({ data: form });
      if (epoch !== identityEpoch.current) return;
      if (result.ok) {
        trackProductEvent("project.request_receipt_confirmed", {
          request_type: type,
          has_product: Boolean(productId),
        });
        if (type === "support" && tourToken)
          trackProductEvent("project.archy_post_tour_support_submitted");
        draft.clear();
        setReceipt({
          id: result.id,
          createdAt: result.createdAt,
          tracking: result.tracking,
        });
        window.scrollTo({ top: 0, behavior: "instant" });
      } else {
        setError(tr(result.message));
      }
    } catch (caught) {
      if (epoch !== identityEpoch.current) return;
      const message = caught instanceof Error ? caught.message : "";
      setError(message.startsWith("rq") ? tr(message) : t("requestSaveError"));
    } finally {
      if (epoch === identityEpoch.current) setBusy(false);
    }
  }

  const phoneOk = type === "support" ? phone.trim().length >= 7 : true;
  const missing = [
    name.trim().length < 2 && t("requestMissingName"),
    !email.includes("@") && t("requestMissingEmail"),
    !phoneOk && t("requestMissingPhone"),
    needsProduct && !productId && t("rqMissingProduct"),
    type === "support" && !urgency && t("rqMissingUrgency"),
    need.trim().length < 20 && t("rqMissingMessage"),
  ].filter(Boolean);
  const ready = missing.length === 0;
  const NeedArrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  const messageLabel =
    type === "new"
      ? t("requestNeedLabel")
      : type === "feature"
        ? t("rqFeatureLabel")
        : type === "support"
          ? t("rqIssueLabel")
          : t("rqMessageLabel");
  const messagePlaceholder =
    type === "new"
      ? t("requestNeedPlaceholder")
      : type === "feature"
        ? t("rqFeaturePlaceholder")
        : type === "support"
          ? t("rqIssuePlaceholder")
          : t("contactMessagePlaceholder");

  return (
    <main
      className="library-page request-page ea-workspace ea-request"
      dir={dir}
    >
      <div className="request-shell request-shell-wide">
        {receipt ? (
          <div className="request-success" role="status">
            <CheckCircle2 size={40} aria-hidden="true" />
            <h1>{t("requestReceivedTitle")}</h1>
            <p>
              {fill(t("requestThanks"), name.split(" ")[0] ?? "")}{" "}
              {allowImages && images.length
                ? fill(t("requestSavedImages"), String(images.length))
                : t("requestSavedPlain")}
            </p>
            <RequestReceipt
              receipt={receipt}
              subject={[
                t(TYPE_KEYS[type].title),
                products.find((p) => p.id === productId)?.name,
              ]
                .filter(Boolean)
                .join(" · ")}
              summary={need}
            />
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline">
                <Link to="/">{t("requestBrowse")}</Link>
              </Button>
            </div>
            <JourneyRating />
          </div>
        ) : (
          <div className="request-layout">
            <form
              className="request-form"
              onSubmit={submit}
              aria-busy={busy}
              noValidate
            >
              {search.from === "chat" && (
                <p className="text-sm text-muted-foreground">
                  {t("rqFromChat")}
                </p>
              )}
              <input
                id="request-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={hiddenTrap}
              />
              <header className="request-head">
                <h1>{t("rqTitle")}</h1>
                <p>{t("rqLead")}</p>
                <ol
                  className="ea-request-steps"
                  aria-label={
                    language === "ar" ? "تقدّم الطلب" : "Request progress"
                  }
                >
                  {[
                    language === "ar" ? "تفاصيل الطلب" : "Request details",
                    t("bxReview"),
                    language === "ar" ? "إيصال الطلب" : "Receipt",
                  ].map((label, i) => (
                    <li
                      key={label}
                      aria-current={
                        i === Number(reviewing) ? "step" : undefined
                      }
                    >
                      {label}
                    </li>
                  ))}
                </ol>
              </header>
              {reviewing && (
                <RequestReview
                  items={[
                    {
                      label: t("rqTypeLegend"),
                      value: t(TYPE_KEYS[type].title),
                    },
                    { label: t("requestNameLabel"), value: name },
                    { label: t("requestEmailLabel"), value: email },
                    { label: t("requestCompanyLabel"), value: company },
                    { label: t("rqPhoneSupport"), value: phone },
                    {
                      label: t("rqProductLabel"),
                      value:
                        products.find((p) => p.id === productId)?.name ?? "",
                    },
                    {
                      label: t("rqUrgencyLabel"),
                      value: urgency
                        ? t(`rqUrgency_${urgency}` as keyof Copy)
                        : "",
                    },
                    { label: messageLabel, value: need },
                    { label: t("rqImpactLabel"), value: impact },
                    {
                      label: t("requestImagesSection"),
                      value: images.length ? String(images.length) : "",
                    },
                  ]}
                />
              )}
              <div className={reviewing ? "hidden" : "contents"}>
                <fieldset className="choice-cards" disabled={busy}>
                  <legend className="sr-only">{t("rqTypeLegend")}</legend>
                  {PUBLIC_REQUEST_TYPES.map((option) => (
                    <label
                      key={option}
                      className="choice-card"
                      data-selected={type === option}
                    >
                      <input
                        type="radio"
                        name="request-type"
                        value={option}
                        checked={type === option}
                        onChange={() => {
                          setType(option);
                          if (option !== "support") {
                            setPhone("");
                            setUrgency("");
                          }
                          setFieldErrors({});
                          setError("");
                        }}
                      />
                      <strong>{t(TYPE_KEYS[option].title)}</strong>
                      <small>{t(TYPE_KEYS[option].hint)}</small>
                    </label>
                  ))}
                </fieldset>

                <fieldset className="request-section" disabled={busy}>
                  <legend>
                    <span>01</span> {t("requestContactSection")}
                  </legend>
                  <div className="request-grid">
                    <label className="request-field">
                      <span>{t("requestNameLabel")}</span>
                      <Input
                        id="request-name"
                        autoComplete="name"
                        value={name}
                        aria-invalid={Boolean(fieldErrors["name"])}
                        aria-describedby={
                          fieldErrors["name"] ? "request-name-error" : undefined
                        }
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("requestNamePlaceholder")}
                        maxLength={100}
                        required
                      />
                      <FieldError
                        id="request-name-error"
                        message={fieldErrors["name"]}
                      />
                    </label>
                    <label className="request-field">
                      <span>{t("requestEmailLabel")}</span>
                      <Input
                        id="request-email"
                        type="email"
                        autoComplete="email"
                        dir="ltr"
                        value={email}
                        aria-invalid={Boolean(fieldErrors["email"])}
                        aria-describedby={
                          fieldErrors["email"]
                            ? "request-email-error"
                            : undefined
                        }
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        maxLength={255}
                        required
                      />
                      <FieldError
                        id="request-email-error"
                        message={fieldErrors["email"]}
                      />
                    </label>
                    {type === "support" ? (
                      <label className="request-field">
                        <span>{t("rqPhoneSupport")}</span>
                        <Input
                          id="request-phone"
                          type="tel"
                          autoComplete="tel"
                          dir="ltr"
                          value={phone}
                          aria-invalid={Boolean(fieldErrors["phone"])}
                          aria-describedby={
                            fieldErrors["phone"]
                              ? "request-phone-error"
                              : undefined
                          }
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+966 5X XXX XXXX"
                          maxLength={20}
                          required
                          minLength={7}
                        />
                        <FieldError
                          id="request-phone-error"
                          message={fieldErrors["phone"]}
                        />
                      </label>
                    ) : null}
                    <label className="request-field">
                      <span>{t("requestCompanyLabel")}</span>
                      <Input
                        autoComplete="organization"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder={t("requestCompanyPlaceholder")}
                        maxLength={150}
                      />
                    </label>
                  </div>
                </fieldset>

                <fieldset className="request-section" disabled={busy}>
                  <legend>
                    <span>02</span> {t(TYPE_KEYS[type].title)}
                  </legend>
                  <div className="request-grid">
                    {needsProduct ? (
                      <label className="request-field">
                        <span>{t("rqProductLabel")}</span>
                        <select
                          id="request-productId"
                          className="form-select"
                          value={productId}
                          aria-invalid={Boolean(fieldErrors["productId"])}
                          aria-describedby={
                            fieldErrors["productId"]
                              ? "request-product-error"
                              : undefined
                          }
                          onChange={(e) => setProductId(e.target.value)}
                          required
                        >
                          <option value="">{t("rqProductPlaceholder")}</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <FieldError
                          id="request-product-error"
                          message={fieldErrors["productId"]}
                        />
                      </label>
                    ) : null}
                    {type === "support" ? (
                      <label className="request-field">
                        <span>{t("rqUrgencyLabel")}</span>
                        <select
                          id="request-urgency"
                          className="form-select"
                          value={urgency}
                          aria-invalid={Boolean(fieldErrors["urgency"])}
                          aria-describedby={
                            fieldErrors["urgency"]
                              ? "request-urgency-error"
                              : undefined
                          }
                          onChange={(e) => setUrgency(e.target.value)}
                          required
                        >
                          <option value="">{t("spSelect")}</option>
                          {URGENCIES.map((u) => (
                            <option key={u} value={u}>
                              {t(`rqUrgency_${u}` as keyof Copy)}
                            </option>
                          ))}
                        </select>
                        <FieldError
                          id="request-urgency-error"
                          message={fieldErrors["urgency"]}
                        />
                      </label>
                    ) : null}
                    <label className="request-field request-field-wide">
                      <span>{messageLabel}</span>
                      <Textarea
                        id="request-need"
                        value={need}
                        aria-invalid={Boolean(fieldErrors["need"])}
                        aria-describedby={
                          fieldErrors["need"] ? "request-need-error" : undefined
                        }
                        onChange={(e) => {
                          setNeed(e.target.value);
                          setRec(null);
                        }}
                        placeholder={messagePlaceholder}
                        rows={6}
                        maxLength={2000}
                        required
                      />
                      <FieldError
                        id="request-need-error"
                        message={fieldErrors["need"]}
                      />
                    </label>
                    {type === "feature" ? (
                      <label className="request-field request-field-wide">
                        <span>{t("rqImpactLabel")}</span>
                        <Textarea
                          value={impact}
                          onChange={(e) => setImpact(e.target.value)}
                          placeholder={t("rqImpactPlaceholder")}
                          rows={3}
                          maxLength={1000}
                        />
                      </label>
                    ) : null}
                  </div>
                </fieldset>

                {allowImages ? (
                  <section className="request-section">
                    <h2 className="request-section-title">
                      <span>03</span>{" "}
                      {type === "support"
                        ? t("rqScreenshots")
                        : t("requestImagesSection")}{" "}
                      <small>{t("requestOptional")}</small>
                    </h2>
                    <RequestImages
                      files={images}
                      onChange={setImages}
                      disabled={busy}
                    />
                  </section>
                ) : null}

                {type === "new" &&
                featureEnabled(
                  catalog.settings.featureFlags,
                  "recommendations",
                ) ? (
                  <section
                    className="need-map"
                    aria-label={t("requestAssistantLabel")}
                  >
                    <div className="need-map-head">
                      <div>
                        <span className="request-eyebrow">
                          {t("requestAssistantEyebrow")}
                        </span>
                        <h2>{t("requestAssistantTitle")}</h2>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={analyze}
                        disabled={busy || recBusy || need.trim().length < 8}
                      >
                        {recBusy ? (
                          <Loader2
                            size={16}
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Wand2 size={16} aria-hidden="true" />
                        )}
                        <span>
                          {recBusy
                            ? t("requestAssistantRunning")
                            : rec
                              ? t("requestAssistantAgain")
                              : t("requestAssistantAnalyse")}
                        </span>
                      </Button>
                    </div>
                    {recError && (
                      <p className="request-error" role="alert">
                        {recError}
                      </p>
                    )}
                    {rec ? (
                      <div className="need-map-flow">
                        <div className="need-node need-node-root">
                          <span>{t("requestAssistantYourNeed")}</span>
                          <p>{rec.summary || need.slice(0, 140)}</p>
                        </div>
                        <NeedArrow
                          className="need-arrow"
                          size={20}
                          aria-hidden="true"
                        />
                        <ol className="need-picks">
                          {rec.picks.map((pick, i) => {
                            const stored = catalog.products.find(
                              (item) => item.id === pick.id,
                            );
                            if (!stored) return null;
                            const product = localizedProduct(stored, language);
                            return (
                              <li key={pick.id} className="need-node">
                                <span className="need-rank">{i + 1}</span>
                                <div>
                                  <Link
                                    to="/product/$productId"
                                    params={{ productId: product.id }}
                                    className="need-pick-name"
                                  >
                                    {product.name}
                                  </Link>
                                  <small>{product.label}</small>
                                  {pick.reason && <p>{pick.reason}</p>}
                                </div>
                              </li>
                            );
                          })}
                          {rec.picks.length === 0 && (
                            <li className="need-node">
                              <p>{t("requestAssistantNoMatch")}</p>
                            </li>
                          )}
                        </ol>
                      </div>
                    ) : (
                      <p className="need-map-empty">
                        {t("requestAssistantEmpty")}
                      </p>
                    )}
                  </section>
                ) : null}
              </div>

              {error && (
                <p className="request-error" role="alert">
                  {error}
                </p>
              )}

              <div className="request-dock">
                <span className="request-submit-status" aria-live="polite">
                  {busy
                    ? t("requestSaving")
                    : !ready
                      ? `${t("requestMissingLead")} ${missing.join(" · ")}`
                      : ""}
                </span>
                <Button
                  type="submit"
                  className="request-submit"
                  disabled={busy || recBusy}
                >
                  {busy ? (
                    <Loader2
                      size={16}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Send size={16} aria-hidden="true" />
                  )}
                  <span>
                    {busy
                      ? t("requestSaving")
                      : reviewing
                        ? t("bxConfirmSend")
                        : t("bxReview")}
                  </span>
                </Button>
                {reviewing && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setReviewing(false);
                      setError("");
                    }}
                  >
                    {t("bxBackEdit")}
                  </Button>
                )}
              </div>
              <FormTermsNote />
            </form>

            <aside className="request-aside">
              {!reviewing && (
                <details className="ea-draft-preferences">
                  <summary>
                    {language === "ar"
                      ? "تفضيلات المسودة والخصوصية"
                      : "Draft and privacy preferences"}
                  </summary>
                  <RequestDraftControls
                    status={draft.status}
                    includePersonal={draft.includePersonal}
                    onPersonalChange={draft.setIncludePersonal}
                    onClear={clearDraft}
                  />
                  <MetricsPreference />
                </details>
              )}

              <section>
                <h2>
                  <Mail size={16} aria-hidden="true" /> {t("rqSideEmail")}
                </h2>
                <p>{t("rqSideEmailBody")}</p>
                <a href={`mailto:${contactEmail}`} dir="ltr">
                  {contactEmail}
                </a>
              </section>
              <section>
                <h2>
                  <HandHeart size={16} aria-hidden="true" />{" "}
                  {t("rqSideSupport")}
                </h2>
                <p>{t("rqSideSupportBody")}</p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/support">{t("navSupport")}</Link>
                </Button>
              </section>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
