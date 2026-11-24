import { JourneyHeading } from "@/studio/journey-heading";
import { FeatureGate, FeatureOnly } from "@/components/feature-gate";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Compass,
  RotateCcw,
} from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { localizedProduct } from "@/lib/catalog";
import {
  DISCOVERY_GOALS,
  MATURITY_LEVELS,
  ORGANIZATION_SIZES,
} from "@/lib/beneficiary-metadata";
import {
  discoverProducts,
  discoveryCriteria,
  type DiscoveryAnswers,
} from "@/lib/discovery";
import { useLanguage } from "@/lib/language";
import type { Copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { CompareTray, ProductToolsActions } from "@/components/product-tools";
import { JourneyRating } from "@/components/journey-rating";
import { AcquisitionGuidePanel } from "@/components/acquisition-guide";
import { acquisitionGuide } from "@/lib/acquisition";
import { trackJourney } from "@/lib/journey-client";
import { pageUrl } from "@/lib/seo";
import { useThemeArt } from "@/themes/use-theme-art";

export const Route = createFileRoute("/discover")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(catalogQueryOptions),
  head: () => ({
    meta: [
      { title: "Start with your need — E20E Tools | ابدأ باحتياجك" },
      {
        name: "description",
        content:
          "A short bilingual, deterministic guided chooser grounded in exact facts from the live E20E tool catalog.",
      },
      { property: "og:title", content: "Start with your need — E20E Tools" },
      {
        property: "og:description",
        content:
          "Explore real EA tool pages supported by direct catalog evidence, without login or AI.",
      },
      { property: "og:url", content: pageUrl("/discover") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: pageUrl("/discover") }],
  }),
  component: GatedDiscoverPage,
});

function ChoiceStep<T extends string>({
  legend,
  values,
  value,
  onChange,
  prefix,
}: {
  legend: string;
  values: readonly T[];
  value: string;
  onChange: (value: T) => void;
  prefix: string;
}) {
  const { t } = useLanguage();
  return (
    <fieldset className="bx-panel">
      <legend>{legend}</legend>
      <div className="bx-options">
        {values.map((option) => (
          <label className="bx-option" key={option}>
            <input
              type="radio"
              name={prefix}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>{t(`${prefix}_${option}` as keyof Copy)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function fitCopy(value: boolean | null, kind: "Org" | "Maturity"): keyof Copy {
  return `bx${kind}Fit${value === null ? "Unknown" : value ? "Yes" : "No"}` as keyof Copy;
}

const draftKey = "ea-hub:discovery:v1";
const draftSchema = z.object({
  answers: z.object({
    goal: z.enum(DISCOVERY_GOALS),
    organizationSize: z.enum(ORGANIZATION_SIZES).or(z.literal("")),
    maturity: z.enum(MATURITY_LEVELS).or(z.literal("")),
  }),
  stage: z.enum(["goal", "organizationSize", "maturity", "results"]),
});

function DiscoverPage() {
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const { language, dir, t } = useLanguage();
  const art = useThemeArt();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<DiscoveryAnswers>({
    goal: "",
    organizationSize: "",
    maturity: "",
  });
  const completionKey = useRef("");
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;
  const NextIcon = dir === "rtl" ? ArrowLeft : ArrowRight;
  const criteria = discoveryCriteria(catalog.products);
  const questionCount =
    1 + Number(criteria.organizationSize) + Number(criteria.maturity);
  const maturityStep = criteria.organizationSize ? 2 : 1;
  const [draftLoaded, setDraftLoaded] = useState(false);
  const stages = ["goal", ...(criteria.organizationSize ? ["organizationSize"] : []),
    ...(criteria.maturity ? ["maturity"] : []), "results"];
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      const draft = raw && draftSchema.safeParse(JSON.parse(raw));
      if (draft && draft.success) {
        const restored = draft.data.answers;
        const firstMissing = stages.findIndex((s) => s !== "results" && !restored[s as keyof DiscoveryAnswers]);
        const savedStep = stages.indexOf(draft.data.stage);
        setAnswers(restored);
        setStep(Math.min(savedStep < 0 ? questionCount : savedStep, firstMissing < 0 ? questionCount : firstMissing));
      }
    } catch { /* In private browsing, the chooser still works in memory. */ }
    setDraftLoaded(true);
  }, []);
  const stage = stages[step];
  useEffect(() => {
    if (!draftLoaded) return;
    try {
      if (answers.goal) sessionStorage.setItem(draftKey, JSON.stringify({ answers, stage }));
      else sessionStorage.removeItem(draftKey);
    } catch { /* Storage is optional. */ }
  }, [answers, stage, draftLoaded]);
  const isResults = step >= questionCount;
  const results = discoverProducts(catalog.products, answers, language, {
    includeComingSoon: true,
  });
  const canContinue =
    step === 0
      ? Boolean(answers.goal)
      : criteria.organizationSize && step === 1
        ? Boolean(answers.organizationSize)
        : criteria.maturity && step === maturityStep
          ? Boolean(answers.maturity)
          : false;
  const next = () => {
    if (!canContinue) return;
    if (step === 0)
      void trackJourney("chooser_started", language, { oncePerSession: true });
    if (step === questionCount - 1) {
      completionKey.current ||= crypto.randomUUID();
      void trackJourney("chooser_completed", language, {
        eventKey: completionKey.current,
      });
    }
    setStep((current) => Math.min(questionCount, current + 1));
  };
  const restart = () => {
    setAnswers({ goal: "", organizationSize: "", maturity: "" });
    completionKey.current = "";
    setStep(0);
  };
  const resultSearch = {
    from: "discover" as const,
    goal: answers.goal || undefined,
    organizationSize: answers.organizationSize || undefined,
    maturity: answers.maturity || undefined,
  };
  return (
    <main className="bx-page ea-workspace ea-discover" dir={dir} data-answer-selected={answers.goal ? true : undefined}>
      <JourneyHeading
        icon={Compass}
        title={t("bxStartNeed")}
        description={t("bxChooserLead")}
        view="discover"
      />
      {!isResults && answers.goal && (
        <Button type="button" variant="ghost" onClick={restart}>
          <RotateCcw size={16} aria-hidden="true" />{t("bxRestart")}
        </Button>
      )}
      <a className="ea-guide-step" href={`/guide/${language}.html#s0`}>{language === "ar" ? "كيف أختار أداة؟" : "How do I choose a tool?"}</a>
      <CompareTray goal={answers.goal || undefined} />
      <ol className="ea-step-track" aria-label={t("bxStep")}>
        {[
          t("bxGoalLegend"),
          ...(criteria.organizationSize ? [t("bxOrgLegend")] : []),
          ...(criteria.maturity ? [t("bxMaturityLegend")] : []),
          t("bxResultsTitle"),
        ].map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            data-done={index < step}
          >
            <button
              type="button"
              disabled={index >= step}
              onClick={() => setStep(index)}
            >
              <span>
                {index < step ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">
        {t("bxStep")} {step + 1} {t("bxOf")} {questionCount + 1}
      </p>
      {step === 0 && (
        <ChoiceStep
          legend={t("bxGoalLegend")}
          values={DISCOVERY_GOALS}
          value={answers.goal}
          prefix="bxGoal"
          onChange={(goal) => setAnswers((a) => ({ ...a, goal }))}
        />
      )}
      {criteria.organizationSize && step === 1 && (
        <ChoiceStep
          legend={t("bxOrgLegend")}
          values={ORGANIZATION_SIZES}
          value={answers.organizationSize}
          prefix="bxSize"
          onChange={(organizationSize) =>
            setAnswers((a) => ({ ...a, organizationSize }))
          }
        />
      )}
      {criteria.maturity && step === maturityStep && (
        <ChoiceStep
          legend={t("bxMaturityLegend")}
          values={MATURITY_LEVELS}
          value={answers.maturity}
          prefix="bxMaturity"
          onChange={(maturity) => setAnswers((a) => ({ ...a, maturity }))}
        />
      )}
      {!isResults ? (
        <div className="bx-actions bx-actions-between ea-chooser-controls">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
          >
            <BackIcon aria-hidden="true" />
            {t("bxBack")}
          </Button>
          <Button type="button" disabled={!canContinue} onClick={next}>
            {step === questionCount - 1 ? t("bxResultsTitle") : t("bxNext")}
            <NextIcon aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <section aria-labelledby="discover-results">
          <div className="bx-actions bx-actions-between">
            <h2 id="discover-results">{t("bxResultsTitle")}</h2>
            <div className="bx-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(0)}
              >
                {t("bxEdit")}
              </Button>
              <Button type="button" variant="ghost" onClick={restart}>
                <RotateCcw aria-hidden="true" />
                {t("bxRestart")}
              </Button>
            </div>
          </div>
          <p className="bx-result-rule">{t("bxEvidenceRule")}</p>
          {results.length ? (
            <div className="bx-results">
              {results.map((match) => {
                const product = localizedProduct(match.product, language);
                const launch = acquisitionGuide(product, language)?.launch;
                return (
                  <article className="bx-result" key={product.id}>
                    <Link
                      to="/product/$productId"
                      params={{ productId: product.id }}
                      search={resultSearch}
                      className="bx-result-image"
                      aria-label={`${t("bxOpenToolPage")}: ${product.name}`}
                    >
                      <img
                        src={art.image(product)}
                        alt={product.imageAlt}
                        width={1280}
                        height={832}
                        loading="lazy"
                      />
                    </Link>
                    <div className="bx-badges">
                      <span className="bx-match-badge">
                        <Check aria-hidden="true" size={14} />
                        {t("bxMatchBadge")}
                      </span>
                      {product.comingSoon && (
                        <span className="bx-soon-badge">
                          <Clock aria-hidden="true" size={14} />
                          {launch
                            ? `${t("comingSoonBadge")} · ${launch}`
                            : t("bxSoonNotRequestable")}
                        </span>
                      )}
                    </div>
                    <span className="bx-result-label">{product.label}</span>
                    <h3 dir="ltr">{product.name}</h3>
                    <p>{product.description}</p>
                    {((answers.goal === "technology" &&
                      product.id === "radar") ||
                      (answers.goal === "applications" &&
                        product.id === "landscape")) && (
                      <div className="bx-evidence">
                        <p>
                          {product.id === "radar"
                            ? language === "ar"
                              ? "يناسب هدفك لأنه يساعدك على تحديد موقفك من تبنّي كل تقنية."
                              : "Fits your goal by helping you decide which technologies to adopt."
                            : language === "ar"
                              ? "يناسب هدفك لأنه يعرض التطبيقات القائمة والعلاقات بينها."
                              : "Fits your goal by mapping existing applications and their relationships."}
                        </p>
                        {catalog.products.some(
                          (p) =>
                            p.id ===
                            (product.id === "radar" ? "landscape" : "radar"),
                        ) && (
                          <FeatureOnly feature="compare">
                          <Link
                            to="/compare"
                            search={{ ids: "radar,landscape", goal: answers.goal || undefined }}
                          >
                            {language === "ar"
                              ? "قارن الأداتين"
                              : "Compare both tools"}
                          </Link>
                          </FeatureOnly>
                        )}
                      </div>
                    )}
                    <div className="bx-evidence">
                      <strong>{t("bxMatchEvidence")}</strong>
                      <ul>
                        {match.evidence.map((item, index) => (
                          <li key={`${item.field}-${index}`}>
                            {item.field === "metadata" ? (
                              t("bxMetadataGoal")
                            ) : (
                              <q>{item.text}</q>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bx-unknowns">
                      {answers.organizationSize && (
                        <span>{t(fitCopy(match.organizationFit, "Org"))}</span>
                      )}
                      {answers.maturity && (
                        <span>{t(fitCopy(match.maturityFit, "Maturity"))}</span>
                      )}
                    </div>
                    <AcquisitionGuidePanel
                      product={product}
                      salesEmail={catalog.settings.contactInfo.email}
                    />
                    <ProductToolsActions product={product} />
                    <div className="bx-actions">
                      {!product.comingSoon &&
                        /^https?:\/\//i.test(product.url) && (
                          <Button asChild variant="outline">
                            <a
                              href={product.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {language === "ar" ? "فتح الأداة" : "Launch tool"}
                            </a>
                          </Button>
                        )}
                      {!product.comingSoon && ["radar", "landscape", "archone"].includes(product.id) && (
                        <Button asChild variant="outline"><Link to="/product/$productId" params={{ productId: product.id }}
                          search={resultSearch} hash="exercise">{language === "ar" ? "جرّبها على مثال" : "Try a worked example"}</Link></Button>
                      )}
                      <Button asChild>
                        <Link
                          to="/product/$productId"
                          params={{ productId: product.id }}
                          search={resultSearch}
                        >
                          {t("bxOpenToolPage")}
                          <NextIcon aria-hidden="true" />
                        </Link>
                      </Button>
                      {!product.comingSoon && (
                        <Button asChild variant="ghost">
                          <Link
                            to="/request"
                            search={{ type: "general", product: product.id }}
                          >
                            {t("bxRequestTool")}
                          </Link>
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="bx-empty" role="status">
              <h3>{t("bxNoMatchingTools")}</h3>
              <p>{t("bxNoMatchingToolsHint")}</p>
              <Button asChild variant="outline">
                <Link to="/">{t("bxBrowseLibrary")}</Link>
              </Button>
            </div>
          )}
          <JourneyRating />
        </section>
      )}
      {step === 0 &&
        catalog.products.some((p) => p.id === "radar") &&
        catalog.products.some((p) => p.id === "landscape") && (
          <details className="bx-panel">
            <summary>
              {language === "ar"
                ? "محتار بين Tech Radar وApp Landscape؟"
                : "Choosing between Tech Radar and App Landscape?"}
            </summary>
            <p>
              {language === "ar"
                ? "هل تقيّم تقنية جديدة أم تراجع التطبيقات المستخدمة بالفعل؟"
                : "Are you assessing new technology or reviewing applications already in use?"}
            </p>
            <div className="bx-actions">
              {(["technology", "applications"] as const).map((goal) => (
                <Button
                  key={goal}
                  variant="outline"
                  onClick={() => {
                    setAnswers({ ...answers, goal });
                    setStep(1);
                    void trackJourney("chooser_started", language, {
                      oncePerSession: true,
                    });
                  }}
                >
                  {goal === "technology"
                    ? language === "ar"
                      ? "تقييم تقنية جديدة"
                      : "Assess new technology"
                    : language === "ar"
                      ? "مراجعة التطبيقات الحالية"
                      : "Review existing applications"}
                </Button>
              ))}
            </div>
          </details>
        )}
      {!isResults && (
<details className="ea-flow-details">
        <summary>{t("blogStepsTitle")}</summary>
        <ol>
          {(
            [
              "blogStepOne",
              "blogStepTwo",
              "blogStepThree",
              "blogStepFour",
            ] as const
          ).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ol>
      </details>
      )}
    </main>
  );
}

function GatedDiscoverPage() {
  return (
    <FeatureGate featureKey="discover">
      <DiscoverPage />
    </FeatureGate>
  );
}
