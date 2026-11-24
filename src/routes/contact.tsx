import { RequestReceipt, type Receipt } from "@/components/request-receipt";
import { currentVisitorAccess } from "@/lib/current-visitor-access";
import { metricsAllowed, trackJourney } from "@/lib/journey-client";
import { JourneyHeading } from "@/studio/journey-heading";
import { FormTermsNote } from "@/components/form-terms-note";
import { FeatureGate } from "@/components/feature-gate";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  LifeBuoy,
  BriefcaseBusiness,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitRequest } from "@/lib/requests.functions";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { consultantContact, whatsappUrl } from "@/lib/theme-customization";
import { useActiveTheme } from "@/themes/use-active-theme";
import { pageUrl } from "@/lib/seo";
import { dictionaries } from "@/lib/copy";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact us — E20E Tools | اتصل بنا" },
      {
        name: "description",
        content:
          "Email, phone and address for E20E Tools. بيانات التواصل مع المنصة.",
      },
      { property: "og:title", content: "Contact us — E20E Tools | اتصل بنا" },
      {
        property: "og:description",
        content: "Reach the E20E Tools team. تواصل مع فريق المنصة.",
      },
      { property: "og:url", content: pageUrl("/contact") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: pageUrl("/contact") }],
  }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(catalogQueryOptions);
  },
  component: ContactPage,
});

function ContactPage() {
  return (
    <FeatureGate featureKey="contact">
      <ContactContent />
    </FeatureGate>
  );
}

function ContactContent() {
  const { dir, language, t } = useLanguage();
  const { data } = useSuspenseQuery(catalogQueryOptions);
  const info = data.settings.contactInfo;
  // The design on screen picks its own team contact (Design customisation).
  const theme = useActiveTheme(data.settings.designTheme.theme);
  const contact = consultantContact(
    data.settings.themeCustomizations?.[theme],
    info.email,
  );
  const whatsapp = whatsappUrl(contact.whatsapp);
  const ar = language === "ar";
  const address =
    (ar ? info.addressAr : info.addressEn) || info.addressAr || info.addressEn;
  const email = contact.email || info.email;
  const items = [
    whatsapp && {
      icon: MessageCircle,
      label: t("ctWhatsappCta"),
      value: contact.whatsapp,
      href: whatsapp,
    },
    email && {
      icon: Mail,
      label: t("pubContactEmail"),
      value: email,
      href: `mailto:${email}`,
    },
    info.phone && {
      icon: Phone,
      label: t("pubContactPhone"),
      value: info.phone,
      href: `tel:${info.phone.replace(/[^0-9+]/g, "")}`,
    },
    info.website && {
      icon: Globe,
      label: t("pubContactWebsite"),
      value: info.website,
      href: info.website,
    },
    address && {
      icon: MapPin,
      label: t("pubContactAddress"),
      value: address,
      href: "",
    },
  ].filter(Boolean) as {
    icon: typeof Mail;
    label: string;
    value: string;
    href: string;
  }[];

  return (
    <main className="library-page ea-workspace ea-contact" dir={dir}>
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <JourneyHeading
          icon={Mail}
          title={t("pubContactTitle")}
          description={dictionaries[ar ? "ar" : "en"].contactChooseWhatYouNeed}
        />
        <nav
          className="ea-intents"
          aria-label={
            dictionaries[ar ? "ar" : "en"].contactReasonForContactingUs
          }
        >
          <a href="#contact-form">
            <Mail aria-hidden="true" />
            <span>
              <strong>
                {dictionaries[ar ? "ar" : "en"].contactGeneralEnquiry}
              </strong>
              <small>
                {dictionaries[ar ? "ar" : "en"].contactSendAMessageTo}
              </small>
            </span>
          </a>
          <Link to="/request" search={{ type: "support" }}>
            <LifeBuoy aria-hidden="true" />
            <span>
              <strong>
                {dictionaries[ar ? "ar" : "en"].contactProductSupport}
              </strong>
              <small>
                {dictionaries[ar ? "ar" : "en"].contactGetHelpWithA}
              </small>
            </span>
          </Link>
          <Link to="/enterprise-services">
            <BriefcaseBusiness aria-hidden="true" />
            <span>
              <strong>
                {dictionaries[ar ? "ar" : "en"].contactTrainingOrImplementation}
              </strong>
              <small>
                {dictionaries[ar ? "ar" : "en"].contactExploreServicesForYour}
              </small>
            </span>
          </Link>
        </nav>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <ContactForm />
          <aside className="grid min-w-0 gap-6" aria-label={t("ctDirectTitle")}>
            <section className="rounded-xl border border-border bg-card p-6 text-card-foreground">
              <h2 className="text-lg font-semibold">{t("ctDirectTitle")}</h2>
              {items.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("pubContactEmpty")}
                </p>
              ) : (
                <ul className="mt-4 grid gap-1">
                  {items.map(({ icon: Icon, label, value, href }) => (
                    <li key={label}>
                      <ChannelRow
                        icon={Icon}
                        label={label}
                        value={value}
                        href={href}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function ChannelRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  href: string;
}) {
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span
          className="mt-0.5 block whitespace-pre-line break-words font-medium"
          dir={href ? "ltr" : "auto"}
        >
          {value}
        </span>
      </span>
    </>
  );
  const row = "flex items-center gap-3 rounded-lg p-2";
  return href ? (
    <a
      href={href}
      {...(href.startsWith("http")
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className={`${row} -mx-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
    >
      {body}
    </a>
  ) : (
    <div className={`${row} -mx-2`}>{body}</div>
  );
}

function ContactForm() {
  const { t, language } = useLanguage();
  const ar = language === "ar";
  const [callback, setCallback] = useState(false);
  const started = useRef(false);
  const send = useServerFn(submitRequest);
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<
    (Receipt & { summary: string }) | null
  >(null);
  const [length, setLength] = useState(0);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("requestId", requestId);
    form.set("type", "general");
    form.set("language", language);
    form.set("metrics", metricsAllowed() ? "on" : "off");
    setBusy(true);
    setError("");
    try {
      form.set("source", "contact");
      form.set("visitorAccess", await currentVisitorAccess());
      const result = await send({ data: form });
      if (result.ok) {
        setReceipt({
          id: result.id,
          createdAt: result.createdAt,
          tracking: result.tracking,
          summary: String(form.get("need") ?? ""),
        });
        void trackJourney("contact_receipt", language);
      } else setError(t(result.message as never));
    } catch (err) {
      const key = err instanceof Error ? err.message : "";
      setError(key.startsWith("rq") ? t(key as never) : t("rqErrSave"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="contact-form"
      className="min-w-0 rounded-xl border border-border bg-card p-6 text-card-foreground sm:p-8"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mail size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{t("ctFormTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("ctFormLead")}
          </p>
        </div>
      </div>
      {receipt ? (
        <div className="mt-6 grid gap-3">
          <p role="status">{t("ctDone")}</p>
          <RequestReceipt
            receipt={receipt}
            summary={receipt.summary}
            subject={t("rqType_general")}
          />
        </div>
      ) : (
        <form
          onChange={() => {
            if (!started.current) {
              started.current = true;
              void trackJourney("contact_started", language);
            }
          }}
          onSubmit={onSubmit}
          className="mt-6 grid gap-4 sm:grid-cols-2"
        >
          <label className="grid gap-1 text-sm">
            {t("ctName")}
            <Input
              name="name"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
            />
          </label>
          <label className="grid gap-1 text-sm">
            {t("ctEmail")}
            <Input
              name="email"
              type="email"
              required
              maxLength={255}
              dir="ltr"
              autoComplete="email"
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={callback}
              onChange={(e) => setCallback(e.target.checked)}
            />
            {dictionaries[ar ? "ar" : "en"].contactIDLikeA}
          </label>
          {callback && (
            <label className="grid gap-1 text-sm sm:col-span-2">
              {t("ctPhone")}
              <Input
                name="phone"
                type="tel"
                required
                minLength={7}
                maxLength={20}
                dir="ltr"
                autoComplete="tel"
              />
            </label>
          )}
          <label className="grid gap-1 text-sm sm:col-span-2">
            {t("rqMessageLabel")}
            <Textarea
              name="need"
              required
              minLength={5}
              maxLength={2000}
              rows={6}
              aria-describedby="contact-need-hint"
              onChange={(event) => setLength(event.target.value.length)}
            />
            <span
              id="contact-need-hint"
              className="flex justify-between gap-3 text-xs text-muted-foreground"
            >
              <span>
                {dictionaries[ar ? "ar" : "en"].contactUseAtLeastFive}
              </span>
              <span dir="ltr" className="tabular-nums">
                {length} / 2000
              </span>
            </span>
          </label>
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />
          {error && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {error}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            disabled={busy}
            className="sm:col-span-2 sm:justify-self-start"
          >
            {busy ? t("ctSending") : t("ctFormTitle")}
          </Button>
          <small>
            {dictionaries[ar ? "ar" : "en"].contactAfterSendingYouLl}
          </small>
          <FormTermsNote />
        </form>
      )}
    </section>
  );
}
