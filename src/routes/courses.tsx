import { createFileRoute } from "@tanstack/react-router";
import { PartnerService } from "@/studio/partner-service";
export const Route = createFileRoute("/courses")({
  head: () => ({ meta: [{ title: "Courses — E20E Tools" }] }),
  component: () => <PartnerService learning={true} />,
});
