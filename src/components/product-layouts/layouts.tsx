import { useState, type ReactNode } from "react";
import { FeatureOnly } from "@/components/feature-gate";
import { Link } from "@tanstack/react-router";
import { ArrowUpLeft, ArrowUpRight, Check, Clock, X } from "lucide-react";
import type { Product } from "@/lib/catalog";
import { localizedProduct } from "@/lib/catalog";
import { useLanguage } from "@/lib/language";
import { fill, dictionaries } from "@/lib/copy";
import { archoneLaunchLabel } from "@/lib/archone-launch";
import { productPractice } from "@/lib/product-practice";
import { ProductToolsActions } from "@/components/product-tools";
import { StepHelp } from "@/components/step-help";
import { AcquisitionGuidePanel } from "@/components/acquisition-guide";
import { ProductScreenshots } from "@/components/product-screenshots";
import { ProductWaitlist } from "@/components/product-waitlist";
import { ProductTestimonial } from "@/components/product-testimonial";
import {
  readiness,
  reviewedLabel,
  type Beneficiary,
  type OperationRow,
} from "./model";

export type LayoutProps = {
  product: Product;
  beneficiary: Beneficiary;
  ops: OperationRow[];
  others: Product[];
  salesEmail: string;
  image: (p: Product) => string;
};

type Lang = "ar" | "en";

/* ---------- shared pieces ---------- */

function useBits() {
  const { language, dir, t } = useLanguage();
  const lang: Lang = language === "ar" ? "ar" : "en";
  return { lang, ar: lang === "ar", dir, t };
}

function PrimaryCta({
  product,
  className,
}: {
  product: Product;
  className: string;
}) {
  const { lang, ar, t } = useBits();
  const Arrow = ar ? ArrowUpLeft : ArrowUpRight;
  if (product.comingSoon && product.id === "archone") {
    const when = archoneLaunchLabel(ar, product.publicationDate);
    return (
      <Link to="/archone-coming-soon" className={className}>
        {t("comingSoonBadge")}
        {when ? ` · ${when}` : ""}
        <Clock size={18} aria-hidden="true" />
      </Link>
    );
  }
  if (product.comingSoon)
    return (
      <span
        className={className}
        data-disabled=""
        aria-label={fill(t("comingSoonAria"), product.name)}
      >
        {t("comingSoonBadge")}
        <Clock size={18} aria-hidden="true" />
      </span>
    );
  if (!product.url) return null;
  return (
    <a
      href={product.url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      aria-label={fill(t("openInNewWindow"), product.name)}
      lang={lang}
    >
      {t("openProduct")}
      <Arrow size={18} aria-hidden="true" />
    </a>
  );
}

function StatusText({ product }: { product: Product }) {
  const { ar } = useBits();
  return (
    <>
      {product.comingSoon
        ? dictionaries[ar ? "ar" : "en"].comingSoonBadge
        : dictionaries[ar ? "ar" : "en"].roadmapStatAvailable}
    </>
  );
}

function HelpLinks({
  product,
  className,
}: {
  product: Product;
  className: string;
}) {
  const { ar, t } = useBits();
  return (
    <div className={className}>
      <Link to="/request" search={{ type: "support", product: product.id }}>
        {t("productRequestSupport")}
      </Link>
      <Link to="/request" search={{ type: "feature", product: product.id }}>
        {t("productRequestFeature")}
      </Link>
      {!product.comingSoon && (
        <FeatureOnly feature="trials">
          <Link to="/try/$productId" params={{ productId: product.id }}>
            {t("bxTryDemo")}
          </Link>
        </FeatureOnly>
      )}
      <Link to="/my-requests">{t("bxTrackRequests")}</Link>
      {product.githubUrl ? (
        <a href={product.githubUrl} target="_blank" rel="noopener noreferrer">
          GitHub ↗
        </a>
      ) : null}
      <a
        href={
          "/newsletter#" +
          new URLSearchParams({ product: product.id, lang: ar ? "ar" : "en" })
        }
      >
        {product.comingSoon
          ? dictionaries[ar ? "ar" : "en"].layoutsNotifyMeAtLaunch
          : dictionaries[ar ? "ar" : "en"].layoutsFollowUpdates}
      </a>
    </div>
  );
}

function Others({
  others,
  image,
  className,
}: {
  others: Product[];
  image: LayoutProps["image"];
  className: string;
}) {
  const { lang, t } = useBits();
  if (!others.length) return null;
  return (
    <section className={className} aria-labelledby="pl-others">
      <h2 id="pl-others">{t("otherTools")}</h2>
      <div>
        {others.map((item) => {
          const o = localizedProduct(item, lang);
          return (
            <Link
              key={o.id}
              to="/product/$productId"
              params={{ productId: o.id }}
            >
              <img
                loading="lazy"
                alt=""
                src={image(o)}
                width={90}
                height={58}
              />
              <b dir="ltr">{o.name}</b>
              <small>{o.label}</small>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Release({
  product,
  className,
}: {
  product: Product;
  className: string;
}) {
  const { t } = useBits();
  const notes = product.whatsNew?.trim() ?? "";
  if (!product.version && !notes) return null;
  return (
    <section className={className} id="releases">
      <h2>{t("productVersion")}</h2>
      {product.version && (
        <p dir="ltr">
          <b>{product.version}</b>
        </p>
      )}
      {notes && <p>{notes}</p>}
    </section>
  );
}

function Practice({
  product,
  className,
}: {
  product: Product;
  className: string;
}) {
  const { lang, ar } = useBits();
  const practice = productPractice[product.id];
  if (!practice) return null;
  const names = ar
    ? ["جهّز", "نفّذ داخل الأداة", "علامة النجاح"]
    : ["Prepare", "Do it in the tool", "Success criterion"];
  return (
    <section className={className} id="practice">
      <h2>{dictionaries[ar ? "ar" : "en"].layoutsAFirstExerciseFor}</h2>
      <ol>
        {practice[lang].map((step, i) => (
          <li key={step} data-step={i + 1}>
            <small>{ar ? `الخطوة ${i + 1}` : `STEP ${i + 1}`}</small>
            <strong>{names[i]}</strong>
            <p>{step}</p>
          </li>
        ))}
      </ol>
      <StepHelp product={product} ar={ar} step={practice[lang][1]!} />
      <p className="pl-source">
        {dictionaries[ar ? "ar" : "en"].layoutsMethodReference} ·{" "}
        <a href={practice.url}>{practice.source}</a>
      </p>
    </section>
  );
}

function FactList({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** Light island for the interactive pieces (case, work card, acquisition), whatever the shell. */
function Island({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div className="pl-island" id={id}>
      {children}
    </div>
  );
}

function Interactive({
  product,
  salesEmail,
}: {
  product: Product;
  salesEmail: string;
}) {
  return (
    <>
      {product.comingSoon && (
        <Island id="access">
          <AcquisitionGuidePanel
            product={product}
            salesEmail={salesEmail}
            variant="page"
          />
        </Island>
      )}
    </>
  );
}

/* ---------- A · Mission control ---------- */

export function MissionLayout({
  product,
  beneficiary,
  ops,
  others,
  salesEmail,
  image,
}: LayoutProps) {
  const { lang, ar, dir } = useBits();
  const practice = productPractice[product.id];
  const reviewed = reviewedLabel(
    product.beneficiaryDetails?.operations?.reviewed,
    lang,
  );
  const kpis = [
    {
      v: String(product.features.length),
      t: dictionaries[ar ? "ar" : "en"].layoutsCoreCapabilities,
      c: "var(--pl-accent-text)",
    },
    beneficiary.prerequisites?.length
      ? {
          v: String(beneficiary.prerequisites.length),
          t: dictionaries[ar ? "ar" : "en"].layoutsThingsToHaveReady,
          c: "var(--pl-text)",
        }
      : null,
    beneficiary.integrations?.length
      ? {
          v: String(beneficiary.integrations.length),
          t: dictionaries[ar ? "ar" : "en"].layoutsIntegrations,
          c: "var(--pl-info)",
        }
      : null,
    reviewed
      ? {
          v: reviewed,
          t: dictionaries[ar ? "ar" : "en"].layoutsLastReviewed,
          c: "var(--pl-warn-ink)",
          small: true,
        }
      : null,
  ].filter(Boolean) as { v: string; t: string; c: string; small?: boolean }[];

  return (
    <main className="pl-mission" dir={dir}>
      <nav
        className="plm-bar"
        aria-label={dictionaries[ar ? "ar" : "en"].layoutsPageSections}
      >
        <Link to="/" className="plm-crumb">
          {dictionaries[ar ? "ar" : "en"].navLibrary}
        </Link>
        <span aria-hidden="true">/</span>
        <bdi dir="ltr">{product.name}</bdi>
        <span className="plm-jumps">
          <a href="#fit">
            {dictionaries[ar ? "ar" : "en"].comparisonDecisionFit}
          </a>
          <a href="#capabilities">
            {dictionaries[ar ? "ar" : "en"].productFeatures}
          </a>
          <a href="#help">{dictionaries[ar ? "ar" : "en"].layoutsHelp}</a>
        </span>
      </nav>

      <header className="plm-hero">
        <div className="plm-hero-copy">
          <div className="plm-badges">
            <span
              className="plm-status"
              data-soon={product.comingSoon ? "" : undefined}
            >
              <i aria-hidden="true" />
              <StatusText product={product} />
            </span>
            <span>{product.label}</span>
            {practice && (
              <span dir="ltr">{practice.source.split("·")[0]?.trim()}</span>
            )}
          </div>
          <h1 dir="ltr">{product.name}</h1>
          <p>{product.overview || product.description}</p>
          <div className="plm-actions">
            <PrimaryCta product={product} className="plm-cta" />
            <ProductToolsActions product={product} compact />
          </div>
          <ProductTestimonial product={product} ar={ar} className="plm-test" />
        </div>
        <div className="plm-visual" aria-hidden="true">
          <i className="plm-sweep" />
          <img src={image(product)} alt="" width={640} height={416} />
        </div>
      </header>
      <ProductWaitlist product={product} ar={ar} className="plm-waitlist" />

      {kpis.length > 0 && (
        <section
          className="plm-kpis"
          aria-label={dictionaries[ar ? "ar" : "en"].layoutsAtAGlance}
        >
          {kpis.map((k) => (
            <div key={k.t}>
              <strong
                style={{ color: k.c }}
                data-small={k.small ? "" : undefined}
              >
                {k.v}
              </strong>
              <span>{k.t}</span>
            </div>
          ))}
        </section>
      )}

      {(beneficiary.audience || beneficiary.notFor) && (
        <section className="plm-fit" id="fit">
          <div>
            <small dir="ltr">01 · FIT CHECK</small>
            <h2>{dictionaries[ar ? "ar" : "en"].layoutsIsItRightFor}</h2>
          </div>
          <div className="plm-fit-cards">
            {beneficiary.audience && (
              <div data-kind="yes">
                <h3>
                  <Check size={18} aria-hidden="true" />
                  {dictionaries[ar ? "ar" : "en"].layoutsAGoodFit}
                </h3>
                <p>{beneficiary.audience}</p>
              </div>
            )}
            {beneficiary.notFor && (
              <div data-kind="no">
                <h3>
                  <X size={18} aria-hidden="true" />
                  {dictionaries[ar ? "ar" : "en"].layoutsNotAFit}
                </h3>
                <p>{beneficiary.notFor}</p>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="plm-bento">
        <div className="plm-card plm-wide" id="capabilities">
          <small dir="ltr">02 · WHAT YOU GET</small>
          <h2>{dictionaries[ar ? "ar" : "en"].productFeatures}</h2>
          <ol className="plm-features">
            {product.features.map((f, i) => (
              <li key={f}>
                <b dir="ltr">{String(i + 1).padStart(2, "0")}</b>
                <span>{f}</span>
              </li>
            ))}
          </ol>
        </div>
        {beneficiary.prerequisites?.length ? (
          <div className="plm-card">
            <small dir="ltr">03 · BEFORE YOU START</small>
            <h3>{dictionaries[ar ? "ar" : "en"].bxPrerequisites}</h3>
            <FactList items={beneficiary.prerequisites} />
          </div>
        ) : null}
        {beneficiary.integrations?.length ? (
          <div className="plm-card" data-tone="info">
            <small dir="ltr">04 · INTEGRATIONS</small>
            <h3>{dictionaries[ar ? "ar" : "en"].layoutsConnectsTo}</h3>
            <div className="plm-chips">
              {beneficiary.integrations.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
          </div>
        ) : null}
        {beneficiary.limitations?.length ? (
          <div className="plm-card" data-tone="warn">
            <small dir="ltr">05 · HONEST LIMITS</small>
            <h3>{dictionaries[ar ? "ar" : "en"].layoutsWhatItDoesnT}</h3>
            <FactList items={beneficiary.limitations} />
          </div>
        ) : null}
        {ops.length > 0 && (
          <div className="plm-card" id="operating-requirements">
            <small dir="ltr">06 · OPERATIONS</small>
            <h3>
              {dictionaries[ar ? "ar" : "en"].layoutsOperatingRequirements}
            </h3>
            <dl>
              {ops.map((r) => (
                <div key={r.key}>
                  <dt>{r.label}</dt>
                  <dd>{r.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {beneficiary.exampleOutput && (
          <div className="plm-card plm-wide" data-tone="glow">
            <small dir="ltr">07 · EXAMPLE OUTPUT</small>
            <h3>{dictionaries[ar ? "ar" : "en"].bxExampleOutput}</h3>
            <p>{beneficiary.exampleOutput}</p>
          </div>
        )}
      </section>
      <ProductScreenshots
        shots={beneficiary.screenshots}
        productName={product.name}
        ar={ar}
        className="plm-shots"
      />

      <Interactive product={product} salesEmail={salesEmail} />
      <Practice product={product} className="plm-practice" />
      <Release product={product} className="plm-card plm-release" />

      <section className="plm-help" id="help">
        <h2>{dictionaries[ar ? "ar" : "en"].layoutsNeedHelp}</h2>
        <HelpLinks product={product} className="plm-help-links" />
      </section>
      <Others others={others} image={image} className="plm-others" />
    </main>
  );
}

/* ---------- B · Spec sheet ---------- */

export function SpecLayout({
  product,
  beneficiary,
  ops,
  others,
  salesEmail,
  image,
}: LayoutProps) {
  const { lang, ar, dir, t } = useBits();
  const practice = productPractice[product.id];
  const reviewed = reviewedLabel(
    product.beneficiaryDetails?.operations?.reviewed,
    lang,
  );
  const specs = [
    { k: dictionaries[ar ? "ar" : "en"].layoutsCategory, v: product.label },
    {
      k: dictionaries[ar ? "ar" : "en"].tmStatus,
      v: product.comingSoon
        ? dictionaries[ar ? "ar" : "en"].comingSoonBadge
        : dictionaries[ar ? "ar" : "en"].roadmapStatAvailable,
    },
    product.version
      ? { k: dictionaries[ar ? "ar" : "en"].layoutsVersion, v: product.version }
      : null,
    practice
      ? { k: dictionaries[ar ? "ar" : "en"].layoutsMethod, v: practice.source }
      : null,
    beneficiary.integrations?.length
      ? {
          k: dictionaries[ar ? "ar" : "en"].layoutsIntegrations2,
          v: String(beneficiary.integrations.length),
        }
      : null,
    reviewed
      ? { k: dictionaries[ar ? "ar" : "en"].layoutsReviewed, v: reviewed }
      : null,
  ].filter(Boolean) as { k: string; v: string }[];
  const sections = [
    { id: "summary", t: dictionaries[ar ? "ar" : "en"].layoutsInShort },
    beneficiary.audience || beneficiary.notFor
      ? { id: "fit", t: dictionaries[ar ? "ar" : "en"].comparisonDecisionFit }
      : null,
    { id: "capabilities", t: dictionaries[ar ? "ar" : "en"].productFeatures },
    { id: "operations", t: dictionaries[ar ? "ar" : "en"].layoutsOperations },
    product.comingSoon
      ? { id: "access", t: dictionaries[ar ? "ar" : "en"].layoutsGettingAccess }
      : null,
    practice
      ? {
          id: "practice",
          t: dictionaries[ar ? "ar" : "en"].layoutsTeamExercise,
        }
      : null,
  ].filter(Boolean) as { id: string; t: string }[];
  const num = (id: string) =>
    String(sections.findIndex((s) => s.id === id) + 1).padStart(2, "0");

  return (
    <main className="pl-spec" dir={dir}>
      <nav className="pls-crumbs" aria-label={t("navigationLabel")}>
        <Link to="/">{t("navLibrary")}</Link>
        <span aria-hidden="true">/</span>
        <span>{product.label}</span>
        <span aria-hidden="true">/</span>
        <bdi dir="ltr">{product.name}</bdi>
      </nav>
      <header className="pls-mast">
        <div>
          <p className="pls-meta" dir="ltr">
            <span>DATASHEET / E20E-{product.id.toUpperCase()}</span>
            <span data-live={product.comingSoon ? undefined : ""}>
              ●{" "}
              {product.comingSoon
                ? dictionaries[ar ? "ar" : "en"].layoutsComingSoon
                : dictionaries[ar ? "ar" : "en"].layoutsAvailable}
            </span>
          </p>
          <h1 dir="ltr">
            {product.name}
            <span aria-hidden="true">.</span>
          </h1>
        </div>
        <p className="pls-lead">{product.overview || product.description}</p>
      </header>
      <ProductWaitlist product={product} ar={ar} className="pls-waitlist" />
      <dl className="pls-specs">
        {specs.map((s) => (
          <div key={s.k}>
            <dt dir="ltr">{s.k}</dt>
            <dd>{s.v}</dd>
          </div>
        ))}
      </dl>

      <div className="pls-body">
        <nav
          className="pls-index"
          aria-label={dictionaries[ar ? "ar" : "en"].layoutsOnThisPage}
        >
          {sections.map((s, i) => (
            <a key={s.id} href={`#${s.id}`}>
              <small dir="ltr">{String(i + 1).padStart(2, "0")}</small>
              {s.t}
            </a>
          ))}
        </nav>

        <div className="pls-main">
          <section id="summary" className="pls-sec">
            <h2>
              <b dir="ltr">{num("summary")}</b>
              {dictionaries[ar ? "ar" : "en"].layoutsInShort}
            </h2>
            <p className="pls-big">{product.description}</p>
          </section>

          {(beneficiary.audience || beneficiary.notFor) && (
            <section id="fit" className="pls-sec">
              <h2>
                <b dir="ltr">{num("fit")}</b>
                {dictionaries[ar ? "ar" : "en"].comparisonDecisionFit}
              </h2>
              <div className="pls-fit">
                {beneficiary.audience && (
                  <div>
                    <h3>✓ {dictionaries[ar ? "ar" : "en"].layoutsWhoItSFor}</h3>
                    <p>{beneficiary.audience}</p>
                  </div>
                )}
                {beneficiary.notFor && (
                  <div data-kind="no">
                    <h3>
                      ✕ {dictionaries[ar ? "ar" : "en"].layoutsWhenItIsnT}
                    </h3>
                    <p>{beneficiary.notFor}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          <section id="capabilities" className="pls-sec">
            <h2>
              <b dir="ltr">{num("capabilities")}</b>
              {dictionaries[ar ? "ar" : "en"].productFeatures}
            </h2>
            <ol className="pls-features">
              {product.features.map((f, i) => (
                <li key={f}>
                  <small dir="ltr">.{String(i + 1).padStart(2, "0")}</small>
                  <span>{f}</span>
                </li>
              ))}
            </ol>
            {beneficiary.exampleOutput && (
              <p className="pls-example">
                <b>{dictionaries[ar ? "ar" : "en"].layoutsExampleOutput}</b>
                {beneficiary.exampleOutput}
              </p>
            )}
            <ProductScreenshots
              shots={beneficiary.screenshots}
              productName={product.name}
              ar={ar}
              className="pls-shots"
              heading={
                <h3>{dictionaries[ar ? "ar" : "en"].layoutsInsideTheTool}</h3>
              }
            />
          </section>

          <section id="operations" className="pls-sec">
            <h2>
              <b dir="ltr">{num("operations")}</b>
              {dictionaries[ar ? "ar" : "en"].layoutsOperations}
            </h2>
            <div className="pls-ops">
              {beneficiary.prerequisites?.length ? (
                <div>
                  <h3>{dictionaries[ar ? "ar" : "en"].layoutsStartWith}</h3>
                  <FactList items={beneficiary.prerequisites} />
                </div>
              ) : null}
              {beneficiary.integrations?.length ? (
                <div>
                  <h3>
                    {dictionaries[ar ? "ar" : "en"].layoutsIntegratesWith}
                  </h3>
                  <FactList items={beneficiary.integrations} />
                </div>
              ) : null}
              {beneficiary.limitations?.length ? (
                <div data-kind="warn">
                  <h3>{dictionaries[ar ? "ar" : "en"].layoutsLimitsToKnow}</h3>
                  <FactList items={beneficiary.limitations} />
                </div>
              ) : null}
            </div>
            {ops.length > 0 && (
              <dl className="pls-oprows">
                {ops.map((r) => (
                  <div key={r.key}>
                    <dt>{r.label}</dt>
                    <dd>{r.text}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {product.comingSoon && (
            <section className="pls-sec">
              <h2>
                <b dir="ltr">{num("access")}</b>
                {dictionaries[ar ? "ar" : "en"].layoutsGettingAccess}
              </h2>
              <Interactive product={product} salesEmail={salesEmail} />
            </section>
          )}

          <Practice product={product} className="pls-sec pls-practice" />
          <Release product={product} className="pls-sec" />
        </div>

        <aside className="pls-aside">
          {product.url && !product.comingSoon && (
            <small dir="ltr">
              {product.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </small>
          )}
          <PrimaryCta product={product} className="pls-cta" />
          <ProductTestimonial product={product} ar={ar} className="pls-test" />
          <ProductToolsActions product={product} />
          <HelpLinks product={product} className="pls-help" />
        </aside>
      </div>
      <Others others={others} image={image} className="pls-others" />
    </main>
  );
}

/* ---------- C · Decision journey ---------- */

export function JourneyLayout({
  product,
  beneficiary,
  ops,
  others,
  salesEmail,
  image,
}: LayoutProps) {
  const { ar, dir } = useBits();
  const [step, setStep] = useState(0);
  const prereqs = beneficiary.prerequisites ?? [];
  const [have, setHave] = useState<boolean[]>(() => prereqs.map(() => false));
  const ready = readiness(have);
  const steps = [
    {
      t: dictionaries[ar ? "ar" : "en"].layoutsUnderstand,
      s: dictionaries[ar ? "ar" : "en"].layoutsWhatItDoes,
    },
    {
      t: dictionaries[ar ? "ar" : "en"].comparisonDecisionFit,
      s: dictionaries[ar ? "ar" : "en"].layoutsIsItForYour,
    },
    {
      t: dictionaries[ar ? "ar" : "en"].productCaseTry,
      s: dictionaries[ar ? "ar" : "en"].layoutsATeamExercise,
    },
    {
      t: dictionaries[ar ? "ar" : "en"].layoutsStart,
      s: dictionaries[ar ? "ar" : "en"].layoutsOpenTheSystem,
    },
  ];

  return (
    <main className="pl-journey" dir={dir}>
      <section className="plj-band">
        <div className="plj-wrap">
          <div className="plj-top">
            <nav aria-label={dictionaries[ar ? "ar" : "en"].layoutsBreadcrumb}>
              <Link to="/">{dictionaries[ar ? "ar" : "en"].navLibrary}</Link> /{" "}
              <bdi dir="ltr">{product.name}</bdi>
            </nav>
            <div className="plj-top-actions">
              <ProductToolsActions product={product} compact />
              <PrimaryCta product={product} className="plj-cta" />
            </div>
          </div>
          <div className="plj-hero">
            <div>
              <span className="plj-tag">
                {product.label} · <StatusText product={product} />
              </span>
              <h1 dir="ltr">{product.name}</h1>
              <p>{product.description}</p>
              <ProductTestimonial
                product={product}
                ar={ar}
                className="plj-test"
              />
            </div>
            {prereqs.length > 0 && (
              <div className="plj-meter">
                <div>
                  <span>
                    {dictionaries[ar ? "ar" : "en"].layoutsYourTeamSReadiness}
                  </span>
                  <b dir="ltr">{ready}%</b>
                </div>
                <div
                  className="plj-meter-bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={ready}
                  aria-label={
                    dictionaries[ar ? "ar" : "en"].layoutsYourTeamSReadiness
                  }
                >
                  <i style={{ inlineSize: `${ready}%` }} />
                </div>
                <small>
                  {dictionaries[ar ? "ar" : "en"].layoutsUpdateItInThe}
                </small>
              </div>
            )}
          </div>
          <ProductWaitlist product={product} ar={ar} className="plj-waitlist" />
          <div
            className="plj-steps"
            role="tablist"
            aria-label={dictionaries[ar ? "ar" : "en"].layoutsDecisionSteps}
          >
            {steps.map((s, i) => (
              <button
                key={s.t}
                type="button"
                role="tab"
                id={`plj-tab-${i}`}
                aria-selected={step === i}
                aria-controls={`plj-panel-${i}`}
                data-done={i < step ? "" : undefined}
                onClick={() => setStep(i)}
              >
                <small>{ar ? `الخطوة ${i + 1}` : `STEP 0${i + 1}`}</small>
                <strong>{s.t}</strong>
                <span>{s.s}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="plj-wrap plj-body">
        <section
          role="tabpanel"
          id="plj-panel-0"
          aria-labelledby="plj-tab-0"
          hidden={step !== 0}
        >
          <div className="plj-grid">
            <div className="plj-card plj-span">
              <h2>{product.overview || product.description}</h2>
            </div>
            {product.features.map((f, i) => (
              <div className="plj-card" key={f}>
                <b className="plj-num" dir="ltr">
                  {String(i + 1).padStart(2, "0")}
                </b>
                <p>{f}</p>
              </div>
            ))}
            {beneficiary.exampleOutput && (
              <div className="plj-card plj-span" data-tone="dark">
                <h3>{dictionaries[ar ? "ar" : "en"].bxExampleOutput}</h3>
                <p>{beneficiary.exampleOutput}</p>
              </div>
            )}
          </div>
          <ProductScreenshots
            shots={beneficiary.screenshots}
            productName={product.name}
            ar={ar}
            className="plj-shots"
          />
        </section>

        <section
          role="tabpanel"
          id="plj-panel-1"
          aria-labelledby="plj-tab-1"
          hidden={step !== 1}
        >
          <div className="plj-grid">
            {beneficiary.audience && (
              <div className="plj-card" data-tone="yes">
                <h2>{dictionaries[ar ? "ar" : "en"].layoutsItFitsIf}</h2>
                <p>{beneficiary.audience}</p>
              </div>
            )}
            {beneficiary.notFor && (
              <div className="plj-card" data-tone="no">
                <h2>{dictionaries[ar ? "ar" : "en"].layoutsLookElsewhereIf}</h2>
                <p>{beneficiary.notFor}</p>
              </div>
            )}
            {prereqs.length > 0 && (
              <fieldset className="plj-card plj-span plj-check">
                <legend>
                  {dictionaries[ar ? "ar" : "en"].layoutsDoYouHaveWhat}
                </legend>
                <p>{dictionaries[ar ? "ar" : "en"].layoutsTickWhatYouHave}</p>
                <div>
                  {prereqs.map((p, i) => (
                    <label key={p} data-on={have[i] ? "" : undefined}>
                      <input
                        type="checkbox"
                        checked={Boolean(have[i])}
                        onChange={() =>
                          setHave((h) => h.map((v, j) => (j === i ? !v : v)))
                        }
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        </section>

        <section
          role="tabpanel"
          id="plj-panel-2"
          aria-labelledby="plj-tab-2"
          hidden={step !== 2}
        >
          <Interactive product={product} salesEmail={salesEmail} />
          <Practice product={product} className="plj-practice" />
        </section>

        <section
          role="tabpanel"
          id="plj-panel-3"
          aria-labelledby="plj-tab-3"
          hidden={step !== 3}
        >
          <div className="plj-grid">
            <div className="plj-card plj-span plj-go">
              <h2>
                {product.comingSoon
                  ? dictionaries[ar ? "ar" : "en"].layoutsNotLaunchedYetAsk
                  : dictionaries[ar ? "ar" : "en"].layoutsReadyOpenTheSystem}
              </h2>
              <PrimaryCta product={product} className="plj-cta" />
            </div>
            {beneficiary.integrations?.length ? (
              <div className="plj-card">
                <h3>{dictionaries[ar ? "ar" : "en"].layoutsIntegratesWith}</h3>
                <FactList items={beneficiary.integrations} />
              </div>
            ) : null}
            {beneficiary.limitations?.length ? (
              <div className="plj-card" data-tone="no">
                <h3>{dictionaries[ar ? "ar" : "en"].layoutsLimits}</h3>
                <FactList items={beneficiary.limitations} />
              </div>
            ) : null}
            {ops.length > 0 && (
              <div className="plj-card">
                <h3>
                  {dictionaries[ar ? "ar" : "en"].layoutsOperatingRequirements}
                </h3>
                <dl>
                  {ops.map((r) => (
                    <div key={r.key}>
                      <dt>{r.label}</dt>
                      <dd>{r.text}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            <div className="plj-card plj-span">
              <h3>{dictionaries[ar ? "ar" : "en"].osHelp}</h3>
              <HelpLinks product={product} className="plj-help" />
            </div>
          </div>
          <Release product={product} className="plj-card" />
        </section>

        <div className="plj-next">
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)}>
              {dictionaries[ar ? "ar" : "en"].layoutsBack}
            </button>
          )}
          {step < steps.length - 1 && (
            <button
              type="button"
              data-primary=""
              onClick={() => setStep(step + 1)}
            >
              {ar
                ? `التالي: ${steps[step + 1]!.t} ←`
                : `Next: ${steps[step + 1]!.t} →`}
            </button>
          )}
        </div>
      </div>
      <Others others={others} image={image} className="plj-wrap plj-others" />
    </main>
  );
}
