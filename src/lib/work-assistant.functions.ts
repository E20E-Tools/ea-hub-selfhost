import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  policySchema,
  inputSchema,
  visitorInputSchema,
} from "./work-assistant";
export const workPolicy = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./work-assistant.server")).readPolicy(),
);
export const saveWorkPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(policySchema)
  .handler(async ({ context, data }) => {
    await (await import("./admin-guard.server")).requireAdmin(context);
    await (await import("./work-assistant.server")).writePolicy(data);
    return true;
  });
/**
 * Visitor completions spend the saved OpenAI key, so they need the same admission as Archy
 * chat: a same-site request, the assistant feature switched on, a signed guest pass, and a
 * site-wide daily budget (on top of the per-IP hourly quota in generateWork).
 */
export const workCompletion = createServerFn({ method: "POST" })
  .inputValidator(visitorInputSchema)
  .handler(async ({ data }) => {
    const { access, ...input } = data;
    if (input.feature === "issue") throw Error("Admin required");
    const { getRequest } = await import("@tanstack/react-start/server");
    const site = getRequest().headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none")
      throw Error("Cross-site request refused");
    const { serverFeatureEnabled } = await import("./site-features.server");
    if (!(await serverFeatureEnabled("assistant")))
      throw Error("Feature disabled");
    const { verifyAccessToken, gateSecrets } =
      await import("./assistant-gate.server");
    const pass = access
      ? await verifyAccessToken(await gateSecrets(), access)
      : null;
    if (!pass?.visitorId) throw Error("Registration required");
    const { consumeLimits } = await import("./rate-limit.server");
    const { WORK_AI_GLOBAL_BUCKET, WORK_AI_GLOBAL_DAY_LIMIT } =
      await import("./ai-budget.shared");
    if (
      !(await consumeLimits([
        {
          bucket: WORK_AI_GLOBAL_BUCKET,
          subject: "all",
          limit: WORK_AI_GLOBAL_DAY_LIMIT,
          windowSeconds: 86_400,
        },
      ]))
    )
      throw Error("Quota unavailable");
    return (await import("./work-assistant.server")).generateWork(input);
  });
export const issueCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(inputSchema)
  .handler(async ({ data, context }) => {
    await (await import("./admin-guard.server")).requireAdmin(context);
    if (data.feature !== "issue") throw Error("Invalid feature");
    return (await import("./work-assistant.server")).generateWork(data);
  });
