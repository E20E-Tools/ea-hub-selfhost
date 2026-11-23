import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const prefsSchema = z
  .object({
    general: z.boolean(),
    products: z
      .array(
        z
          .string()
          .regex(/^[a-z0-9_-]+$/i)
          .max(100),
      )
      .max(100),
  })
  .refine((p) => p.general || p.products.length > 0);
const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const joinNewsletter = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      prefs: prefsSchema.optional(),
      email: z.string().trim().email().max(254).toLowerCase(),
      lang: z.enum(["ar", "en"]),
    }),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { clientIp, consumeLimits } = await import("./rate-limit.server");
    if (
      !(await consumeLimits([
        {
          bucket: "newsletter:join",
          subject: clientIp(getRequest()),
          windowSeconds: 3600,
          limit: 10,
        },
      ]))
    )
      throw Error("Try again later");
    return (await import("./newsletter.server")).subscribe(
      data.email,
      data.lang,
      data.prefs,
    );
  });
export const manageNewsletter = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().uuid(),
      action: z.enum(["confirm", "unsubscribe"]),
    }),
  )
  .handler(async ({ data }) =>
    (await import("./newsletter.server")).manage(data.token, data.action),
  );
export const newsletterAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await (await import("./admin-guard.server")).requireAdmin(context);
    return (await import("./newsletter.server")).newsletterStatus();
  });
export const publishNewsletterUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      ar: z.string().trim().min(2).max(500),
      en: z.string().trim().min(2).max(500),
      path: z
        .string()
        .max(250)
        .regex(/^\/(?!\/)[a-zA-Z0-9/_-]*$/),
    }),
  )
  .handler(async ({ data, context }) => {
    await (await import("./admin-guard.server")).requireAdmin(context);
    await (
      await import("./newsletter.server")
    ).addUpdate(data.ar, data.en, data.path);
    return true;
  });

export const newsletterPreferences = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ token: z.string().uuid(), prefs: prefsSchema.optional() }),
  )
  .handler(async ({ data }) =>
    (await import("./newsletter.server")).preferences(data.token, data.prefs),
  );
export const getNewsletterPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(monthSchema)
  .handler(async ({ context, data }) => {
    await (await import("./admin-guard.server")).requireAdmin(context);
    return (await import("./newsletter.server")).previewIssue(data);
  });
export const emailNewsletterPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ month: monthSchema, lang: z.enum(["en", "ar"]), recipient: z.enum(["admin", "editorial"]).optional() }))
  .handler(async ({ context, data }) => {
    await (await import("./admin-guard.server")).requireAdmin(context);
    const email = data.recipient === "editorial" ? "EA@E20E.Tools" : z.string().email().parse(context.claims.email);
    return (await import("./newsletter.server")).sendPreview(
      data.month,
      data.lang,
      email,
    );
  });
export const approveIssue=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator(z.object({month:monthSchema,lang:z.enum(["ar","en"]),body:z.string().trim().min(5).max(30000)}))
.handler(async({context,data})=>{
  await (await import("./admin-guard.server")).requireAdmin(context);
  if(!(await (await import("./work-assistant.server")).readPolicy()).issue.enabled)throw Error("Feature disabled");
  await (await import("./newsletter.server")).approveEditorial(data.month,data.lang,data.body);
  return true;
});
