import { createFileRoute, redirect } from "@tanstack/react-router";

// Preserve previously shared URLs without retaining the removed page.
export const Route = createFileRoute("/transformation")({
  beforeLoad: () => {
    throw redirect({ href: "/", statusCode: 301 });
  },
});
