import { OPEN_REQUEST_STATUSES } from "./requests.shared";
import { archyGreetingSchema } from "./archy-settings";
import { termsSchema } from "./terms";
import { DESIGN_THEME_IDS, PRODUCT_LAYOUTS } from "./design-themes";
import { contactInfoSchema } from "./contact-info";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isKnownFont, isValidColor } from "./catalog";
import type { RequestAttachment } from "./suggestion.shared";
import {
  OFFER_STATUSES,
  REQUEST_TYPES,
  REQUEST_STATUSES,
  type OfferStatus,
  type OfferType,
  type RequestStatus,
  type RequestType,
} from "./requests.shared";
import type { AdminImage } from "./admin-gallery.shared";
import { FEATURE_KEYS, LEGACY_FEATURE_KEYS, normalizeFeatureFlags, type FeatureKey } from "./site-features";
import { navigationSchema } from "./navigation.shared";
import { isPublicationDate } from "./publication-date";
import { beneficiaryDetailsSchema } from "./beneficiary-metadata";
import { footerLinksSchema } from "./footer-links";
import {
  compactCustomization,
  isEmptyCustomization,
  normalizeThemeCustomizations,
  saveThemeCustomizationSchema,
  type ThemeCustomization,
} from "./theme-customization";

export type AdminResult = { ok: true } | { ok: false; message: string };

type AdminContext = { supabase: SupabaseClient<Database>; userId: string; claims: unknown };

/** Shared server-only admin guard (loaded lazily so it never enters the client bundle). */
export async function requireAdmin(context: AdminContext) {
  const guard = await import("./admin-guard.server");
  await guard.requireAdmin(context);
}

/** Best-effort append to the admin audit log; never blocks the change itself. */
export async function logActivity(context: AdminContext, action: string, target = "") {
  // Every admin save logs here, so this is also where the visitor catalog cache is cleared.
  (await import("./catalog-cache.server")).invalidateCatalogCache();
  try {
    const email = (context.claims as { email?: unknown } | null)?.email;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_activity").insert({
      actor_id: context.userId,
      actor_email: typeof email === "string" ? email : "",
      action,
      target: target.slice(0, 200),
    });
  } catch {
    // Audit failures must not undo a confirmed admin change.
  }
}

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9-]{1,40}$/,
    "المعرّف يجب أن يكون حروفًا إنجليزية صغيرة أو أرقامًا أو شرطات.",
  );

const productSchema = z.object({
  id: slugSchema,
  name: z.string().trim().min(2, "اكتب اسم المنتج.").max(80),
  category: slugSchema,
  categoryLabel: z.string().trim().min(2, "اكتب اسم التصنيف.").max(60),
  label: z.string().trim().min(2, "اكتب الوصف التعريفي.").max(60),
  description: z.string().trim().min(10, "الوصف المختصر قصير جدًا.").max(300),
  overview: z.string().trim().min(10, "الوصف الكامل قصير جدًا.").max(1200),
  features: z.array(z.string().trim().min(1, "اكتب الميزة أو احذف السطر.").max(200)).max(20),
  version: z.string().trim().max(40),
  whatsNew: z.string().trim().max(1500),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), "رابط النظام غير صحيح."),
  keywords: z.string().trim().max(500),
  comingSoon: z.boolean(),
  servicesEnabled: z.boolean().optional(),
  publicationDate: z
    .string()
    .refine((value) => value === "" || isPublicationDate(value), "Invalid publication date")
    .optional(),
  imageUrl: z.string().trim().max(500),
  imageAlt: z.string().trim().max(200),
  labelEn: z.string().trim().max(60).default(""),
  descriptionEn: z.string().trim().max(300).default(""),
  overviewEn: z.string().trim().max(1200).default(""),
  featuresEn: z.array(z.string().trim().max(200)).max(20).default([]),
  whatsNewEn: z.string().trim().max(1500).default(""),
  githubUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === "" || /^https:\/\/\S+$/i.test(value), "رابط GitHub غير صحيح.")
    .default(""),
  imageAltEn: z.string().trim().max(200).default(""),
  sortOrder: z.number().int().min(0).max(9999),
  beneficiaryDetails: beneficiaryDetailsSchema.default({
    goals: [],
    organizationSizes: [],
    maturityLevels: [],
    audience: { ar: "", en: "" },
    notFor: { ar: "", en: "" },
    prerequisites: { ar: [], en: [] },
    integrations: { ar: [], en: [] },
    limitations: { ar: [], en: [] },
    exampleOutput: { ar: "", en: "" },
    purchaseSteps: { ar: [], en: [] },
    problem: { ar: "", en: "" },
    eaLayer: "",
    screenshots: [],
  }),
});

async function syncCategory(context: AdminContext, id: string, label: string) {
  const { data: row } = await context.supabase
    .from("site_settings")
    .select("categories")
    .eq("id", true)
    .maybeSingle();
  const current = (row?.categories ?? {}) as Record<string, string>;
  if (current[id] === label) return;
  // Update only the categories column (merged), never overwrite other settings.
  await context.supabase
    .from("site_settings")
    .update({ categories: { ...current, [id]: label } as never })
    .eq("id", true);
}

export const getAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const email = (context.claims as { email?: unknown }).email;
    return {
      isAdmin: !error && data === true,
      email: typeof email === "string" ? email : "",
    };
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => productSchema.parse(value))
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("products").upsert({
      id: data.id,
      name: data.name,
      category: data.category,
      label: data.label,
      description: data.description,
      overview: data.overview,
      features: data.features,
      version: data.version,
      whats_new: data.whatsNew,
      url: data.url,
      keywords: data.keywords,
      coming_soon: data.comingSoon,
      ...(data.servicesEnabled !== undefined && {services_enabled:data.servicesEnabled}),
      ...(data.publicationDate !== undefined
        ? { publication_date: data.publicationDate || null }
        : {}),
      image_url: data.imageUrl,
      image_alt: data.imageAlt,
      label_en: data.labelEn,
      description_en: data.descriptionEn,
      overview_en: data.overviewEn,
      features_en: data.featuresEn,
      whats_new_en: data.whatsNewEn,
      github_url: data.githubUrl,
      image_alt_en: data.imageAltEn,
      sort_order: data.sortOrder,
      beneficiary_details: data.beneficiaryDetails as never,
      updated_at: new Date().toISOString(),
    });
    if (error) return { ok: false, message: "errSaveProduct" };
    await syncCategory(context, data.category, data.categoryLabel);
    await logActivity(context, "product.save", data.id);
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => z.object({ id: slugSchema }).parse(value))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("products").delete().eq("id", data.id);
    if (!error) await logActivity(context, "product.delete", data.id);
    return error ? { ok: false, message: "errDeleteProduct" } : { ok: true };
  });

export type AdminActivityRow = {
  id: string;
  actor_email: string;
  action: string;
  target: string;
  created_at: string;
};

export type RequestRow = {
  id: string;
  request_type: RequestType;
  name: string;
  email: string;
  phone: string;
  company: string | null;
  need: string;
  product_id: string | null;
  urgency: string | null;
  impact: string;
  recommendation: {
    summary?: string;
    picks?: { name?: string; productId?: string; id?: string }[];
  } | null;
  created_at: string;
  status: RequestStatus;
  status_updated_at: string | null;
  attachments: (RequestAttachment & { url: string })[];
  details: { exercise?:string; services?: string[]; tools?: string[]; teamSize?: string; timeline?: string } | null;
};

export const setRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(REQUEST_STATUSES) }).parse(value),
  )
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("suggestion_requests")
      .update({ status: data.status, status_updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error || !row) return { ok: false, message: "errRequestStatus" };
    await logActivity(context, `request.${data.status}`, data.id);
    const { notifyCustomer } = await import("./customer-notify.server");
    await notifyCustomer({ kind: "status", requestId: data.id, status: data.status });
    return { ok: true };
  });

/** Search text safe inside a PostgREST or() filter: no separators, wildcards or quotes. */
export function requestSearchTerm(q: string): string {
  return q
    .replace(/[,()%_*\\"'.:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

const requestSearchInput = z
  .object({
    waiting: z.enum(["team", "visitor"]).optional(),
    q: z.string().max(200).optional(),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .optional();

export const listRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => requestSearchInput.parse(value ?? undefined))
  .handler(async ({ data: search, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("suggestion_requests")
      .select(
        "id, request_type, name, email, phone, company, need, product_id, urgency, impact, recommendation, created_at, status, status_updated_at, attachments, details",
      );
    if (search?.waiting) {
      query = query.in("status", [...OPEN_REQUEST_STATUSES]);
      query = search.waiting === "team" ? query.eq("pending_question", "") : query.neq("pending_question", "");
    }
    const term = requestSearchTerm(search?.q ?? "");
    if (term)
      query = query.or(
        ["name", "email", "company", "need", "impact"].map((c) => `${c}.ilike.%${term}%`).join(","),
      );
    if (search?.from) query = query.gte("created_at", `${search.from}T00:00:00Z`);
    if (search?.to) query = query.lte("created_at", `${search.to}T23:59:59.999Z`);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error("تعذّر تحميل الطلبات.");
    return (await Promise.all(
      (data ?? []).map(async (row) => {
        const attachments = Array.isArray(row.attachments)
          ? (row.attachments as RequestAttachment[])
          : [];
        // No signed links: each photo is fetched through getRequestAttachment, which
        // re-checks admin access on every view, so removal takes effect immediately.
        const signed = attachments.map((attachment) => ({ ...attachment, url: "" }));
        return { ...row, attachments: signed };
      }),
    )) as RequestRow[];
  });

const ATTACHMENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Streams one private request photo to a current admin as a data URL; no reusable link exists. */
export const getRequestAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ id: z.string().uuid(), path: z.string().min(1).max(300) }).parse(value),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; src: string } | { ok: false }> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("suggestion_requests")
      .select("attachments")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) return { ok: false };
    const list = Array.isArray(row.attachments) ? (row.attachments as RequestAttachment[]) : [];
    // Only paths recorded on this request can be read.
    if (!list.some((item) => item.path === data.path)) return { ok: false };
    const type = ATTACHMENT_TYPES[data.path.split(".").pop()?.toLowerCase() ?? ""];
    if (!type) return { ok: false };
    const { data: file, error: readError } = await supabaseAdmin.storage
      .from("request-attachments")
      .download(data.path);
    if (readError || !file || file.size > 10 * 1024 * 1024) return { ok: false };
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { ok: true, src: `data:${type};base64,${btoa(binary)}` };
  });

export type SupportOfferRow = {
  id: string;
  offer_type: OfferType;
  name: string;
  email: string;
  phone: string;
  organization: string;
  details: Record<string, string | string[]>;
  message: string;
  status: OfferStatus;
  status_updated_at: string | null;
  created_at: string;
};

export const listSupportOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupportOfferRow[]> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("support_offers")
      .select(
        "id, offer_type, name, email, phone, organization, details, message, status, status_updated_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("تعذّر تحميل عروض الدعم.");
    return (data ?? []) as SupportOfferRow[];
  });

export const setSupportOfferStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(OFFER_STATUSES) }).parse(value),
  )
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("support_offers")
      .update({ status: data.status, status_updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error || !row) return { ok: false, message: "errOfferStatus" };
    await logActivity(context, `offer.${data.status}`, data.id);
    return { ok: true };
  });

export const ADMIN_UPLOAD_FOLDERS = ["branding", "products", "affiliates"] as const;

export type UploadResult = { ok: true; path: string } | { ok: false; message: string };

export const listAdminImages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminImage[]> => {
    await requireAdmin(context);
    // Use the caller's client so storage RLS and second-step requirements still apply.
    const bucket = context.supabase.storage.from("library-assets");
    const rows: AdminImage[] = [];
    const folders = [""];
    for (let index = 0; index < folders.length; index++) {
      const folder = folders[index];
      if (folder === undefined) continue;
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await bucket.list(folder, {
          limit: 100,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) throw new Error("تعذّر تحميل معرض الصور.");
        for (const entry of data ?? []) {
          const path = folder ? `${folder}/${entry.name}` : entry.name;
          if (!entry.id) {
            if (folders.length < 100 && path.split("/").length < 5) folders.push(path);
            continue;
          }
          if (!/\.(png|jpe?g|webp|svg)$/i.test(entry.name)) continue;
          const metadata = entry.metadata as Record<string, unknown> | null;
          const bytes = Number(metadata?.["size"] ?? metadata?.["contentLength"]);
          rows.push({
            path,
            name: entry.name,
            folder,
            url: "",
            bytes: Number.isFinite(bytes) && bytes >= 0 ? bytes : null,
            createdAt: entry.created_at ?? null,
            width: null,
            height: null,
          });
        }
        if (!data || data.length < 100) break;
      }
    }
    // Sign in small batches rather than unbounded parallel requests.
    for (let offset = 0; offset < rows.length; offset += 50) {
      const batch = rows.slice(offset, offset + 50);
      const { data, error } = await bucket.createSignedUrls(
        batch.map((row) => row.path),
        3600,
      );
      if (error) throw new Error("تعذّر إنشاء معاينات الصور.");
      for (const row of batch)
        row.url = data?.find((link) => link.path === row.path)?.signedUrl ?? "";
    }
    return rows;
  });

/** Admin image uploads are validated and stored on the server; SVG is not accepted. */
export const uploadAdminImage = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => {
    if (!(value instanceof FormData)) throw new Error("تعذّر قراءة الصورة.");
    const file = value.get("file");
    const folder = String(value.get("folder") ?? "");
    if (!(file instanceof File)) throw new Error("اختر صورة.");
    if (!(ADMIN_UPLOAD_FOLDERS as readonly string[]).includes(folder))
      throw new Error("مكان غير صالح.");
    if ([...value.keys()].filter((key) => key === "file").length !== 1)
      throw new Error("ارفع صورة واحدة في كل مرة.");
    return { file, folder };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<UploadResult> => {
    await requireAdmin(context);
    const { matchesImageSignature, imageDimensions, stripJpegMetadata, MAX_IMAGE_SIDE } =
      await import("./suggestion.shared");
    const { file, folder } = data;
    const types = ["image/jpeg", "image/png", "image/webp"];
    if (!types.includes(file.type) || file.size === 0 || file.size > 4 * 1024 * 1024) {
      return { ok: false, message: "errImageType" };
    }
    const original = new Uint8Array(await file.arrayBuffer());
    const size = imageDimensions(original, file.type);
    if (
      !matchesImageSignature(original, file.type) ||
      !size ||
      size.width < 1 ||
      size.height < 1 ||
      size.width > MAX_IMAGE_SIDE ||
      size.height > MAX_IMAGE_SIDE
    ) {
      return { ok: false, message: "errImageInvalid" };
    }
    const bytes = file.type === "image/jpeg" ? stripJpegMetadata(original) : original;
    const extension =
      file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const path = `${folder}/${crypto.randomUUID()}.${extension}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("library-assets")
      .upload(path, bytes, { contentType: file.type, cacheControl: "3600", upsert: false });
    if (error) return { ok: false, message: "errImageUpload" };
    await logActivity(context, "image.upload", path);
    return { ok: true, path };
  });

export type AdminDashboard = {
  newRequests: number;
  newByType: Record<RequestType, number>;
  urgentSupport: number;
  newOffers: number;
  latestRequests: {
    id: string;
    request_type: RequestType;
    name: string;
    status: RequestStatus;
    created_at: string;
  }[];
  latestOffers: {
    id: string;
    offer_type: OfferType;
    name: string;
    organization: string;
    status: OfferStatus;
    created_at: string;
  }[];
  latestActivity: AdminActivityRow[];
};

/** Counts and short lists for the admin home and sidebar badges. */
export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDashboard> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const countNewRequests = () =>
      supabaseAdmin
        .from("suggestion_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
    const [fresh, urgent, offers, latestRequests, latestOffers, activity] = await Promise.all([
      Promise.all(
        REQUEST_TYPES.map(async (type) => {
          const { count, error } = await countNewRequests().eq("request_type", type);
          if (error || count === null) throw new Error("تعذّر تحميل لوحة المتابعة.");
          return [type, count] as const;
        }),
      ),
      countNewRequests().eq("request_type", "support").eq("urgency", "urgent"),
      supabaseAdmin
        .from("support_offers")
        .select("id", { count: "exact", head: true })
        .eq("status", "new"),
      supabaseAdmin
        .from("suggestion_requests")
        .select("id, request_type, name, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("support_offers")
        .select("id, offer_type, name, organization, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      context.supabase
        .from("admin_activity")
        .select("id, actor_email, action, target, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (
      urgent.error ||
      urgent.count === null ||
      offers.error ||
      offers.count === null ||
      latestRequests.error ||
      latestOffers.error ||
      activity.error
    )
      throw new Error("تعذّر تحميل لوحة المتابعة.");
    const newByType = Object.fromEntries(fresh) as Record<RequestType, number>;
    return {
      newRequests: fresh.reduce((total, [, count]) => total + count, 0),
      newByType,
      urgentSupport: urgent.count,
      newOffers: offers.count,
      latestRequests: (latestRequests.data ?? []) as AdminDashboard["latestRequests"],
      latestOffers: (latestOffers.data ?? []) as AdminDashboard["latestOffers"],
      latestActivity: activity.data ?? [],
    };
  });

/** Editable affiliate entries shown on /affiliates (public SELECT, service-only writes). */
const affiliateIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "معرّف غير صالح");

export const affiliateInputSchema = z.object({
  id: affiliateIdSchema,
  titleAr: z.string().min(1).max(120),
  titleEn: z.string().max(120),
  descriptionAr: z.string().max(600),
  descriptionEn: z.string().max(600),
  imageUrl: z.string().max(400),
  url: z
    .string()
    .min(1)
    .max(400)
    .refine(
      (value) => /^https:\/\//i.test(value) || /^\/[a-z0-9/-]*$/i.test(value),
      "رابط غير مسموح",
    ),
  sortOrder: z.number().int().min(0).max(9_999),
});

export const saveAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(affiliateInputSchema.parse)
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("affiliates").upsert({
        id: data.id,
        title_ar: data.titleAr,
        title_en: data.titleEn,
        description_ar: data.descriptionAr,
        description_en: data.descriptionEn,
        image_url: data.imageUrl,
        url: data.url,
        sort_order: data.sortOrder,
        updated_at: new Date().toISOString(),
      } as never);
      if (error) throw error;
      await logActivity(context, "affiliate.save", data.id);
      return { ok: true };
    } catch {
      return { ok: false, message: "errSaveAffiliate" };
    }
  });

export const deleteAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ id: affiliateIdSchema }).parse(value))
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("affiliates").delete().eq("id", data.id);
      if (error) throw error;
      await logActivity(context, "affiliate.delete", data.id);
      return { ok: true };
    } catch {
      return { ok: false, message: "errDeleteAffiliate" };
    }
  });

/** Built from FEATURE_KEYS so the flag list has a single source of truth. */
// The original switches are required; newer ones are optional so settings saved (and backed up)
// before they existed still validate, and a missing switch keeps its enabled default.
export const featureFlagsSchema = z
  .object(
    Object.fromEntries(
      FEATURE_KEYS.map((key) => [
        key,
        LEGACY_FEATURE_KEYS.includes(key) ? z.boolean() : z.boolean().optional(),
      ]),
    ) as Record<FeatureKey, z.ZodBoolean>,
  )
  .transform((value) => normalizeFeatureFlags(value));

export const saveFeatureFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => featureFlagsSchema.parse(value))
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("site_settings")
      .update({ feature_flags: data, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) return { ok: false, message: "errSaveFeatures" };
    await logActivity(context, "settings.save", "feature_flags");
    return { ok: true };
  });

export const saveContactInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => contactInfoSchema.parse(value))
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("site_settings")
      .update({ contact_info: data, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) return { ok: false, message: "errSaveContact" };
    await logActivity(context, "settings.save", "contact_info");
    return { ok: true };
  });

/* ---------- Per-section site settings (each updates only its own columns) ---------- */

const categoryIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{2,40}$/, "معرّف التصنيف غير صالح.");
const categoryMapSchema = z
  .record(categoryIdSchema, z.string().trim().min(2).max(60))
  .refine((value) => Object.keys(value).length <= 50, "عدد التصنيفات كبير جدًا.");

export const generalSettingsSchema = z.object({
  displayTitle: z.string().trim().min(2, "العنوان قصير جدًا.").max(80),
  displayTitleEn: z.string().trim().max(80),
  arabicTitle: z.string().trim().max(120),
  tagline: z.string().trim().max(120),
  taglineEn: z.string().trim().max(120),
  description: z.string().trim().min(10, "الوصف قصير جدًا.").max(400),
  descriptionEn: z.string().trim().max(400),
  footerText: z.string().trim().max(200),
  footerTextEn: z.string().trim().max(200),
  footerLinks: footerLinksSchema.optional(),
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (v) =>
        v === "" ||
        /^(branding|products|affiliates)\/[\w.-]+$/.test(v) ||
        /^https:\/\/\S+$/i.test(v),
      "مسار الشعار غير صالح.",
    ),
});

// Saving settings never deletes storage files: logos can be reused by products/affiliates
// and earlier signed URLs or the published site may still reference them.
export const saveGeneralSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => generalSettingsSchema.parse(value))
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("site_settings")
      .update({
        display_title: data.displayTitle,
        display_title_en: data.displayTitleEn,
        arabic_title: data.arabicTitle,
        tagline: data.tagline,
        tagline_en: data.taglineEn,
        description: data.description,
        description_en: data.descriptionEn,
        footer_text: data.footerText,
        footer_text_en: data.footerTextEn,
        ...(data.footerLinks !== undefined ? { footer_links: data.footerLinks } : {}),
        logo_url: data.logoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (error) return { ok: false, message: "errSaveGeneral" };
    await logActivity(context, "settings.save", "general");
    return { ok: true };
  });

export const designThemeSchema = z.object({
  theme: z.enum(DESIGN_THEME_IDS),
  animations: z.boolean(),
  intensity: z.enum(["low", "medium", "high"]),
  productLayout: z.enum(PRODUCT_LAYOUTS).optional(),
});

export const appearanceSettingsSchema = z
  .object({
    headingFont: z.string().trim().max(60).refine(isKnownFont, "خط غير متاح."),
    bodyFont: z.string().trim().max(60).refine(isKnownFont, "خط غير متاح."),
    colors: z
      .record(
        z
          .string()
          .trim()
          .max(60)
          .regex(/^--[a-z0-9-]+$/i, "اسم اللون غير صالح."),
        z.string().trim().max(80).refine(isValidColor, "قيمة اللون غير صحيحة."),
      )
      .refine((value) => Object.keys(value).length <= 40, "عدد الألوان كبير جدًا."),
    designTheme: designThemeSchema,
    imageFit: z.enum(["contain", "cover"]),
    imageBrightness: z.number().min(0.5).max(1.5),
    imageContrast: z.number().min(0.5).max(1.5),
    imageSaturation: z.number().min(0.5).max(1.5),
    imageSharpen: z.boolean(),
    motionEnabled: z.boolean(),
    motionSpeed: z.number().min(0.25).max(3),
    motionDirection: z.enum(["normal", "reverse", "alternate"]),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "لا توجد تغييرات للحفظ.");

/** Appearance fields are optional: only the fields sent are written. */
export const saveAppearanceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => appearanceSettingsSchema.parse(value))
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const row: Database["public"]["Tables"]["site_settings"]["Update"] = {
      updated_at: new Date().toISOString(),
    };
    if (data.headingFont !== undefined) row.heading_font = data.headingFont;
    if (data.bodyFont !== undefined) row.body_font = data.bodyFont;
    if (data.colors !== undefined) row.colors = data.colors;
    if (data.designTheme !== undefined) row.design_theme = data.designTheme;
    if (data.imageFit !== undefined) row.image_fit = data.imageFit;
    if (data.imageBrightness !== undefined) row.image_brightness = data.imageBrightness;
    if (data.imageContrast !== undefined) row.image_contrast = data.imageContrast;
    if (data.imageSaturation !== undefined) row.image_saturation = data.imageSaturation;
    if (data.imageSharpen !== undefined) row.image_sharpen = data.imageSharpen;
    if (data.motionEnabled !== undefined) row.motion_enabled = data.motionEnabled;
    if (data.motionSpeed !== undefined) row.motion_speed = data.motionSpeed;
    if (data.motionDirection !== undefined) row.motion_direction = data.motionDirection;
    const { error } = await context.supabase.from("site_settings").update(row).eq("id", true);
    if (error) return { ok: false, message: "errSaveAppearance" };
    await logActivity(context, "settings.save", "appearance");
    return { ok: true };
  });

/**
 * Saves one design's colours, sizes and pictures. Only theme_customizations is
 * written and only this design's entry changes; an empty entry is removed so the
 * design returns to its own look. Storage files are never deleted.
 */
export const saveThemeCustomization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => saveThemeCustomizationSchema.parse(value))
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const current = await context.supabase
      .from("site_settings")
      .select("theme_customizations")
      .eq("id", true)
      .maybeSingle();
    if (current.error) return { ok: false, message: "errSaveCustomize" };
    const map = normalizeThemeCustomizations(current.data?.theme_customizations);
    const value = compactCustomization(data.value as ThemeCustomization);
    if (isEmptyCustomization(value)) delete map[data.theme];
    else map[data.theme] = value;
    const { error } = await context.supabase
      .from("site_settings")
      .update({
        theme_customizations: map as unknown as NonNullable<
          Database["public"]["Tables"]["site_settings"]["Update"]["theme_customizations"]
        >,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (error) return { ok: false, message: "errSaveCustomize" };
    await logActivity(context, "settings.save", `design:${data.theme}`);
    return { ok: true };
  });

export const NAV_STYLES = [
  "glass",
  "underline",
  "solid",
  "minimal",
  "pills",
  "gradient",
  "tabs",
  "outline",
] as const;

export const navigationSettingsSchema = z
  .object({
    items: navigationSchema,
    navStyle: z.enum(NAV_STYLES),
    mobileNavStyle: z.enum(["sheet", "dropdown", "compact"]),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "لا توجد تغييرات للحفظ.");

export const saveNavigationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => navigationSettingsSchema.parse(value))
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const row: Database["public"]["Tables"]["site_settings"]["Update"] = {
      updated_at: new Date().toISOString(),
    };
    if (data.items !== undefined) row.navigation_items = data.items;
    if (data.navStyle !== undefined) row.nav_style = data.navStyle;
    if (data.mobileNavStyle !== undefined) row.mobile_nav_style = data.mobileNavStyle;
    const { error } = await context.supabase.from("site_settings").update(row).eq("id", true);
    if (error) return { ok: false, message: "errSaveNavigation" };
    await logActivity(context, "settings.save", "navigation");
    return { ok: true };
  });

export const categoriesSchema = z.object({
  categories: categoryMapSchema,
  categoriesEn: categoryMapSchema,
});

export const saveCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => categoriesSchema.parse(value))
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("site_settings")
      .update({
        categories: data.categories,
        categories_en: data.categoriesEn,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (error) return { ok: false, message: "errSaveCategories" };
    await logActivity(context, "settings.save", "categories");
    return { ok: true };
  });

/* ---------- Activity log (one data path, server-side paging + filters) ---------- */

export const activityQuerySchema = z
  .object({
    limit: z.number().int().min(1).max(200).default(200),
    offset: z.number().int().min(0).max(100_000).default(0),
    action: z
      .string()
      .trim()
      .max(60)
      .regex(/^[a-z_.]*$/i)
      .optional(),
    actor: z.string().trim().max(255).optional(),
    group: z
      .string()
      .trim()
      .max(30)
      .regex(/^[a-z]*$/)
      .optional(),
    search: z.string().trim().max(100).optional(),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/)
      .max(40)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/)
      .max(40)
      .optional(),
  })
  // prefault: the empty input is parsed, so inner defaults (limit/offset) still apply.
  .prefault({});

export const listAdminActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => activityQuerySchema.parse(value ?? {}))
  .handler(async ({ data, context }): Promise<AdminActivityRow[]> => {
    await requireAdmin(context);
    let query = context.supabase
      .from("admin_activity")
      .select("id, actor_email, action, target, created_at")
      .order("created_at", { ascending: false });
    if (data.action) query = query.like("action", `${data.action}%`);
    if (data.group && data.group !== "all") query = query.like("action", `${data.group}.%`);
    if (data.search) {
      // Strip PostgREST filter syntax characters before building the OR filter.
      const needle = data.search.replace(/[,()*%\\]/g, " ").trim();
      if (needle)
        query = query.or(
          `actor_email.ilike.*${needle}*,action.ilike.*${needle}*,target.ilike.*${needle}*`,
        );
    }
    if (data.actor) query = query.eq("actor_email", data.actor.toLowerCase());
    if (data.from) query = query.gte("created_at", data.from);
    if (data.to) query = query.lte("created_at", data.to);
    const { data: rows, error } = await query.range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error("تعذّر تحميل السجل.");
    return rows ?? [];
  });

/* ---------- Admins (read-only) ---------- */

export type AdminAccountRow = {
  email: string;
  created_at: string | null;
  last_sign_in_at: string | null;
};

/** Accounts holding the admin role. Read-only: roles are never granted from the UI. */
export const listAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAccountRow[]> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(200);
    if (error) throw new Error("تعذّر تحميل قائمة المشرفين.");
    const rows: AdminAccountRow[] = [];
    for (const { user_id } of roles ?? []) {
      const { data: found } = await supabaseAdmin.auth.admin.getUserById(user_id);
      if (!found.user) continue;
      rows.push({
        email: found.user.email ?? "",
        created_at: found.user.created_at ?? null,
        last_sign_in_at: found.user.last_sign_in_at ?? null,
      });
    }
    return rows.sort((a, b) => a.email.localeCompare(b.email));
  });

/* ---------- Password change (re-verifies the current password) ---------- */

export const ADMIN_PASSWORD_MIN = 10;

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "اكتب كلمة المرور الحالية.").max(200),
  password: z
    .string()
    .min(ADMIN_PASSWORD_MIN, "كلمة المرور يجب أن تكون 10 أحرف على الأقل.")
    .max(200),
});

export const changeAdminPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => passwordChangeSchema.parse(value))
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const { consumeLimits } = await import("./rate-limit.server");
    const allowed = await consumeLimits([
      { bucket: "admin-password", subject: context.userId, limit: 5, windowSeconds: 900 },
    ]);
    if (!allowed) return { ok: false, message: "errPasswordRate" };
    // Email comes from the verified session only, never from input.
    const { data: identity } = await context.supabase.auth.getUser();
    const email = identity.user?.id === context.userId ? identity.user.email : undefined;
    if (!email) return { ok: false, message: "errPasswordIdentity" };
    if (data.password.trim().toLowerCase() === email.toLowerCase())
      return { ok: false, message: "errPasswordEmail" };
    if (data.password === data.currentPassword) return { ok: false, message: "errPasswordSame" };
    const verified = await verifyPassword(email, data.currentPassword);
    if (!verified) return { ok: false, message: "errPasswordCurrent" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.password,
    });
    if (error) return { ok: false, message: "errPasswordUpdate" };
    await logActivity(context, "password.change");
    return { ok: true };
  });

/** Throwaway, non-persistent sign-in used only to confirm the current password. */
async function verifyPassword(email: string, password: string): Promise<boolean> {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return false;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  return true;
}

export const saveTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => termsSchema.parse(value))
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("site_settings")
      .update({
        terms_content: { ar: data.ar, en: data.en, updatedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (error) return { ok: false, message: "errSaveTerms" };
    await logActivity(context, "terms.update");
    return { ok: true };
  });

export const saveArchyGreeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => archyGreetingSchema.parse(value))
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("site_settings")
      .update({ archy_greeting: data, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) return { ok: false, message: "errSaveArchy" };
    await logActivity(context, "settings.save", "archy_greeting");
    return { ok: true };
  });

export type RequestReply = { id: string; author_email: string; author_kind?:string; body: string; created_at: string };

/** Saved team replies on one request, oldest first. */
export const listRequestReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }): Promise<RequestReply[]> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("request_replies")
      .select("id, author_email, author_kind, body, created_at")
      .eq("request_id", data.id)
      .order("created_at")
      .limit(200);
    if (error) throw new Error("replies load failed");
    return rows ?? [];
  });

/** Saves a team reply on a request; a new request moves to in progress. */
export const addRequestReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(5000), needsReply:z.boolean().optional() }).parse(value),
  )
  .handler(async ({ data, context }): Promise<AdminResult> => {
    await requireAdmin(context);
    const { actorEmail } = await import("./admin-guard.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: saved, error } = await supabaseAdmin
      .from("request_replies")
      .insert({
        request_id: data.id,
        body: data.body,
        needs_reply: data.needsReply === true,
        author_email: actorEmail(context.claims as never),
      })
      .select("id")
      .single();
    if (error || !saved) return { ok: false, message: "errReplySave" };
    const { notifyCustomer } = await import("./customer-notify.server");
    await notifyCustomer({ kind: "reply", requestId: data.id, replyId: saved.id, body: data.body });
    await supabaseAdmin
      .from("suggestion_requests")
      .update({ status: "in_progress", status_updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "new");
    await logActivity(context, "request.reply", data.id);
    return { ok: true };
  });
