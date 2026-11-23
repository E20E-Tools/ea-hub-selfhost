import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/releases_/$productId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/product/$productId",
      params: { productId: params.productId },
      statusCode: 301,
    });
  },
});
