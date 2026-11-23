import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Former About address: permanently redirects so shared links and search results keep
 * working; the query (e.g. ?lang=ar) and any #section are carried over.
 */
export const Route = createFileRoute("/blog")({
  beforeLoad: ({ location }) => {
    throw redirect({
      href: `/about${location.searchStr}${location.hash ? `#${location.hash}` : ""}`,
      statusCode: 301,
    });
  },
});
