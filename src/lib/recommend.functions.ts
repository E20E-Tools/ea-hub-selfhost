import { createServerFn } from "@tanstack/react-start";
import {
  RECOMMEND_GLOBAL_BUCKET,
  RECOMMEND_GLOBAL_DAY_LIMIT,
} from "./ai-budget.shared";
import {
  isReplyLanguage,
  type Recommendation,
  type ReplyLanguage,
} from "./recommend.shared";

export type RecommendResult =
  { ok: true; recommendation: Recommendation } | { ok: false; message: string };

const TEXT: Record<ReplyLanguage, { limit: string; failed: string }> = {
  ar: {
    limit: "وصلت إلى الحد المؤقت للاقتراحات. حاول بعد بضع دقائق.",
    failed: "تعذّر توليد الاقتراحات الآن. حاول مرة أخرى.",
  },
  en: {
    limit:
      "You have reached the temporary limit for suggestions. Try again in a few minutes.",
    failed: "Suggestions could not be generated right now. Try again.",
  },
};

export const recommendTools = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => {
    const source =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    const need = typeof source["need"] === "string" ? source["need"] : "";
    if (need.trim().length < 8) {
      throw new Error("اكتب وصفًا أوضح لاحتياجك (8 أحرف على الأقل).");
    }
    const language: ReplyLanguage = isReplyLanguage(source["language"])
      ? source["language"]
      : "ar";
    return { need: need.trim().slice(0, 1200), language };
  })
  .handler(async ({ data }): Promise<RecommendResult> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { guardRecommendation } = await import("./recommend-guard.server");
    const request = getRequest();
    const text = TEXT[data.language];
    const rejection = guardRecommendation(request);
    if (rejection)
      return {
        ok: false,
        message: data.language === "en" ? text.limit : rejection,
      };
    const { serverFeatureEnabled } = await import("./site-features.server");
    if (!(await serverFeatureEnabled("recommendations")))
      return { ok: false, message: text.failed };
    const { consumeLimits, clientIp } = await import("./rate-limit.server");
    const allowed = await consumeLimits([
      {
        bucket: "ai:ip",
        subject: clientIp(request),
        limit: 4,
        windowSeconds: 600,
      },
      {
        bucket: RECOMMEND_GLOBAL_BUCKET,
        subject: "all",
        limit: RECOMMEND_GLOBAL_DAY_LIMIT,
        windowSeconds: 86_400,
      },
    ]);
    if (!allowed) return { ok: false, message: text.limit };
    try {
      const { recommendProducts } = await import("./recommend.server");
      return {
        ok: true,
        recommendation: await recommendProducts(data.need, data.language),
      };
    } catch (error) {
      console.error(
        "recommendation failed",
        error instanceof Error ? error.name : "unknown",
      );
      return { ok: false, message: text.failed };
    }
  });
