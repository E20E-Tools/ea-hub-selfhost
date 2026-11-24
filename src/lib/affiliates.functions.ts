import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { publishableClient, resolveAsset } from "./catalog.functions";

/** One affiliate shown on /affiliates; imagePath is the stored gallery path or https URL. */
export type AffiliateRow = {
  id: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  image: string;
  imagePath: string;
  url: string;
};

/** Public read: affiliate page content in display order. Empty list on failure. */
export const listAffiliates = createServerFn({ method: "GET" }).handler(
  async (): Promise<AffiliateRow[]> => {
    try {
      const client = publishableClient();
      const { data, error } = await client
        .from("affiliates")
        .select(
          "id, title_ar, title_en, description_ar, description_en, image_url, url",
        )
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return await Promise.all(
        (data ?? []).map(async (row) => ({
          id: row.id,
          titleAr: row.title_ar,
          titleEn: row.title_en,
          descriptionAr: row.description_ar,
          descriptionEn: row.description_en,
          image: await resolveAsset(client, row.image_url),
          imagePath: row.image_url,
          url: row.url,
        })),
      );
    } catch {
      return [];
    }
  },
);

export const affiliatesQueryOptions = queryOptions({
  queryKey: ["affiliates"],
  queryFn: () => listAffiliates(),
  staleTime: 60_000,
  refetchOnWindowFocus: "always",
});
