import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/design-lab")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const file = process.env["EA_LOCAL_DESIGN_LAB"];
        if (
          !file ||
          !["127.0.0.1", "localhost"].includes(new URL(request.url).hostname)
        ) {
          return new Response(null, { status: 404 });
        }
        const { readFile } = await import("node:fs/promises");
        return new Response(await readFile(file, "utf8"), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-robots-tag": "noindex",
          },
        });
      },
    },
  },
});
