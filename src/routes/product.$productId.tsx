import { WorkCard } from "@/components/work-cards";
import { StepHelp } from "@/components/step-help";
import { productPractice } from "@/lib/product-practice";
import { ProductCase } from "@/components/product-case";
import { archoneLaunchLabel } from "@/lib/archone-launch";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { shareImageMeta } from "@/lib/share";
import { ArrowUpLeft, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { localizedProduct } from "@/lib/catalog";
import { useLanguage } from "@/lib/language";
import { fill } from "@/lib/copy";
import { useThemeArt } from "@/themes/use-theme-art";
import { pageUrl } from "@/lib/seo";
import {
  DISCOVERY_GOALS,
  MATURITY_LEVELS,
  ORGANIZATION_SIZES,
  localizeBeneficiaryDetails,
  type DiscoveryGoal,
  type MaturityLevel,
  type OrganizationSize,
} from "@/lib/beneficiary-metadata";
import { discoverProducts } from "@/lib/discovery";
import { ProductToolsActions } from "@/components/product-tools";
import { AcquisitionGuidePanel } from "@/components/acquisition-guide";
import type { ReactNode } from "react";

type ProductSearch = {
  from?: "discover" | undefined;
  goal?: DiscoveryGoal | undefined;
  organizationSize?: OrganizationSize | undefined;
  resume?: "exercise" | undefined;
  maturity?: MaturityLevel | undefined;
};

function allowed<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return typeof value === "string" && (values as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

export const Route = createFileRoute("/product/$productId")({
  validateSearch: (search: Record<string, unknown>): ProductSearch => ({
    resume: search["resume"] === "exercise" ? "exercise" : undefined,
    from: search["from"] === "discover" ? "discover" : undefined,
    goal: allowed(search["goal"], DISCOVERY_GOALS),
    organizationSize: allowed(search["organizationSize"], ORGANIZATION_SIZES),
    maturity: allowed(search["maturity"], MATURITY_LEVELS),
  }),
  loader: async ({ context, params }) => {
    const catalog = await context.queryClient.ensureQueryData(catalogQueryOptions);
    const product = catalog.products.find((item) => item.id === params.productId);
    if (!product) throw notFound();
    return {
      product,
      others: catalog.products.filter((item) => item.id !== product.id),
      salesEmail: catalog.settings.contactInfo.email,
    };
  },
  head: ({ loaderData, params }) => {
    const product = loaderData?.product;
    const url = pageUrl(`/product/${encodeURIComponent(params.productId)}`);
    const title = product ? `${product.name} — E20E Tools` : "Product not found — E20E Tools";
    const description = product
      ? `${product.description} ${product.descriptionEn ?? ""}`.trim()
      : "This product isn't in the E20E Tools library.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        ...shareImageMeta("tools"),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: ProductDetail,
  notFoundComponent: ProductMissing,
});

function ProductDetail() {
  const art = useThemeArt();
  const { product: stored, others, salesEmail } = Route.useLoaderData();
  const { language, dir, t } = useLanguage();
  const product = localizedProduct(stored, language);
  const practice = productPractice[product.id];
  const ar = language === "ar";
  const beneficiary = localizeBeneficiaryDetails(product.beneficiaryDetails, language);
  const notes = product.whatsNew?.trim() ?? "";
  const search = Route.useSearch();
  const selection =
    search.from === "discover" && search.goal
      ? discoverProducts(
          [stored],
          {
            goal: search.goal,
            organizationSize: search.organizationSize ?? "",
            maturity: search.maturity ?? "",
          },
          language,
          { includeComingSoon: true },
        )[0]
      : undefined;

  return (
    <main className="detail-page ea-workspace ea-dossier" dir={dir}>
      <div className="detail-top">
        <nav className="detail-crumbs" aria-label={t("navigationLabel")}>
          <Link to="/">{t("navLibrary")}</Link>
          <span aria-hidden="true">/</span>
          <bdi dir="ltr">{product.name}</bdi>
        </nav>
        <span className="detail-count">
          {String(others.length + 1).padStart(2, "0")} {t("toolsInLibrary")}
        </span>
      </div>

      <header className="detail-hero">
        <div className="detail-hero-copy">
          <span className="detail-label">{product.label}</span>
          <h1 dir="ltr">{product.name}</h1>
          <p>{product.overview}</p>
          {product.comingSoon && product.id === "archone" ? (
            <Button asChild className="detail-cta">
              <Link to="/archone-coming-soon">
                <span>
                  {t("comingSoonBadge")}
                  {archoneLaunchLabel(language === "ar", product.publicationDate)
                    ? ` · ${archoneLaunchLabel(language === "ar", product.publicationDate)}`
                    : ""}
                </span>
                <Clock size={18} aria-hidden="true" />
              </Link>
            </Button>
          ) : product.comingSoon ? (
            <Button
              variant="ghost"
              className="detail-cta"
              disabled
              aria-label={fill(t("comingSoonAria"), product.name)}
            >
              <span>{t("comingSoonBadge")}</span>
              <Clock size={18} aria-hidden="true" />
            </Button>
          ) : product.url ? (
            <Button asChild className="detail-cta">
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={fill(t("openInNewWindow"), product.name)}
              >
                <span>{t("openProduct")}</span>
                <ArrowUpLeft size={18} aria-hidden="true" />
              </a>
            </Button>
          ) : null}
        </div>
        <div className="detail-visual">
          <img
            className="product-detail-image"
            src={art.image(product)}
            alt={product.imageAlt}
            width={1280}
            height={832}
            fetchPriority="high"
          />
        </div>
      </header>
      <div className="detail-product-actions">
      <a className="ea-guide-step" href={`/guide/${language}.html#s1`}>{language === "ar" ? "كيف أراجع تفاصيل الأداة؟" : "How do I review a tool?"}</a>
        <ProductToolsActions product={product} />
        <a className="underline underline-offset-4" href={"/newsletter#"+new URLSearchParams({product:product.id,lang:language})}>{product.comingSoon?(ar?"أبلغني عند الإطلاق":"Notify me at launch"):(ar?"تابع تحديثات المنتج":"Follow product updates")}</a>
      </div>

      {selection && (
        <section className="bx-panel detail-selection" aria-labelledby="selection-result">
          <div className="bx-badges">
            <span className="bx-match-badge">
              <Check aria-hidden="true" size={14} />
              {t("bxMatchBadge")}
            </span>
            {product.comingSoon && (
              <span className="bx-soon-badge">
                <Clock aria-hidden="true" size={14} />
                {t("bxSoonNotRequestable")}
              </span>
            )}
          </div>
          <h2 id="selection-result">{t("bxSelectionResult")}</h2>
          <p>{t("bxSelectionLead")}</p>
          <div className="bx-evidence">
            <strong>{t("bxMatchEvidence")}</strong>
            <ul>
              {selection.evidence.map((item, index) => (
                <li key={`${item.field}-${index}`}>
                  {item.field === "metadata" ? t("bxMetadataGoal") : <q>{item.text}</q>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className="ea-dossier-layout">
        <nav
          className="ea-dossier-index"
          aria-label={language === "ar" ? "محتويات ملف الأداة" : "Tool dossier contents"}
        >
          <strong>{language === "ar" ? "ملف الأداة" : "Tool dossier"}</strong>
          {product.comingSoon && (
            <a href="#access">{language === "ar" ? "طريقة الحصول عليها" : "Acquisition"}</a>
          )}
          {["archone","landscape","radar"].includes(product.id) && !product.comingSoon && <a href="#exercise">{ar?"جرّب الحالة":"Interactive exercise"}</a>}
          <a href="#operating-requirements">{ar?"متطلبات التشغيل":"Operating requirements"}</a>
          <a href="#capabilities">{t("productFeatures")}</a>
          <a href="#fit">{language === "ar" ? "الملاءمة والمتطلبات" : "Fit and requirements"}</a>
          {practice && <a href="#practice">{ar ? "تمرين عملي" : "First exercise"}</a>}
          {(product.version || notes) && <a href="#releases">{t("productVersion")}</a>}
          <a href="#resources">{ar ? "المساعدة والموارد" : "Help and resources"}</a>
        </nav>
        <div className="ea-dossier-sections">
          <WorkCard key={product.id} id={product.id} name={product.name} ar={ar}/>
          <ProductCase product={product} language={language}/>
          <section className="bx-panel" id="operating-requirements"><h2>{ar?"متطلبات التشغيل":"Operating requirements"}</h2>
          <dl>{(["account","inputs","exchange"] as const).map((key,i)=><div key={key}><dt>{(ar?["الحساب","البيانات المطلوبة للبدء","الاستيراد والتصدير"]:["Account","Starting data","Import and export"])[i]}</dt><dd>{product.beneficiaryDetails?.operations?.[key][language] || (ar?"لم تُنشر تفاصيل مؤكدة بعد.":"Verified details have not been published yet.")}</dd></div>)}</dl>
          <small>{ar?"آخر مراجعة":"Last verified"} · {product.beneficiaryDetails?.operations?.reviewed || (ar?"غير مسجّلة":"Not recorded")}</small></section>
          <section id="capabilities" className="detail-features">
            <h2>{t("productFeatures")}</h2>
            <ul>
              {product.features.map((feature) => (
                <li key={feature}>
                  <Check size={15} aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </section>

          <section id="fit" className="bx-panel detail-beneficiary" aria-label={t("bxAudience")}>
            <h2 className="ea-fit-title">{ar ? "هل تناسب احتياجك؟" : "Is this a fit for your team?"}</h2>
            <BeneficiaryFact
              title={t("bxAudience")}
              value={beneficiary.audience}
              unknown={t("bxNotProvided")}
            />
            <BeneficiaryFact
              title={t("bxNotFor")}
              value={beneficiary.notFor}
              unknown={t("bxNotProvided")}
            />
            <BeneficiaryFact
              title={t("bxPrerequisites")}
              values={beneficiary.prerequisites}
              unknown={t("bxNotProvided")}
            />
            <BeneficiaryFact
              title={t("bxIntegrations")}
              values={beneficiary.integrations}
              unknown={t("bxNotProvided")}
            />
            <BeneficiaryFact
              title={t("bxLimitations")}
              values={beneficiary.limitations}
              unknown={t("bxNotProvided")}
            />
            <BeneficiaryFact
              title={t("bxExampleOutput")}
              value={beneficiary.exampleOutput}
              unknown={t("bxNotProvided")}
            />
          </section>

          {practice && <section id="practice" className="bx-panel ea-practice">
            <h2>{ar ? "تمرين مقترح لفريقك" : "A first exercise for your team"}</h2>
            <ol>{practice[language].map((step, i) => <li key={step}><strong>{(ar ? ["جهّز", "نفّذ داخل الأداة", "علامة النجاح"] : ["Prepare", "Do this in the tool", "Success criterion"])[i]}</strong><p>{step}</p></li>)}</ol>
            {!product.comingSoon && product.url && <div className="bx-actions"><a href={product.url} target="_blank" rel="noopener noreferrer">{ar ? "ابدأ المهمة في " : "Start the task in "}{product.name} ↗</a></div>}
            <StepHelp product={product} ar={ar} step={practice[language][1]!} />
            <p>{ar ? "مرجع المنهج" : "Method reference"} · <a href={practice.url}>{practice.source}</a></p>
          </section>}
          {product.comingSoon && (
            <div id="access">
              <AcquisitionGuidePanel product={product} salesEmail={salesEmail} variant="page" />
            </div>
          )}

          {(product.version || notes) && (
            <section id="releases" className="detail-release">
              <div className="release-head">
                <h2>{t("productVersion")}</h2>
                {product.version && (
                  <span className="release-version" dir="ltr">
                    <span className="release-version-label">{t("versionNumber")}</span>
                    <strong>{product.version}</strong>
                  </span>
                )}
              </div>
              {notes && (
                <div className="release-notes">
                  <h3>{t("productWhatsNew")}</h3>
                  <p className="release-direct-text">{notes}</p>
                </div>
              )}
            </section>
          )}
          <section id="resources" className="bx-panel ea-product-resources">
            <h2>{ar ? "المساعدة والموارد" : "Help and resources"}</h2>
          {product.githubUrl ? (
            <p className="detail-request-links">
              <a href={product.githubUrl} target="_blank" rel="noopener noreferrer" dir="ltr">
                {product.githubUrl.replace(/\/$/, "") === "https://github.com/e20etools" ? (ar ? "فريق E20E على GitHub" : "E20E on GitHub") : (ar ? "مستودع المنتج" : "Product repository")} ↗
              </a>
            </p>
          ) : null}
          <p className="detail-request-links">
            <Link to="/request" search={{ type: "feature", product: product.id }}>
              {t("productRequestFeature")}
            </Link>
            <span aria-hidden="true">·</span>
            <Link to="/request" search={{ type: "support", product: product.id }}>
              {t("productRequestSupport")}
            </Link>
          </p>

          {!product.comingSoon ? (
            <p className="detail-request-links">
              <Link to="/try/$productId" params={{ productId: product.id }}>
                {t("bxTryDemo")}
              </Link>
              <span aria-hidden="true">·</span>
              <Link to="/my-requests">{t("bxTrackRequests")}</Link>
            </p>
          ) : null}
          </section>
        </div>
      </div>
      <section className="detail-others">
        <h2>{t("otherTools")}</h2>
        <div className="others-grid">
          {others.map((item) => {
            const other = localizedProduct(item, language);
            return (
              <Link
                to="/product/$productId"
                params={{ productId: other.id }}
                className="other-card"
                key={other.id}
              >
                <img loading="lazy" alt="" src={art.image(other)} width={90} height={58} />
                <span className="other-name" dir="ltr">
                  {other.name}
                </span>
                <span className="other-label">{other.label}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function BeneficiaryFact({
  title,
  value,
  values,
  unknown,
}: {
  title: string;
  value?: string;
  values?: string[];
  unknown: string;
}) {
  let content: ReactNode = unknown;
  if (values?.length)
    content = (
      <ul>
        {values.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  else if (value?.trim()) content = <p>{value}</p>;
  return (
    <div className="py-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-2 text-sm text-muted-foreground">{content}</div>
    </div>
  );
}

function ProductMissing() {
  const { dir, t } = useLanguage();
  return (
    <main className="detail-page ea-workspace ea-dossier" dir={dir}>
      <div className="detail-missing">
        <h1>{t("missingTitle")}</h1>
        <p>{t("missingBody")}</p>
        <Button asChild variant="outline">
          <Link to="/">{t("backToLibrary")}</Link>
        </Button>
      </div>
    </main>
  );
}
