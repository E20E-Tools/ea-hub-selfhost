import { createFileRoute, redirect } from "@tanstack/react-router";

// The former "Talk to consultants" page is now Enterprise Services; keep shared links working.
export const Route = createFileRoute("/consultants")({
  beforeLoad: () => {
    throw redirect({ to: "/enterprise-services", statusCode: 301 });
  },
});
