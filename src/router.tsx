import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import { z } from "zod";
import { routeTree } from "./routeTree.gen";

// The enforced CSP has no 'unsafe-eval'; tell zod not to probe for it (avoids a console violation).
z.config({ jitless: true });

/** The request's CSP nonce from the security-headers middleware (server only). */
function requestNonce(): string | undefined {
  try {
    const nonce = (getGlobalStartContext() as { nonce?: unknown } | undefined)
      ?.nonce;
    return typeof nonce === "string" ? nonce : undefined;
  } catch {
    return undefined;
  }
}

export const getRouter = () => {
  const queryClient = new QueryClient();
  const nonce = requestNonce();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...(nonce ? { ssr: { nonce } } : {}),
  });

  return router;
};
