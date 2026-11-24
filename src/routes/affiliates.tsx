import { Network } from "lucide-react";
import { JourneyHeading } from "@/studio/journey-heading";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { FeatureGate } from "@/components/feature-gate";
import {
  affiliatesQueryOptions,
  type AffiliateRow,
} from "@/lib/affiliates.functions";
import consultationImage from "@/assets/affiliates-consultations.jpg";
import courseImage from "@/assets/affiliates-courses.jpg";
import { pageUrl } from "@/lib/seo";

export const Route = createFileRoute("/affiliates")({
  head: () => ({
    meta: [
      { title: "Affiliates — E20E Tools | التوابع" },
      {
        name: "description",
        content:
          "Explore DT Guide consultations and courses connected to E20E Tools. تعرّف على الاستشارات والدورات المرتبطة بالمنصة.",
      },
      { property: "og:title", content: "Affiliates — E20E Tools | التوابع" },
      {
        property: "og:description",
        content:
          "DT Guide consultations and courses. الاستشارات والدورات عبر DT Guide.",
      },
      { property: "og:url", content: pageUrl("/affiliates") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: pageUrl("/affiliates") }],
  }),
  // Return the rows so the browser reuses the server's signed image links (no hydration mismatch).
  loader: async ({ context }) => ({
    affiliates: await context.queryClient.ensureQueryData(
      affiliatesQueryOptions,
    ),
  }),
  component: AffiliatesPage,
});

/** Shown only if the database has no rows (e.g. all deleted) or the read fails. */
const fallbackAffiliates = (): AffiliateRow[] => [
  {
    id: "consultations",
    titleAr: "الاستشارات",
    titleEn: "Consultations",
    descriptionAr: "تعرّف على خدمات الاستشارات التقنية عبر DT Guide.",
    descriptionEn: "Explore technology consulting services through DT Guide.",
    image: consultationImage,
    imagePath: "",
    url: "https://www.dt.guide/itconsultations/",
  },
  {
    id: "courses",
    titleAr: "الدورات",
    titleEn: "Courses",
    descriptionAr: "استعرض الدورات والبرامج التعليمية عبر DT Guide.",
    descriptionEn: "Browse courses and learning programmes through DT Guide.",
    image: courseImage,
    imagePath: "",
    url: "https://www.dt.guide/courses/",
  },
];

function AffiliatesPage() {
  const { dir, t, language } = useLanguage();
  const queryClient = useQueryClient();
  const loaded = Route.useLoaderData();
  if (queryClient.getQueryData(affiliatesQueryOptions.queryKey) === undefined) {
    queryClient.setQueryData(
      affiliatesQueryOptions.queryKey,
      loaded.affiliates,
    );
  }
  const { data } = useSuspenseQuery(affiliatesQueryOptions);
  const affiliates = data.length > 0 ? data : fallbackAffiliates();
  const title = (row: AffiliateRow) =>
    (language === "ar" ? row.titleAr : row.titleEn) || row.titleAr;
  const description = (row: AffiliateRow) =>
    (language === "ar" ? row.descriptionAr : row.descriptionEn) ||
    row.descriptionAr;
  return (
    <FeatureGate featureKey="affiliates">
      <main className="library-page ea-workspace ea-affiliates" dir={dir}>
        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <JourneyHeading
            icon={Network}
            title={t("navAffiliates")}
            description={t("affiliatesLead")}
          />
          <div className="grid gap-6 md:grid-cols-2">
            {affiliates.map((affiliate) => (
              <article
                key={affiliate.id}
                className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground"
              >
                <img
                  src={affiliate.image}
                  alt={title(affiliate)}
                  width={1200}
                  height={800}
                  loading="lazy"
                  className="aspect-[3/2] w-full object-contain"
                />
                <div className="flex flex-1 flex-col items-start gap-4 p-6">
                  <div>
                    <p className="text-sm text-muted-foreground" dir="ltr">
                      DT Guide
                    </p>
                    <h2 className="mt-2 text-xl font-semibold">
                      {title(affiliate)}
                    </h2>
                  </div>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {description(affiliate)}
                  </p>
                  <Button
                    asChild
                    variant="outline"
                    className="mt-auto"
                    title={t("affiliatesNewTab")}
                  >
                    <a
                      href={affiliate.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("affiliatesVisit")}
                      <span className="sr-only">: {title(affiliate)}</span>
                      <ExternalLink size={16} aria-hidden="true" />
                      <span className="sr-only">{t("affiliatesNewTab")}</span>
                    </a>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </FeatureGate>
  );
}
