import { safeAiError } from "./ai-settings.shared";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  aiBaseUrlProblem,
  isOfficialGroq,
  keyMoveProblem,
} from "./ai-settings.shared";

export type AiSpeed = "fast" | "balanced" | "thorough";
export type AiSettingsView = {
  registrationLimit: number;
  registrationWaitMinutes: number;
  baseUrl: string;
  model: string;
  speed: AiSpeed;
  keyHint: string;
  keySource: "saved" | "server" | "none";
  localSemantic: boolean;
  activeEngine: "local" | "remote";
  localAvailable: boolean;
  keyChangedAt: string | null;
  updatedAt: string | null;
  updatedBy: string;
};

async function verify(context: import("./admin-guard.server").GuardContext) {
  const { requireAdmin } = await import("./admin-guard.server");
  await requireAdmin(context);
}

export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiSettingsView> => {
    await verify(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ai_assistant_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error("AI settings load failed");
    const { encryptSecret, openSecret } = await import("./server-keys.server");
    const opened = await openSecret(data?.api_key);
    // Re-encrypt with the current key on read: legacy plain text, or a value only the
    // previous root (before APP_ENCRYPTION_KEY) could open.
    if (data?.api_key && opened.rewrap && opened.plain) {
      await supabaseAdmin
        .from("ai_assistant_settings")
        .update({ api_key: await encryptSecret(opened.plain) })
        .eq("id", true)
        .eq("api_key", data.api_key);
    }
    const saved = opened.plain;
    const baseUrl = data?.base_url ?? "https://api.groq.com/openai/v1";
    const env = isOfficialGroq(baseUrl)
      ? (process.env["GROQ_API_KEY"] ?? "")
      : "";
    const key = saved || env;
    return {
      registrationLimit: data?.registration_limit ?? 5,
      registrationWaitMinutes: data?.registration_wait_minutes ?? 60,
      baseUrl,
      model: data?.model ?? "openai/gpt-oss-120b",
      speed: (data?.speed as AiSpeed) ?? "balanced",
      keyHint: key ? "••••" : "",
      keySource: saved ? "saved" : env ? "server" : "none",
      activeEngine:
        data?.chat_engine ??
        (!key && process.env["EA_LOCAL_SEMANTIC"] ? "local" : "remote"),
      localAvailable: Boolean(
        process.env["EA_LOCAL_SEMANTIC"]?.startsWith("file:"),
      ),
      localSemantic:
        data?.chat_engine === "local" ||
        (!data?.chat_engine &&
          !key &&
          Boolean(process.env["EA_LOCAL_SEMANTIC"]?.startsWith("file:"))),
      keyChangedAt: data?.key_changed_at ?? null,
      updatedAt: data?.updated_at ?? null,
      updatedBy: data?.updated_by ?? "",
    };
  });

export const saveRegistrationPolicy = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown) => z.object({
    limit:z.number().int().min(1).max(100), minutes:z.number().int().min(1).max(1440)
  }).parse(input))
  .handler(async ({context,data})=>{
    await verify(context);
    const {supabaseAdmin} = await import("@/integrations/supabase/client.server");
    const {actorEmail} = await import("./admin-guard.server");
    const {error} = await supabaseAdmin.from("ai_assistant_settings").upsert({
      id:true, registration_limit:data.limit, registration_wait_minutes:data.minutes,
      updated_at:new Date().toISOString(), updated_by:actorEmail(context.claims)
    });
    if(error) throw Error("Registration policy could not be saved");
    await supabaseAdmin.from("admin_activity").insert({actor_id:context.userId,actor_email:actorEmail(context.claims),
      action:"ai.registration-policy",target:data.limit+" / "+data.minutes+" min"});
    return {ok:true};
  });

export const aiConfigSchema = z
  .object({
    baseUrl: z
      .string()
      .trim()
      .max(300)
      .superRefine((value, ctx) => {
        const problem = aiBaseUrlProblem(value);
        if (problem) ctx.addIssue({ code: "custom", message: problem });
      }),
    model: z.string().trim().min(2).max(120),
    speed: z.enum(["fast", "balanced", "thorough"]),
    apiKey: z.string().trim().max(400),
    removeKey: z.boolean(),
  })
  .refine((data) => !(data.removeKey && data.apiKey), { message: "errSaveAi" });

export const saveAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => aiConfigSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      await verify(context);
      const email = (context.claims as { email?: unknown } | null)?.email;
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const { encryptSecret } = await import("./server-keys.server");
      const { data: current, error: currentError } = await supabaseAdmin
        .from("ai_assistant_settings")
        .select("api_key, base_url")
        .eq("id", true)
        .maybeSingle();
      if (currentError) return { ok: false, message: "errSaveAi" };
      // A non-Groq service never receives the server key, so it needs its own saved key.
      if (
        !isOfficialGroq(data.baseUrl) &&
        !data.apiKey &&
        (data.removeKey || !current?.api_key)
      )
        return { ok: false, message: "errAiNeedsKey" };
      // A saved key is never silently forwarded to a different host.
      if (
        keyMoveProblem({
          previousBaseUrl: current?.base_url,
          nextBaseUrl: data.baseUrl,
          hasSavedKey: Boolean(current?.api_key),
          newKey: data.apiKey,
          removeKey: data.removeKey,
        })
      )
        return { ok: false, message: "errAiKeyOrigin" };
      if (data.apiKey && new URL(data.baseUrl).origin === "https://api.openai.com") {
        const check = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${data.apiKey}` },
          redirect: "error",
          signal: AbortSignal.timeout(12000),
        }).catch(() => null);
        const status = check?.status;
        await check?.body?.cancel().catch(() => undefined);
        if (status === 401) return { ok: false, message: "errAiOpenAiKey" };
        // A scoped key may allow chat without granting permission to list models.
        if (status !== 403 && !check?.ok)
          return { ok: false, message: "errAiKeyCheck" };
      }
      const now = new Date().toISOString();
      const row: Record<string, unknown> = {
        id: true,
        base_url: data.baseUrl,
        model: data.model,
        speed: data.speed,
        updated_at: now,
        updated_by: typeof email === "string" ? email : "",
      };
      if (data.removeKey)
        Object.assign(row, { api_key: null, key_changed_at: now });
      else if (data.apiKey)
        Object.assign(row, {
          api_key: await encryptSecret(data.apiKey),
          key_changed_at: now,
        });
      const { error } = await supabaseAdmin
        .from("ai_assistant_settings")
        .upsert(row as never);
      if (error) return { ok: false, message: "errSaveAi" };
      await supabaseAdmin.from("admin_activity").insert({
        actor_id: context.userId,
        actor_email: typeof email === "string" ? email : "",
        action: "ai.settings",
        target: `${data.baseUrl} ${data.model}`.slice(0, 200),
      });
      return { ok: true };
    },
  );

/** Imports the live ChatGPT model list using the saved OpenAI key (never leaves the server). */
export const listOpenAiModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<
      { ok: true; models: string[] } | { ok: false; message: string }
    > => {
      await verify(context);
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("ai_assistant_settings")
        .select("api_key, base_url")
        .eq("id", true)
        .maybeSingle();
      let host = "";
      try {
        host = new URL(data?.base_url ?? "").host;
      } catch {
        host = "";
      }
      if (host !== "api.openai.com" || !data?.api_key)
        return { ok: false, message: "errAiImportNeedsKey" };
      const { openSecret } = await import("./server-keys.server");
      const key = (await openSecret(data.api_key)).plain;
      if (!key) return { ok: false, message: "errAiImportNeedsKey" };
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        redirect: "manual",
      }).catch(() => null);
      if (!res || !res.ok) return { ok: false, message: "errAiImport" };
      const body = (await res.json().catch(() => null)) as {
        data?: { id?: unknown }[];
      } | null;
      const ids = (body?.data ?? [])
        .map((m) => m.id)
        .filter((x): x is string => typeof x === "string");
      const { pickOpenAiChatModels } = await import("./ai-settings.shared");
      return { ok: true, models: pickOpenAiChatModels(ids) };
    },
  );

export const testArchyChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      engine: z.enum(["local", "remote"]).optional(),
      language: z.enum(["ar", "en"]),
      turns: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(4000),
          }),
        )
        .min(1)
        .max(9)
        .refine((turns) => turns.at(-1)?.role === "user"),
    }),
  )
  .handler(async ({ data, context }) => {
    await verify(context);
    const { runAssistantChat } = await import("./recommend.server");
    const started=Date.now();
    const record=async(succeeded:boolean,source:string|null,model:string|null)=>{
      try{const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("archy_probe").upsert({engine:data.engine??"saved",succeeded,source,model,elapsed_ms:Date.now()-started,checked_at:new Date().toISOString()});}catch{/* Monitoring does not block a reply. */}
    };
    try {
      const { answer, source, model } = await runAssistantChat(
        data.turns,
        data.language,
        true,
        data.engine ?? "saved",
      );
      await record(true,source,model);
      return { ok: true as const, reply: answer.summary, source, model };
    } catch (error) {
      await record(false,null,null);
      return {
        ok: false as const,
        denied: safeAiError(error) === "provider failure status=401",
      };
    }
  });

export const applyChatEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ engine: z.enum(["local", "remote"]) }))
  .handler(async ({ data, context }) => {
    await verify(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    if (data.engine === "local") {
      if (!process.env["EA_LOCAL_SEMANTIC"]?.startsWith("file:"))
        throw Error("Local search unavailable");
    } else {
      const current = await supabaseAdmin
        .from("ai_assistant_settings")
        .select("api_key,base_url")
        .eq("id", true)
        .maybeSingle();
      if (current.error) throw Error("Settings unavailable");
      const base = current.data?.base_url ?? "https://api.groq.com/openai/v1";
      const { openSecret } = await import("./server-keys.server");
      if (
        aiBaseUrlProblem(base) ||
        !(
          (await openSecret(current.data?.api_key)).plain ||
          (isOfficialGroq(base) && process.env["GROQ_API_KEY"])
        )
      )
        throw Error("Provider unavailable");
    }
    const result = await supabaseAdmin.from("ai_assistant_settings").upsert(
      {
        id: true,
        chat_engine: data.engine,
        updated_at: new Date().toISOString(),
        updated_by:
          typeof context.claims.email === "string" ? context.claims.email : "",
      },
      { defaultToNull: false },
    );
    if (result.error) throw Error("Could not apply engine");
    return data.engine;
  });
