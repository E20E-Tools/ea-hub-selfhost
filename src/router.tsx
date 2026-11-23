import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { z } from "zod";
import { routeTree } from "./routeTree.gen";

// The enforced CSP has no 'unsafe-eval'; tell zod not to probe for it (avoids a console violation).
z.config({ jitless: true });

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
