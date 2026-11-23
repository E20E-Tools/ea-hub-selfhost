import { createServerFn } from "@tanstack/react-start";
import { sanitizeRecommendation } from "./recommend.shared";
import {
  imageDimensions,
  MAX_IMAGE_SIDE,
  stripJpegMetadata,
  stripWebpMetadata,
  matchesImageSignature,
  validateAttachments,
  type RequestAttachment,
} from "./suggestion.shared";
import { normaliseRequest, requestSchema } from "./requests.shared";

/** `message` is a copy key the page translates. */
export type RequestResult =
  | { ok: true; id: string; createdAt: string; tracking: "account" | "guest" | "none" }
  | { ok: false; message: string };

export const submitRequest = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => {
    if (!(value instanceof FormData)) throw new Error("rqErrInvalid");
    const raw = Object.fromEntries(value.entries());
    let recommendation: unknown;
    try {
      recommendation = raw["recommendation"]
        ? JSON.parse(String(raw["recommendation"]))
        : undefined;
    } catch {
      recommendation = undefined;
    }
    // Service choices arrive as JSON lists; anything unreadable becomes an empty list.
    const list = (key: string) => {
      try {
        const value: unknown = raw[key] ? JSON.parse(String(raw[key])) : [];
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    };
    const parsed = requestSchema.safeParse({
      ...raw,
      recommendation,
      services: list("services"),
      tools: list("tools"),
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "rqErrInvalid");
    const entry = normaliseRequest(parsed.data);
    const files = entry.allowImages
      ? value.getAll("images").filter((item): item is File => item instanceof File)
      : [];
    if (validateAttachments(files)) throw new Error("rqErrImages");
    const chatAccess = value.get("chatAccess");
    const visitorAccess = value.get("visitorAccess");
    const tourToken = value.get("tourToken");
    return {
      ...entry,
      contactForm: value.get("source")==="contact" && entry.type==="general",
      files,
      fromChat: value.get("fromChat") === "1",
      chatAccess: typeof chatAccess === "string" ? chatAccess.slice(0, 4096) : "",
      visitorAccess: typeof visitorAccess === "string" ? visitorAccess.slice(0, 4096) : "",
      language: raw["language"] === "ar" ? ("ar" as const) : ("en" as const),
      metricsOptOut: value.get("metrics") === "off",
      tourToken: typeof tourToken === "string" ? tourToken.slice(0, 4096) : "",
    };
  })
  .handler(async ({ data }): Promise<RequestResult> => {
    const telemetryStart = performance.now();
    const { recordTelemetry } = await import("./telemetry.server");
    if (data.website) return { ok: false, message: "rqErrRejected" };
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    if (Number(request.headers.get("content-length") ?? "0") > 10 * 1024 * 1024)
      return { ok: false, message: "rqErrTooLarge" };
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none")
      return { ok: false, message: "rqErrCrossSite" };
    const { consumeLimits, clientIp, noteBudgetUsage } = await import("./rate-limit.server");
    const { REQUEST_GLOBAL_BUCKET, REQUEST_GLOBAL_DAY_LIMIT, ipEmailSubject } =
      await import("./ai-budget.shared");
    const ip = clientIp(request);
    const allowed = await consumeLimits([
      { bucket: "request:ip", subject: ip, limit: 5, windowSeconds: 3600 },
      // Typed email is unverified: keyed with the IP so others cannot exhaust it.
      {
        bucket: "request:email-day",
        subject: ipEmailSubject(ip, data.email),
        limit: 5,
        windowSeconds: 86_400,
      },
      {
        bucket: REQUEST_GLOBAL_BUCKET,
        subject: "all",
        limit: REQUEST_GLOBAL_DAY_LIMIT,
        windowSeconds: 86_400,
      },
    ]);
    if (!allowed) return { ok: false, message: "rqErrBusy" };
    await noteBudgetUsage(
      REQUEST_GLOBAL_BUCKET,
      REQUEST_GLOBAL_DAY_LIMIT,
      "request.global_limit_80",
    );
    let identity: import("./request-identity.server").RequestIdentity;
    try {
      identity = await (
        await import("./request-identity.server")
      ).resolveRequestIdentity(data.visitorAccess);
    } catch {
      // An expired or unverifiable guest pass (e.g. after a signing-secret change) must not
      // block an ordinary request: retry without it so it is saved untracked. Chat-linked
      // requests still require a valid pass, and an invalid account session still rejects.
      if (data.fromChat || !data.visitorAccess) return { ok: false, message: "rqErrRejected" };
      try {
        identity = await (await import("./request-identity.server")).resolveRequestIdentity("");
      } catch {
        return { ok: false, message: "rqErrRejected" };
      }
    }
    if (identity?.kind === "guest" && identity.email !== data.email) {
      // Chat-linked requests must match the chat email; other forms are saved
      // without the guest tracking link instead of being rejected.
      if (data.fromChat) return { ok: false, message: "rqErrChatEmail" };
      identity = null;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!identity && data.contactForm && !data.visitorAccess) identity=(await import("./contact-owner.server")).contactOwner(true);
    // Idempotent retry: a resend with the same request UUID returns the stored receipt only
    // to its proven owner (verified account or signed guest linked to that request). The
    // UUID and typed email are never authority, and every refusal looks the same.
    {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("suggestion_requests")
        .select("id, created_at")
        .eq("id", data.requestId)
        .maybeSingle();
      if (existingError) return { ok: false, message: "rqErrSave" };
      if (existing) {
        const replay = await ownedReplay(supabaseAdmin, existing, identity);
        return replay ?? { ok: false, message: "rqErrReceipt" };
      }
    }
    const { liveCatalog } = await import("./recommend.server");
    let linkedChatId: string | undefined;
    if (data.fromChat) {
      const { verifyVisitor, openChatFor } = await import("./live-chat.server");
      const visitor = await verifyVisitor({ supabase: null, userId: "" }, data.chatAccess);
      if (!visitor) return { ok: false, message: "rqErrRejected" };
      if (visitor.email.trim().toLowerCase() !== data.email)
        return { ok: false, message: "rqErrChatEmail" };
      try {
        const chat = await openChatFor(supabaseAdmin, { ...visitor, language: "en" });
        linkedChatId = chat.id;
      } catch {
        return { ok: false, message: "rqErrSave" };
      }
    }
    const attachments: RequestAttachment[] = [];
    let saved = false;
    let tracking: "account" | "guest" | "none" = "none";
    try {
      const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { count, error: countError } = await supabaseAdmin
        .from("suggestion_requests")
        .select("id", { count: "exact", head: true })
        .eq("email", data.email)
        .gte("created_at", since);
      if (countError) throw countError;
      if ((count ?? 0) > 0) return { ok: false, message: "rqErrRecent" };
      // Lookup failure throws into the catch below, so unknown ids are never accepted.
      const tools: string[] = "tools" in data.details && Array.isArray(data.details.tools) ? data.details.tools : [];
      const needsCatalog = Boolean(
        data.productId || tools.length || (data.allowAnalysis && data.recommendation),
      );
      const catalog = needsCatalog ? await liveCatalog() : [];
      if (data.productId && !catalog.some((product) => product.id === data.productId))
        return { ok: false, message: "rqErrProduct" };
      if (tools.some((tool) => !catalog.some((product) => product.id === tool && !product.comingSoon && product.servicesEnabled !== false)))
        return { ok: false, message: "rqErrProduct" };
      for (const file of data.files) {
        const original = new Uint8Array(await file.arrayBuffer());
        if (!matchesImageSignature(original, file.type)) throw new Error("invalid image");
        const size = imageDimensions(original, file.type);
        if (
          !size ||
          size.width < 1 ||
          size.height < 1 ||
          size.width > MAX_IMAGE_SIDE ||
          size.height > MAX_IMAGE_SIDE
        )
          throw new Error("invalid image");
        const bytes =
          file.type === "image/jpeg"
            ? stripJpegMetadata(original)
            : file.type === "image/webp"
              ? stripWebpMetadata(original)
              : original;
        const extension =
          file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
        const path = `${data.requestId}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabaseAdmin.storage
          .from("request-attachments")
          .upload(path, bytes, { contentType: file.type, upsert: false });
        if (error) throw error;
        attachments.push({
          path,
          name: file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 150),
          size: bytes.length,
        });
      }
      // The signed guest identity selects the current open chat, never typed email alone.
      const details: Record<string, unknown> = {
        ...data.details,
        ...(linkedChatId ? { chatId: linkedChatId } : {}),
      };
      const { error } = await supabaseAdmin.from("suggestion_requests").insert({
        id: data.requestId,
        request_type: data.type,
        name: data.name,
        email: data.email,
        company: data.company || null,
        phone: data.phone,
        need: data.need,
        product_id: data.productId || null,
        urgency: data.urgency || null,
        impact: data.impact,
        recommendation:
          data.allowAnalysis && data.recommendation
            ? (sanitizeRecommendation(data.recommendation, catalog) as never)
            : null,
        attachments,
        details: details as never,
      });
      if (error?.code === "23505") {
        // A concurrent duplicate with the same UUID won the insert: same ownership rule.
        const { data: winner } = await supabaseAdmin
          .from("suggestion_requests")
          .select("id, created_at")
          .eq("id", data.requestId)
          .maybeSingle();
        const replay = winner ? await ownedReplay(supabaseAdmin, winner, identity) : null;
        return replay ?? { ok: false, message: "rqErrReceipt" };
      }
      if (error) throw error;
      saved = true;
      if (identity) {
        const ownership = await supabaseAdmin.from("request_identities").insert({
          request_id: data.requestId,
          visitor_id: identity.kind === "guest" ? identity.id : null,
          account_id: identity.kind === "account" ? identity.id : null,
        });
        // A receipt remains truthful even if the optional tracking link cannot be stored.
        if (!ownership.error) tracking = identity.kind;
      }
      // Read the stored receipt back before reporting success.
      const { data: receipt, error: receiptError } = await supabaseAdmin
        .from("suggestion_requests")
        .select("id, created_at")
        .eq("id", data.requestId)
        .single();
      if (receiptError || !receipt) {
        await recordTelemetry("request", "failure", telemetryStart, "receipt");
        return { ok: false, message: "rqErrReceipt" };
      }
      // Everything after the read-back receipt is optional: a failure here must never turn a
      // committed request into a false error (which would also invite a duplicate resend).
      const optional = async (step: () => Promise<unknown>) => {
        try {
          await step();
        } catch {
          /* best effort */
        }
      };
      if (data.type === "support" && data.tourToken) {
        await optional(async () => {
          const { recordTourSupport } = await import("./archy-tour-visits.server");
          await recordTourSupport(supabaseAdmin, data.tourToken, receipt.id);
        });
      }
      await optional(async () => {
        const { notifyContactSubmission } = await import("./contact-notify.server");
        await notifyContactSubmission(receipt.id, `request.${data.type}`);
      });
      // Count only a real database-read receipt; the request UUID makes retries idempotent.
      // Skipped for visitors who opted out or whose browser sends GPC/DNT.
      await optional(async () => {
        const { privacySignalInHeaders } = await import("./journey.shared");
        if (!data.metricsOptOut && !privacySignalInHeaders(request.headers)) {
          const { recordJourney } = await import("./journey.server");
          await recordJourney("request_completed", data.language, receipt.id);
        }
      });
      await optional(() => recordTelemetry("request", "success", telemetryStart));
      return { ok: true, id: receipt.id, createdAt: receipt.created_at, tracking };
    } catch {
      await recordTelemetry("request", "failure", telemetryStart, "storage");
      return { ok: false, message: "rqErrSave" };
    } finally {
      if (!saved && attachments.length)
        await supabaseAdmin.storage
          .from("request-attachments")
          .remove(attachments.map((item) => item.path));
    }
  });

async function ownedReplay(
  admin: typeof import("@/integrations/supabase/client.server").supabaseAdmin,
  existing: { id: string; created_at: string },
  identity: import("./request-identity.server").RequestIdentity,
): Promise<RequestResult | null> {
  if (!identity) return null;
  const { data: link, error } = await admin
    .from("request_identities")
    .select("visitor_id, account_id")
    .eq("request_id", existing.id)
    .maybeSingle();
  if (error || !link) return null;
  const owner = identity.kind === "account" ? link.account_id : link.visitor_id;
  if (owner !== identity.id) return null;
  return { ok: true, id: existing.id, createdAt: existing.created_at, tracking: identity.kind };
}
