import { JourneyHeading } from "@/studio/journey-heading";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeatureGate } from "@/components/feature-gate";
import { useLanguage } from "@/lib/language";
import { testimonialsQueryOptions } from "@/lib/testimonials.functions";
import {
  TESTIMONIALS_URL,
  testimonialText,
  testimonialsSeo,
  type Testimonial,
} from "@/lib/testimonials.shared";

export const Route = createFileRoute("/testimonials")({
  // Return the rows so the browser reuses the server's signed photo links (no hydration mismatch).
  loader: async ({ context }) => ({
    testimonials: await context.queryClient.ensureQueryData(testimonialsQueryOptions),
  }),
  head: ({ loaderData }) => {
    const list = loaderData?.testimonials ?? [];
    const seo = testimonialsSeo(list);
    const count = list.length;
    const description =
      count > 0
        ? `${count} testimonial${count === 1 ? "" : "s"} from enterprise architecture and transformation teams about E20E Tools. شهادات فرق البنية المؤسسية عن أدوات المنصة.`
        : "What enterprise architecture teams say about E20E Tools. ما يقوله فرق البنية المؤسسية عن أدوات المنصة.";
    return {
      meta: [
        { title: "Customer testimonials — E20E Tools | شهادات العملاء" },
        { name: "description", content: description },
        { property: "og:title", content: "Customer testimonials — E20E Tools | شهادات العملاء" },
        { property: "og:description", content: description },
        { property: "og:url", content: TESTIMONIALS_URL },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        // Hidden from search only while there is nothing published to show.
        ...(seo.noindex ? [{ name: "robots", content: "noindex" }] : []),
      ],
      links: [{ rel: "canonical", href: TESTIMONIALS_URL }],
      scripts: seo.jsonLd
        ? [{ type: "application/ld+json", children: JSON.stringify(seo.jsonLd) }]
        : [],
    };
  },
  component: TestimonialsPage,
});

function Avatar({ item, alt }: { item: Testimonial; alt: string }) {
  if (item.image)
    return (
      <img
        src={item.image}
        alt={alt}
        width={56}
        height={56}
        loading="lazy"
        className="size-14 shrink-0 rounded-full border border-border object-cover"
      />
    );
  return (
    <span
      aria-hidden="true"
      className="flex size-14 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-lg font-semibold text-primary"
    >
      {item.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function TestimonialsPage() {
  return (
    <FeatureGate featureKey="testimonials">
      <TestimonialsContent />
    </FeatureGate>
  );
}

function TestimonialsContent() {
  const { dir, t, language } = useLanguage();
  const queryClient = useQueryClient();
  const loaded = Route.useLoaderData();
  if (queryClient.getQueryData(testimonialsQueryOptions.queryKey) === undefined) {
    queryClient.setQueryData(testimonialsQueryOptions.queryKey, loaded.testimonials);
  }
  const { data } = useSuspenseQuery(testimonialsQueryOptions);
  return (
    <main className="library-page ea-workspace ea-testimonials" dir={dir}>
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <JourneyHeading icon={Quote} title={t("navTestimonials")} description={t("testimonialsLead")} />
        {data.length === 0 ? (
          <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-border bg-card p-8 text-card-foreground">
            <Quote className="size-8 text-primary" aria-hidden="true" />
            <p className="text-muted-foreground">{t("testimonialsEmpty")}</p>
            <Button asChild variant="outline">
              <Link to="/request" search={{ type: "general" }}>
                {t("testimonialsEmptyCta")}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {data.map((item) => {
              const text = testimonialText(item, language);
              const meta = [text.role, text.organization].filter(Boolean).join(" · ");
              return (
                <figure
                  key={item.id}
                  className="flex min-w-0 flex-col gap-5 rounded-lg border border-border bg-card p-6 text-card-foreground"
                >
                  <Quote className="size-7 text-primary" aria-hidden="true" />
                  <blockquote className="flex-1 text-base leading-8" dir="auto">
                    {text.quote}
                  </blockquote>
                  <figcaption className="flex items-center gap-4 border-t border-border pt-5">
                    <Avatar
                      item={item}
                      alt={t("testimonialPhotoAlt").replace("{name}", item.name)}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold" dir="auto">
                        {item.name}
                      </p>
                      {meta ? (
                        <p className="text-sm text-muted-foreground" dir="auto">
                          {meta}
                        </p>
                      ) : null}
                    </div>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
