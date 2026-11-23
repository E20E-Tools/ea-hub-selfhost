import { createFileRoute } from "@tanstack/react-router";
import { StudioEnterprise } from "@/studio/enterprise";
import { catalogQueryOptions } from "@/lib/catalog.functions";

const URL = "https://www.e20e.tools/enterprise-services";
const TITLE = "Enterprise Services — E20E Tools | خدمات المؤسسات";
const DESCRIPTION =
  "Professional services to implement, set up and roll out E20E Tools inside your organisation, with training and technical support. خدمات احترافية لتنفيذ وإعداد وتطبيق أدوات المنصة داخل مؤسستك مع التدريب والدعم الفني.";

export const Route = createFileRoute("/enterprise-services")({
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
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(catalogQueryOptions);
  },
  component: StudioEnterprise,
});
