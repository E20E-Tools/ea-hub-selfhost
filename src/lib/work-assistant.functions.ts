import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { policySchema, inputSchema } from "./work-assistant";
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
export const workCompletion = createServerFn({ method: "POST" })
  .inputValidator(inputSchema)
  .handler(async ({ data }) => {
    if (data.feature === "issue") throw Error("Admin required");
    return (await import("./work-assistant.server")).generateWork(data);
  });
export const issueCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(inputSchema)
  .handler(async ({ data, context }) => {
    await (await import("./admin-guard.server")).requireAdmin(context);
    if (data.feature !== "issue") throw Error("Invalid feature");
    return (await import("./work-assistant.server")).generateWork(data);
  });
