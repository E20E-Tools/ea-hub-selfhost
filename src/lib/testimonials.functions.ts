import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publishableClient, resolveAsset } from "./catalog.functions";
import { logActivity, requireAdmin, type AdminResult } from "./admin.functions";
import { testimonialInputSchema, type Testimonial } from "./testimonials.shared";

const COLUMNS =
  "id, name, role_ar, role_en, organization_ar, organization_en, quote_ar, quote_en, image_url, sort_order, published";

type Row = {
  id: string;
  name: string;
  role_ar: string;
  role_en: string;
  organization_ar: string;
  organization_en: string;
  quote_ar: string;
  quote_en: string;
  image_url: string;
  sort_order: number;
  published: boolean;
};

async function toTestimonials(rows: Row[]): Promise<Testimonial[]> {
  const client = publishableClient();
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      roleAr: row.role_ar,
      roleEn: row.role_en,
      organizationAr: row.organization_ar,
      organizationEn: row.organization_en,
      quoteAr: row.quote_ar,
      quoteEn: row.quote_en,
      image: await resolveAsset(client, row.image_url),
      imagePath: row.image_url,
      sortOrder: row.sort_order,
      published: row.published,
    })),
  );
}

/** Public read: published testimonials in display order. Empty list on failure. */
export const listTestimonials = createServerFn({ method: "GET" }).handler(
  async (): Promise<Testimonial[]> => {
    try {
      const { data, error } = await publishableClient()
        .from("testimonials")
        .select(COLUMNS)
        .eq("published", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return await toTestimonials((data ?? []) as Row[]);
    } catch {
      return [];
    }
  },
);

export const testimonialsQueryOptions = queryOptions({
  queryKey: ["testimonials"],
  queryFn: () => listTestimonials(),
  staleTime: 60_000,
  refetchOnWindowFocus: "always",
});

/** Admin read: every testimonial, including hidden ones. */
export const listAllTestimonials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Testimonial[]> => {
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("testimonials")
      .select(COLUMNS)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error("errLoadTestimonials");
    return toTestimonials((data ?? []) as Row[]);
  });

export const saveTestimonial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => testimonialInputSchema.parse(value))
  .handler(async ({ data, context }): Promise<AdminResult & { id?: string }> => {
    await requireAdmin(context);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const row = {
        name: data.name,
        role_ar: data.roleAr,
        role_en: data.roleEn,
        organization_ar: data.organizationAr,
        organization_en: data.organizationEn,
        quote_ar: data.quoteAr,
        quote_en: data.quoteEn,
        image_url: data.imagePath,
        sort_order: data.sortOrder,
        published: data.published,
        updated_at: new Date().toISOString(),
      };
      const result = data.id
        ? await supabaseAdmin
            .from("testimonials")
            .update(row)
            .eq("id", data.id)
            .select("id")
            .single()
        : await supabaseAdmin.from("testimonials").insert(row).select("id").single();
      if (result.error || !result.data) throw result.error ?? new Error("no row");
      await logActivity(context, "testimonial.save", data.name);
      return { ok: true, id: result.data.id };
    } catch {
      return { ok: false, message: "errSaveTestimonial" };
    }
  });

export const deleteTestimonial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("testimonials").delete().eq("id", data.id);
      if (error) throw error;
      await logActivity(context, "testimonial.delete", data.id);
      return { ok: true };
    } catch {
      return { ok: false, message: "errDeleteTestimonial" };
    }
  });
