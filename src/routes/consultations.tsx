import { createFileRoute } from "@tanstack/react-router";
import { PartnerService } from "@/studio/partner-service";
export const Route = createFileRoute("/consultations")({
  head: () => ({ meta: [{title: "Consultations — E20E Tools"}] }),
  component: () => <PartnerService learning={false} />,
});
