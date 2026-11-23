import { useEffect } from "react";
import { CatalogWorkbench } from "./catalog-workbench";
import { BoardFrame } from "./board-frame";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { ArrowUpRight, Boxes, Compass, Map } from "lucide-react";

import { useLanguage } from "@/lib/language";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { filterCatalog, localizedProduct, localizedSettings } from "@/lib/catalog";
import { archyTour } from "@/lib/archy-tour";
import { featureEnabled } from "@/lib/site-features";

// Read the home route through its id so this module never imports the route file (which imports it).
const Route = getRouteApi("/");

export function StudioHome() {
  const { data } = useSuspenseQuery(catalogQueryOptions);
  const { language } = useLanguage();
  const ar = language === "ar";
  const s = localizedSettings(data.settings, language);
  const products = data.products
    .map((p) => localizedProduct(p, language))
    .sort((a, b) => Number(a.comingSoon) - Number(b.comingSoon));
  const { q = "", cat = "all", archyTour: forced } = Route.useSearch();
  const navigate = Route.useNavigate();

  // Earlier shared searches still land on their matching tool in the full library.
  const linkedTool = q || cat !== "all" ? filterCatalog(products, q, cat)[0]?.id : undefined;
  useEffect(() => {
    if ((!q && cat === "all") || (window.location.hash && window.location.hash !== "#catalog"))
      return;
    const target = linkedTool ? "catalog-" + linkedTool : "catalog";
    document.getElementById(target)?.scrollIntoView({ block: "start" });
  }, [q, cat, linkedTool]);
  useEffect(() => {
    if (forced === "1") {
      archyTour.update({ forced: true });
      void navigate({
        search: (prev) => ({ ...prev, archyTour: undefined }),
        replace: true,
      });
    }
  }, [forced, navigate]);
  const services = [
    {
      href: "/discover",
      Icon: Compass,
      title: ar ? "اكتشف الأداة المناسبة" : "Find the right tool",
      body: ar ? "ابدأ بالتحدّي الذي يواجه فريقك." : "Start with the challenge facing your team.",
    },
    ...(featureEnabled(s.featureFlags, "enterprise")
      ? [
          {
            href: "/enterprise-services",
            Icon: Boxes,
            title: ar ? "خدمات المؤسسات" : "Enterprise services",
            body: ar
              ? "التنفيذ والإطلاق والتدريب والدعم الفني."
              : "Implementation, rollout, training and technical support.",
          },
        ]
      : []),
    ...(featureEnabled(s.featureFlags, "roadmap")
      ? [
          {
            href: "/technology-roadmap",
            Icon: Map,
            title: ar ? "خارطة التقنيات" : "Technology roadmap",
            body: ar
              ? "تعرّف على مراحل تبنّي الأدوات داخل المؤسسة."
              : "Explore adoption phases for your organisation.",
          },
        ]
      : []),
  ];
  return (
    <main className="s-home home-page">
      <BoardFrame settings={s} products={products} />
      <CatalogWorkbench products={products} />
      <section className="s-service-band">
        <div className="s-section">
          <h2>{ar ? "من الاستكشاف إلى التطبيق" : "From discovery to implementation"}</h2>
          <div className="s-service-grid">
            {services.map(({ href, Icon, title, body }) => (
              <a key={href} href={href}>
                <Icon size={26} />
                <h3>{title}</h3>
                <p>{body}</p>
                <ArrowUpRight size={19} />
              </a>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
