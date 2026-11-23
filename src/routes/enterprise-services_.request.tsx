import { RequestReceipt } from "@/components/request-receipt";
import { FormTermsNote } from "@/components/form-terms-note";
import { FeatureGate } from "@/components/feature-gate";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  LifeBuoy,
  Loader2,
  Mail,
  MessageCircle,
  Rocket,
  Send,
  Settings2,
} from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { localizedProduct } from "@/lib/catalog";
import { useLanguage } from "@/lib/language";
import { dictionaries, fill, type Copy } from "@/lib/copy";
import { submitRequest } from "@/lib/requests.functions";
import {
  requestSchema,
  SERVICE_KINDS,
  SERVICE_TIMELINES,
  TEAM_SIZES,
  type ServiceKind,
} from "@/lib/requests.shared";
import { consultantContact, whatsappUrl } from "@/lib/theme-customization";
import { useActiveTheme } from "@/themes/use-active-theme";
import {
  RequestDraftControls,
  RequestReview,
  FieldError,
} from "@/components/request-draft-controls";
import { JourneyRating } from "@/components/journey-rating";
import { MetricsPreference } from "@/components/metrics-preference";
import {
  metricsAllowed,
  trackJourney,
  trackProductEvent,
} from "@/lib/journey-client";
import { useRequestDraft } from "@/lib/request-draft";
import { currentVisitorAccess } from "@/lib/current-visitor-access";

const URL = "https://www.e20e.tools/enterprise-services/request";
const TITLE = "Request an enterprise service — E20E Tools | اطلب خدمة لمؤسستك";
const DESCRIPTION =
  "Ask the E20E Tools services team to implement, roll out, train and support the platform's tools inside your organisation. اطلب تنفيذ أدوات المنصة وتطبيقها وتدريب فرقك ودعمها داخل مؤسستك.";

type ServiceSearch = {
  tool?: string | undefined;
  service?: string | undefined;
};

export const Route = createFileRoute("/enterprise-services_/request")({
  validateSearch: (search: Record<string, unknown>): ServiceSearch => ({
    tool:
      typeof search["tool"] === "string"
        ? search["tool"].slice(0, 80)
        : undefined,
    service:
      typeof search["service"] === "string"
        ? search["service"].slice(0, 20)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: URL },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(catalogQueryOptions),
  component: ServiceRequestPage,
});

const SERVICE_ICONS: Record<ServiceKind, typeof Settings2> = {
  implementation: Settings2,
  rollout: Rocket,
  training: GraduationCap,
  support: LifeBuoy,
};

/** "1-10" → "1_10", "200+" → "200", "1-3m" → "1_3m" (copy key suffixes). */
const keyPart = (value: string) =>
  value.replace(/[^a-z0-9]+/gi, "_").replace(/_+$/, "");

const hiddenTrap = {
  position: "absolute",
  width: 1,
  height: 1,
  opacity: 0,
  overflow: "hidden",
  clipPath: "inset(50%)",
  pointerEvents: "none",
} as const;

function ServiceRequestPage() {
  return (
    <FeatureGate featureKey="enterprise">
      <ServiceRequestContent />
    </FeatureGate>
  );
}

function ServiceRequestContent() {
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const search = Route.useSearch();
  const { language, dir, t } = useLanguage();
  const tr = (key: string) =>
    key in dictionaries.ar ? t(key as keyof Copy) : key;
  const products = catalog.products
    .filter((p) => !p.comingSoon && p.servicesEnabled !== false)
    .map((p) => localizedProduct(p, language));
  const theme = useActiveTheme(catalog.settings.designTheme.theme);
  const contact = consultantContact(
    catalog.settings.themeCustomizations?.[theme],
    catalog.settings.contactInfo.email,
  );
  const whatsapp = whatsappUrl(contact.whatsapp);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [services, setServices] = useState<ServiceKind[]>(() =>
    (SERVICE_KINDS as readonly string[]).includes(search.service ?? "")
      ? [search.service as ServiceKind]
      : [],
  );
  const [tools, setTools] = useState<string[]>(() =>
    products.some((p) => p.id === search.tool) ? [search.tool ?? ""] : [],
  );
  const [teamSize, setTeamSize] = useState("");
  const [timeline, setTimeline] = useState("");
  const [exercise,setExercise]=useState("");
  useEffect(()=>{
    const match=/^#exercise-([a-f0-9-]{36})$/.exec(window.location.hash);if(!match)return;
    try{const key="e20e-exercise:"+match[1];const item=JSON.parse(sessionStorage.getItem(key)??"null");
    if(item?.tool===search.tool && item.expires>Date.now() && typeof item.result==="string")setExercise(item.result.slice(0,2000));
    sessionStorage.removeItem(key);history.replaceState(history.state,"",location.pathname+location.search);
    }catch{/* Optional handoff when storage is available. */}
  },[search.tool]);
  const [need, setNeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{
    id: string;
    createdAt: string;
    tracking: "account" | "guest" | "none";
  } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const requestId = useRef("");
  const sendRequest = useServerFn(submitRequest);
  const BackArrow = dir === "rtl" ? ArrowRight : ArrowLeft;
  const draftValue = {
    exercise,
    services,
    tools,
    teamSize,
    timeline,
    name,
    email,
    phone,
    company,
    need,
  };
  const restoreDraft = useCallback(
    (values: Record<string, unknown>) => {
      if (Array.isArray(values["services"]))
        setServices(values["services"] as ServiceKind[]);
      if (Array.isArray(values["tools"]))
        setTools(
          (values["tools"] as string[]).filter((id) =>
            catalog.products.some((p) => p.id === id && !p.comingSoon && p.servicesEnabled !== false),
          ),
        );
      if (typeof values["teamSize"] === "string")
        setTeamSize(values["teamSize"]);
      if (typeof values["timeline"] === "string")
        setTimeline(values["timeline"]);
      if (typeof values["name"] === "string") setName(values["name"]);
      if (typeof values["email"] === "string") setEmail(values["email"]);
      if (typeof values["phone"] === "string") setPhone(values["phone"]);
      if (typeof values["company"] === "string") setCompany(values["company"]);
      if(typeof values["exercise"]==="string")setExercise(values["exercise"]);
      if (typeof values["need"] === "string") setNeed(values["need"]);
    },
    [catalog.products],
  );
  const resetFields = () => {
    setExercise("");
    setServices([]);
    setTools([]);
    setTeamSize("");
    setTimeline("");
    setName("");
    setEmail("");
    setPhone("");
    setCompany("");
    setNeed("");
    setFieldErrors({});
  };
  // Identity change: drop the previous owner's fields, receipt and review state from memory.
  // Bumped on identity change so an in-flight submit cannot paint the previous owner's receipt.
  const identityEpoch = useRef(0);
  const resetForIdentity = () => {
    identityEpoch.current += 1;
    resetFields();
    requestId.current = "";
    setReviewing(false);
    setReceipt(null);
    setError("");
    setBusy(false);
  };
  const draft = useRequestDraft(
    "service",
    draftValue,
    restoreDraft,
    resetForIdentity,
  );
  const clearDraft = () => {
    draft.clear();
    resetFields();
  };

  const toggle = <T extends string>(list: T[], value: T, on: boolean) =>
    on
      ? [...list.filter((item) => item !== value), value]
      : list.filter((item) => item !== value);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const validation = requestSchema.safeParse({
      requestId: requestId.current,
      type: "service",
      exercise,
      name,
      email,
      phone,
      company,
      need,
      services,
      tools,
      teamSize,
      timeline,
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
            `service-${String(validation.error.issues[0]?.path[0] ?? "name")}`,
          )
          ?.focus(),
      );
      return;
    }
    setFieldErrors({});
    if (!reviewing) {
      setReviewing(true);
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    const epoch = identityEpoch.current;
    try {
      const form = new FormData();
      form.set("language", language);
      form.set("metrics", metricsAllowed() ? "on" : "off");
      const visitorAccess = await currentVisitorAccess();
      if (epoch !== identityEpoch.current) return;
      if (visitorAccess) form.set("visitorAccess", visitorAccess);
      Object.entries(validation.data).forEach(([key, value]) => {
        if (typeof value === "string") form.set(key, value);
      });
      form.set("services", JSON.stringify(validation.data.services));
      form.set("tools", JSON.stringify(validation.data.tools));
      const trap = document.getElementById(
        "service-website",
      ) as HTMLInputElement | null;
      form.set("website", trap?.value ?? "");
      const result = await sendRequest({ data: form });
      if (epoch !== identityEpoch.current) return;
      if (result.ok) {
        trackProductEvent("project.request_receipt_confirmed", {
          request_type: "service",
          has_product: tools.length > 0,
        });
        void trackJourney("service_receipt", language, {
          oncePerSession: true,
        });
        if(exercise.trim())void trackJourney("exercise_requested",language,{oncePerSession:true});
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
      setError(/^(rq|sr)/.test(message) ? tr(message) : t("requestSaveError"));
    } finally {
      if (epoch === identityEpoch.current) setBusy(false);
    }
  }

  const missing = [
    name.trim().length < 2 && t("requestMissingName"),
    !email.includes("@") && t("requestMissingEmail"),
    phone.replace(/\D/g, "").length < 7 && t("requestMissingPhone"),
    company.trim().length < 2 && t("srMissingOrg"),
    services.length === 0 && t("srMissingServices"),
    need.trim().length < 20 && t("rqMissingMessage"),
  ].filter(Boolean);
  const ready = missing.length === 0;

  return (
    <main data-archy-service={services[0]??""} data-archy-tool={tools[0]??""} className="library-page request-page" dir={dir}>
      <div className="request-shell request-shell-wide">
        <Link
          to="/enterprise-services"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <BackArrow size={16} aria-hidden="true" />
          {t("srBack")}
        </Link>
        {receipt ? (
          <div className="request-success" role="status">
            <CheckCircle2 size={40} aria-hidden="true" />
            <h1>{t("requestReceivedTitle")}</h1>
            <p>
              {fill(t("requestThanks"), name.split(" ")[0] ?? "")}{" "}
              {t("srSavedBody")}
            </p>
            <RequestReceipt receipt={receipt} subject={[...services.map(k => t(`srService_${k}` as keyof Copy)), ...products.filter(p => tools.includes(p.id)).map(p => p.name)].join(" · ")} summary={need} />
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline">
                <Link to="/enterprise-services">{t("srBack")}</Link>
              </Button>
            </div>
            <JourneyRating />
          </div>
        ) : (
          <div className="request-layout">
            <form
              onChange={() => {
                void trackJourney("service_started", language, {
                  oncePerSession: true,
                });
              }}
              className="request-form"
              onSubmit={submit}
              aria-busy={busy}
              noValidate
            >
              <input
                id="service-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={hiddenTrap}
              />
              <header className="request-head">
                <span className="request-eyebrow">{t("srEyebrow")}</span>
                <h1>{t("srTitle")}</h1>
                <p>{t("srLead")}</p>
              </header>
              {!reviewing && (
                <RequestDraftControls
                  status={draft.status}
                  includePersonal={draft.includePersonal}
                  onPersonalChange={draft.setIncludePersonal}
                  onClear={clearDraft}
                />
              )}
              {!reviewing && (
                <section className="ea-scope-summary" aria-live="polite">
                  <h2>
                    {language === "ar" ? "نطاق طلبك" : "Your request scope"}
                  </h2>
                  <p>
                    {services
                      .map((k) => t(`srService_${k}` as keyof Copy))
                      .join(" · ") ||
                      (language === "ar"
                        ? "اختر الخدمة"
                        : "Choose a service")}{" "}
                    ·{" "}
                    {products
                      .filter((p) => tools.includes(p.id))
                      .map((p) => p.name)
                      .join(" · ") ||
                      (language === "ar"
                        ? "الأداة تُحدّد لاحقًا"
                        : "Tool to be decided")}
                  </p>
                  <a href="#service-services">
                    {language === "ar" ? "تعديل الخدمة" : "Edit service"}
                  </a>{" "}
                  ·{" "}
                  <a href="#service-tool-options">
                    {language === "ar" ? "تعديل الأدوات" : "Edit tools"}
                  </a>
                </section>
              )}
              {!reviewing && exercise && <section className="ea-scope-summary"><label className="grid">{language==="ar"?"نتيجة التمرين المرفقة — راجعها قبل الإرسال":"Attached exercise result — review before sending"}<Textarea maxLength={2000} rows={6} value={exercise} onChange={e=>setExercise(e.target.value)}/></label><button type="button" onClick={()=>setExercise("")}>{language==="ar"?"إزالة المرفق":"Remove attachment"}</button></section>}
              {!reviewing && <MetricsPreference />}
              {reviewing && (
                <RequestReview
                  items={[
                    { label: t("requestNameLabel"), value: name },
                    { label: t("requestEmailLabel"), value: email },
                    { label: t("rqPhoneSupport"), value: phone },
                    { label: t("srOrgLabel"), value: company },
                    {
                      label: t("srServicesSection"),
                      value: services
                        .map((kind) => t(`srService_${kind}` as keyof Copy))
                        .join(" · "),
                    },
                    {
                      label: t("srToolsLegend"),
                      value: tools
                        .map(
                          (id) => products.find((p) => p.id === id)?.name ?? "",
                        )
                        .filter(Boolean)
                        .join(" · "),
                    },
                    { label: t("srTeamLabel"), value: teamSize },
                    { label: t("srTimelineLabel"), value: timeline },
                    { label: t("srDetailsLabel"), value: need },
                    ...(exercise?[{label:language==="ar"?"نتيجة التمرين":"Exercise result",value:exercise}]:[]),
                  ]}
                />
              )}
              <div className={reviewing ? "hidden" : "contents"}>
                <fieldset className="request-section" disabled={busy}>
                  <legend>
                    <span>01</span> {t("srServicesSection")}
                  </legend>
                  <div
                    id="service-services"
                    tabIndex={-1}
                    aria-describedby={
                      fieldErrors["services"]
                        ? "service-services-error"
                        : undefined
                    }
                  >
                    <p className="mb-3 text-sm text-muted-foreground">
                      {t("srServicesHint")}
                    </p>
                    <div className="choice-cards">
                      {SERVICE_KINDS.map((kind) => {
                        const Icon = SERVICE_ICONS[kind];
                        const checked = services.includes(kind);
                        return (
                          <label
                            key={kind}
                            className="choice-card"
                            data-selected={checked}
                          >
                            <input
                              type="checkbox"
                              name="services"
                              value={kind}
                              checked={checked}
                              onChange={(e) => {
                                setServices((prev) =>
                                  toggle(prev, kind, e.target.checked),
                                );
                                setError("");
                              }}
                            />
                            <Icon
                              size={20}
                              aria-hidden="true"
                              className="text-primary"
                            />
                            <strong>
                              {t(`srService_${kind}` as keyof Copy)}
                            </strong>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <FieldError
                    id="service-services-error"
                    message={fieldErrors["services"]}
                  />
                </fieldset>

                <fieldset className="request-section" disabled={busy}>
                  <legend>
                    <span>02</span> {t("requestContactSection")}
                  </legend>
                  <div className="request-grid">
                    <label className="request-field">
                      <span>{t("requestNameLabel")}</span>
                      <Input
                        id="service-name"
                        value={name}
                        aria-invalid={Boolean(fieldErrors["name"])}
                        aria-describedby={
                          fieldErrors["name"] ? "service-name-error" : undefined
                        }
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("requestNamePlaceholder")}
                        maxLength={100}
                        autoComplete="name"
                        required
                      />
                      <FieldError
                        id="service-name-error"
                        message={fieldErrors["name"]}
                      />
                    </label>
                    <label className="request-field">
                      <span>{t("requestEmailLabel")}</span>
                      <Input
                        id="service-email"
                        type="email"
                        dir="ltr"
                        value={email}
                        aria-invalid={Boolean(fieldErrors["email"])}
                        aria-describedby={
                          fieldErrors["email"]
                            ? "service-email-error"
                            : undefined
                        }
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        maxLength={255}
                        autoComplete="email"
                        required
                      />
                      <FieldError
                        id="service-email-error"
                        message={fieldErrors["email"]}
                      />
                    </label>
                    <label className="request-field">
                      <span>{t("rqPhoneSupport")}</span>
                      <Input
                        id="service-phone"
                        type="tel"
                        dir="ltr"
                        value={phone}
                        aria-invalid={Boolean(fieldErrors["phone"])}
                        aria-describedby={
                          fieldErrors["phone"]
                            ? "service-phone-error"
                            : undefined
                        }
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+966 5X XXX XXXX"
                        maxLength={20}
                        minLength={7}
                        autoComplete="tel"
                        required
                      />
                      <FieldError
                        id="service-phone-error"
                        message={fieldErrors["phone"]}
                      />
                    </label>
                    <label className="request-field">
                      <span>{t("srOrgLabel")}</span>
                      <Input
                        id="service-company"
                        value={company}
                        aria-invalid={Boolean(fieldErrors["company"])}
                        aria-describedby={
                          fieldErrors["company"]
                            ? "service-company-error"
                            : undefined
                        }
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder={t("srOrgPlaceholder")}
                        maxLength={150}
                        autoComplete="organization"
                        required
                      />
                      <FieldError
                        id="service-company-error"
                        message={fieldErrors["company"]}
                      />
                    </label>
                  </div>
                </fieldset>

                <fieldset className="request-section" disabled={busy}>
                  <legend>
                    <span>03</span> {t("srProjectSection")}
                  </legend>
                  <div className="request-grid">
                    {products.length > 0 ? (
                      <fieldset
                        id="service-tool-options"
                        className="request-field request-field-wide"
                        style={{ border: 0, padding: 0, margin: 0 }}
                      >
                        <legend style={{ marginBottom: 6 }}>
                          {t("srToolsLegend")}{" "}
                          <small className="font-normal text-muted-foreground">
                            {t("srToolsHint")}
                          </small>
                        </legend>
                        <div className="check-grid">
                          {products.map((product) => (
                            <label key={product.id} className="check-chip">
                              <input
                                type="checkbox"
                                checked={tools.includes(product.id)}
                                onChange={(e) =>
                                  setTools((prev) =>
                                    toggle(prev, product.id, e.target.checked),
                                  )
                                }
                              />
                              <span dir="auto">{product.name}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ) : null}
                    <details className="ea-flow-details request-field-wide">
                      <summary>
                        {language === "ar"
                          ? "تفاصيل اختيارية عن الفريق والموعد"
                          : "Optional team and timing details"}
                      </summary>
                      <label className="request-field">
                        <span>
                          {t("srTeamLabel")} <small>{t("srOptional")}</small>
                        </span>
                        <select
                          className="form-select"
                          value={teamSize}
                          onChange={(e) => setTeamSize(e.target.value)}
                        >
                          <option value="">{t("spSelect")}</option>
                          {TEAM_SIZES.map((size) => (
                            <option key={size} value={size}>
                              {t(`srTeam_${keyPart(size)}` as keyof Copy)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="request-field">
                        <span>
                          {t("srTimelineLabel")}{" "}
                          <small>{t("srOptional")}</small>
                        </span>
                        <select
                          className="form-select"
                          value={timeline}
                          onChange={(e) => setTimeline(e.target.value)}
                        >
                          <option value="">{t("spSelect")}</option>
                          {SERVICE_TIMELINES.map((value) => (
                            <option key={value} value={value}>
                              {t(`srTimeline_${keyPart(value)}` as keyof Copy)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </details>
                    <label className="request-field request-field-wide">
                      <span>{t("srDetailsLabel")}</span>
                      <Textarea
                        id="service-need"
                        value={need}
                        aria-invalid={Boolean(fieldErrors["need"])}
                        aria-describedby={
                          fieldErrors["need"] ? "service-need-error" : undefined
                        }
                        onChange={(e) => setNeed(e.target.value)}
                        placeholder={t("srDetailsPlaceholder")}
                        rows={6}
                        maxLength={2000}
                        required
                      />
                      <small className="text-muted-foreground">
                        {t("ctMessageHint")}
                      </small>
                      <FieldError
                        id="service-need-error"
                        message={fieldErrors["need"]}
                      />
                    </label>
                  </div>
                </fieldset>
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
                  disabled={busy}
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
              <section>
                <h2>
                  <Mail size={16} aria-hidden="true" /> {t("srSideTitle")}
                </h2>
                <p>{t("srSideBody")}</p>
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}?subject=Enterprise%20Services`}
                    dir="ltr"
                  >
                    {contact.email}
                  </a>
                ) : null}
                {whatsapp ? (
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle size={16} aria-hidden="true" />
                      {t("esWhatsappCta")}
                      <span className="sr-only">{t("esNewTab")}</span>
                    </a>
                  </Button>
                ) : null}
              </section>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
