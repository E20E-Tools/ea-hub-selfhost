import { createServerFn } from "@tanstack/react-start";
import { offerRow, supportSchema } from "./requests.shared";

/** `message` is a copy key the page translates. */
export type SupportResult =
  { ok: true; id: string; createdAt: string } | { ok: false; message: string };

/** Support offers (partnership, financial, contribution). Never collects payments. */
export const submitSupportOffer = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => {
    const parsed = supportSchema.safeParse(value);
    if (!parsed.success)
      throw new Error(parsed.error.issues[0]?.message ?? "rqErrInvalid");
    return parsed.data;
  })
  .handler(async ({ data }): Promise<SupportResult> => {
    if (data.website) return { ok: false, message: "rqErrRejected" };
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none")
      return { ok: false, message: "rqErrCrossSite" };
    const { consumeLimits, clientIp } = await import("./rate-limit.server");
    const allowed = await consumeLimits([
      {
        bucket: "support:ip",
        subject: clientIp(request),
        limit: 5,
        windowSeconds: 3600,
      },
      {
        bucket: "support:email-day",
        subject: data.email,
        limit: 3,
        windowSeconds: 86_400,
      },
      {
        bucket: "support:global-day",
        subject: "all",
        limit: 200,
        windowSeconds: 86_400,
      },
    ]);
    if (!allowed) return { ok: false, message: "rqErrBusy" };
    try {
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      if (data.offerType === "financial" && data.productId) {
        const { liveCatalog } = await import("./recommend.server");
        const catalog = await liveCatalog();
        if (!catalog.some((product) => product.id === data.productId))
          return { ok: false, message: "rqErrProduct" };
      }
      const { error } = await supabaseAdmin
        .from("support_offers")
        .insert(offerRow(data) as never);
      // A duplicate id is never answered with the stored row, so receipts can't be probed.
      if (error?.code === "23505")
        return { ok: false, message: "rqErrReceipt" };
      if (error) throw error;
      const { data: receipt, error: receiptError } = await supabaseAdmin
        .from("support_offers")
        .select("id, created_at")
        .eq("id", data.requestId)
        .single();
      if (receiptError || !receipt)
        return { ok: false, message: "rqErrReceipt" };
      const { notifyContactSubmission } =
        await import("./contact-notify.server");
      await notifyContactSubmission(receipt.id, `support.${data.offerType}`);
      return { ok: true, id: receipt.id, createdAt: receipt.created_at };
    } catch {
      return { ok: false, message: "rqErrSave" };
    }
  });
