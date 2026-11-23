import { scopeDetails } from "@/lib/product-cases";
import { trackJourney } from "@/lib/journey-client";
import { useEffect, useState } from "react";
import { useHydrated } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  GraduationCap,
  LifeBuoy,
  Mail,
  MessageCircle,
  Rocket,
  Settings2,
} from "lucide-react";
import { FeatureGate } from "@/components/feature-gate";
import { useLanguage } from "@/lib/language";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { localizedProduct } from "@/lib/catalog";
import { consultantContact, whatsappUrl } from "@/lib/theme-customization";
import { useActiveTheme } from "@/themes/use-active-theme";

const disciplines = [
  [Settings2, "esImplTitle", "esImplBody"],
  [Rocket, "esRolloutTitle", "esRolloutBody"],
  [GraduationCap, "esTrainingTitle", "esTrainingBody"],
  [LifeBuoy, "esSupportTitle", "esSupportBody"],
] as const;
const steps = [
  ["esStep1Title", "esStep1Body"],
  ["esStep2Title", "esStep2Body"],
  ["esStep3Title", "esStep3Body"],
  ["esStep4Title", "esStep4Body"],
] as const;
function EnterpriseContent() {
  const ready = useHydrated();
  const { language, t } = useLanguage();
  const ar = language === "ar";
  const { data } = useSuspenseQuery(catalogQueryOptions);
  const theme = useActiveTheme(data.settings.designTheme.theme);
  const contact = consultantContact(
    data.settings.themeCustomizations?.[theme],
    data.settings.contactInfo.email,
  );
  const wa = whatsappUrl(contact.whatsapp);
  const [active, setActive] = useState(0);
  const [tool, setTool] = useState("");
  const serviceIds = [
    "implementation",
    "rollout",
    "training",
    "support",
  ] as const;
  const available = data.products.filter((p) => !p.comingSoon && p.servicesEnabled !== false);
  useEffect(()=>{
    const q=new URLSearchParams(window.location.search);
    const index=["implementation","rollout","training","support"].indexOf(q.get("service")??"");
    if(index>=0)setActive(index);
    const id=q.get("tool"); if(id && data.products.some(p=>p.id===id&&!p.comingSoon&&p.servicesEnabled!==false))setTool(id);
  },[data.products]);
  const [prepare,deliver]=scopeDetails(tool,serviceIds[active]!,ar);
  const toolName = available.find((p) => p.id === tool)?.name;
  const startSelection = () => {
    void trackJourney("service_started", language, { oncePerSession: true });
  };
  const outcomes = ar
    ? [
        "تهيئة الأداة وتوثيق إعداداتها لفريقك.",
        "خطة إطلاق على مراحل وقائمة تحقق لكل مرحلة.",
        "ورشة تطبيقية وتمارين على حالات فريقك.",
        "تشخيص المشكلة وخطوات المعالجة والمتابعة.",
      ]
    : [
        "A configured tool and a record of your settings.",
        "A phased rollout plan with a checklist for each stage.",
        "A practical workshop with exercises based on your team’s work.",
        "An issue assessment and documented follow-up actions.",
      ];
  const params = new URLSearchParams({
    service: serviceIds[active] ?? "implementation",
  });
  if (tool) params.set("tool", tool);
  const requestUrl = "/enterprise-services/request?" + params.toString();
  return (
    <main className="s-enterprise" data-archy-tool={tool} data-archy-service={serviceIds[active]}>
      <div className="s-enter-hero">
        <div className="s-section">
          <p className="s-eyebrow">
            <i />
            E20E TOOLS
          </p>
          <h1>{t("navEnterprise")}</h1>
          <p>{t("esLead")}</p>
          <div className="ea-service-entry">
          <a className="s-solid" href="#choose-service">
            {ar ? "اختر الخدمة والأداة" : "Choose a service and tool"}
          </a>
          <a href={requestUrl} onClick={startSelection}>
            {t("esCta")}
            <ArrowUpRight size={16} />
          </a>
          </div>
        </div>
      </div>
      <section id="choose-service" className="s-section s-enter-cols">
        <div>
          <h2>{t("esServicesTitle")}</h2>
          <p className="s-enter-hint">
            {ar
              ? "اختر الخدمة المطلوبة لتكوين نطاق الطلب."
              : "Select the service to scope your request."}
          </p>
          <div className="s-disciplines">
            {disciplines.map(([Icon, title, body], index) => (
              <div key={title}>
                <h3>
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={() => {
                      setActive(index);
                      startSelection();
                    }}
                    aria-expanded={index === active}
                    aria-controls={"discipline-" + index}
                  >
                    <Icon size={21} />
                    {t(title)}
                    <b aria-hidden="true">{index === active ? "−" : "+"}</b>
                  </button>
                </h3>
                <p id={"discipline-" + index} hidden={index !== active}>
                  {t(body)} <strong className="block">{outcomes[index]}</strong>
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="nx-service-builder">
          <h3>{ar ? "نطاق طلبك" : "Your service request"}</h3>
          <p className="ea-scope-choice">{t(disciplines[active]![1])}</p>
          <label>
            {ar ? "الأداة المعنيّة" : "Tool in scope"}
            <select
              disabled={!ready}
              value={tool}
              onChange={(e) => setTool(e.target.value)}
            >
              <option value="">{ar ? "أحدّدها لاحقًا" : "Decide later"}</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <dl aria-live="polite" className="ea-scope-deliverables"><dt>{ar?"قبل البدء":"Before you start"}</dt><dd>{prepare}</dd><dt>{ar?"ما ستحصل عليه":"What you’ll receive"}</dt><dd>{deliver}</dd></dl>
          <a className="s-solid" href={requestUrl} onClick={startSelection}>
            {ar ? "متابعة طلب " : "Continue with "}
            {t(disciplines[active]![1])}
            {toolName && (ar ? " — " : " for ") + toolName}{" "}
            <ArrowUpRight size={16} />
          </a>
        </div>
      </section>
      <section className="s-service-band">
        <div className="s-section">
          <h2>{t("esStepsTitle")}</h2>
          <ol className="s-steps">
            {steps.map(([title, body], i) => (
              <li key={title}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <h3>{t(title)}</h3>
                <p>{t(body)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="s-section s-enter-cols">
        <div>
          <h2>{t("esToolsTitle")}</h2>
          <p className="s-enter-hint">{t("esToolsLead")}</p>
        </div>
        <div className="s-tools-list">
          {[false, true].map((soon) => {
            const tools = data.products.filter((p) => Boolean(p.comingSoon) === soon && (soon || p.servicesEnabled !== false));
            return (
              tools.length > 0 && (
                <section key={String(soon)}>
                  <h3>
                    {soon
                      ? t("comingSoonBadge")
                      : ar
                        ? "متاح للخدمات الآن"
                        : "Available for services"}
                  </h3>
                  {tools.map((item) => {
                    const p = localizedProduct(item, language);
                    return (
                      <a
                        key={p.id}
                        onClick={soon ? undefined : startSelection}
                        href={
                          soon
                            ? "/newsletter#product=" + encodeURIComponent(p.id)
                            : "/enterprise-services/request?service=" +
                              serviceIds[active] +
                              "&tool=" +
                              encodeURIComponent(p.id)
                        }
                      >
                        <strong dir="auto">{p.name}</strong>
                        <small>
                          {soon
                            ? ar
                              ? "أبلغني عند الإطلاق"
                              : "Notify me at launch"
                            : ar
                              ? "طلب خدمة"
                              : "Request a service"}
                        </small>
                        <ArrowUpRight size={16} />
                      </a>
                    );
                  })}
                </section>
              )
            );
          })}
        </div>
      </section>
      <section className="s-enter-tail">
        <div className="s-section">
          <h2>{t("esFinalTitle")}</h2>
          <p>{t("esFinalBody")}</p>
          <div>
            <a className="s-solid" href={requestUrl} onClick={startSelection}>
              {t("esCta")}
              <ArrowUpRight size={16} />
            </a>
            {contact.email && (
              <a
                href={
                  "mailto:" + contact.email + "?subject=Enterprise%20Services"
                }
              >
                <Mail size={16} />
                {t("esEmailCta")}
              </a>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer">
                <MessageCircle size={16} />
                {t("esWhatsappCta")}
              </a>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
export function StudioEnterprise() {
  return (
    <FeatureGate featureKey="enterprise">
      <EnterpriseContent />
    </FeatureGate>
  );
}
