import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarPlus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { pageUrl } from "@/lib/seo";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import {
  ARCHONE_ID,
  archoneSoonTarget,
  launchDayLabel,
  launchGoogleCalendarHref,
  launchIcs,
  launchInstantFor,
  launchMonthGrid,
  launchMonthLabel,
} from "@/lib/archone-launch";
import { dictionaries } from "@/lib/copy";

export const Route = createFileRoute("/archone-coming-soon")({
  loader: async ({ context }) => {
    const catalog =
      await context.queryClient.ensureQueryData(catalogQueryOptions);
    const product = catalog.products.find((item) => item.id === ARCHONE_ID);
    const target = archoneSoonTarget(product, Date.now());
    // After launch the countdown would only show zeros, so visitors go to the tool page.
    if (target === "product")
      throw redirect({
        to: "/product/$productId",
        params: { productId: ARCHONE_ID },
      });
    if (target === "home") throw redirect({ to: "/" });
    return { date: product?.publicationDate ?? "" };
  },
  head: ({ loaderData }) => {
    const at = launchInstantFor(ARCHONE_ID, loaderData?.date);
    const en = at
      ? new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Riyadh",
        }).format(at)
      : "";
    return {
      meta: [
        {
          title: en
            ? `ArchONE — Coming soon ${en} | قريبًا`
            : "ArchONE — Coming soon | قريبًا",
        },
        {
          name: "description",
          content: en
            ? `ArchONE launches on ${en} on E20E Tools. منصة ArchONE قريبًا.`
            : "ArchONE is coming soon on E20E Tools. منصة ArchONE قريبًا.",
        },
        { property: "og:title", content: "ArchONE — Coming soon" },
        {
          property: "og:description",
          content: en
            ? `ArchONE launches on ${en} on E20E Tools.`
            : "ArchONE is coming soon.",
        },
        { property: "og:url", content: pageUrl("/archone-coming-soon") },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: pageUrl("/archone-coming-soon") }],
    };
  },
  component: ArchOneSoon,
});

function ArchOneSoon() {
  const { date } = Route.useLoaderData();
  const navigate = useNavigate();
  const { dir, language } = useLanguage();
  const ar = language === "ar";
  const launch = launchInstantFor(ARCHONE_ID, date);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const launched = launch !== null && now !== null && launch.getTime() <= now;
  useEffect(() => {
    if (launched)
      void navigate({
        to: "/product/$productId",
        params: { productId: ARCHONE_ID },
        replace: true,
      });
  }, [launched, navigate]);

  const left =
    now === null || !launch ? null : Math.max(0, launch.getTime() - now);
  const parts = [
    {
      v: left === null ? null : Math.floor(left / 86400000),
      l: dictionaries[ar ? "ar" : "en"].archoneComingSoonDays,
    },
    {
      v: left === null ? null : Math.floor(left / 3600000) % 24,
      l: dictionaries[ar ? "ar" : "en"].archoneComingSoonHours,
    },
    {
      v: left === null ? null : Math.floor(left / 60000) % 60,
      l: dictionaries[ar ? "ar" : "en"].archoneComingSoonMinutes,
    },
    {
      v: left === null ? null : Math.floor(left / 1000) % 60,
      l: dictionaries[ar ? "ar" : "en"].archoneComingSoonSeconds,
    },
  ];

  const weekdays = ar
    ? ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const grid = launch ? launchMonthGrid(launch) : null;

  return (
    <main dir={dir} className="mx-auto w-full max-w-4xl px-4 py-12 text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 px-3 py-1 text-sm text-primary">
        <Clock size={14} aria-hidden="true" />{" "}
        {dictionaries[ar ? "ar" : "en"].comingSoonBadge}
      </span>
      <h1 dir="ltr" className="mt-4 text-5xl font-bold text-foreground">
        ArchONE
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
        {
          dictionaries[ar ? "ar" : "en"]
            .archoneComingSoonTheNewEnterpriseArchitecture
        }
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">
        {launch
          ? launchDayLabel(launch, ar)
          : dictionaries[ar ? "ar" : "en"].archoneComingSoonToBeAnnounced}
      </p>

      {launch && grid ? (
        <>
          <div className="mt-8 grid grid-cols-4 gap-3" aria-live="off">
            {parts.map((p) => (
              <div
                key={p.l}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div
                  dir="ltr"
                  className="text-3xl font-bold tabular-nums text-foreground"
                >
                  {p.v === null ? "--" : String(p.v).padStart(2, "0")}
                </div>
                <div className="text-xs text-muted-foreground">{p.l}</div>
              </div>
            ))}
          </div>

          <section
            className="mx-auto mt-10 max-w-sm rounded-xl border border-border bg-card p-4"
            aria-label={
              dictionaries[ar ? "ar" : "en"].archoneComingSoonCalendar
            }
          >
            <h2 className="mb-3 font-semibold text-foreground">
              {launchMonthLabel(launch, ar)}
            </h2>
            <div className="grid grid-cols-7 gap-1 text-xs">
              {weekdays.map((w) => (
                <div key={w} className="py-1 text-muted-foreground">
                  {w}
                </div>
              ))}
              {grid.cells.map((d, i) => (
                <div
                  key={i}
                  aria-current={d === grid.day ? "date" : undefined}
                  className={`rounded-md py-2 ${d === grid.day ? "bg-primary font-bold text-primary-foreground" : "text-foreground"}`}
                >
                  {d ?? ""}
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {launch ? (
          <>
            <Button asChild>
              <a
                href={launchGoogleCalendarHref(launch, ar)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <CalendarPlus size={16} aria-hidden="true" />{" "}
                {
                  dictionaries[ar ? "ar" : "en"]
                    .archoneComingSoonAddToGoogleCalendar
                }
              </a>
            </Button>
            <Button asChild variant="outline">
              <a
                href={`data:text/calendar;charset=utf-8,${encodeURIComponent(launchIcs(launch))}`}
                download="archone-launch.ics"
              >
                {
                  dictionaries[ar ? "ar" : "en"]
                    .archoneComingSoonCalendarFileOutlookApple
                }
              </a>
            </Button>
          </>
        ) : null}
        <Button asChild variant="outline">
          <Link to="/product/$productId" params={{ productId: ARCHONE_ID }}>
            {dictionaries[ar ? "ar" : "en"].archoneComingSoonArchoneDetails}
          </Link>
        </Button>
      </div>
    </main>
  );
}
