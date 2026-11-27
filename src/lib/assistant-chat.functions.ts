import { archyPage, contextForAnswer, type ArchyPage } from "./archy-page";
import { createServerFn } from "@tanstack/react-start";
import {
  CHAT_GLOBAL_BUCKET,
  CHAT_GLOBAL_DAY_LIMIT,
  ipEmailSubject,
} from "./ai-budget.shared";
import {
  isReplyLanguage,
  type Recommendation,
  type ReplyLanguage,
} from "./recommend.shared";
import { assistantRegistrationSchema } from "./assistant-registration";

export type AssistantTurn = { role: "user" | "assistant"; content: string };
/** `code: "gate"` means the access token is missing, expired or owned by another account. */
export type AssistantResult =
  | { ok: true; messageId?: string; reply: Recommendation }
  | { ok: false; message: string; code?: "gate" };

const TEXT: Record<
  ReplyLanguage,
  {
    limit: string;
    refused: string;
    failed: string;
    gate: string;
    suspended: string;
  }
> = {
  ar: {
    limit: "وصلت إلى الحد المؤقت للرسائل. حاول بعد بضع دقائق.",
    refused: "غير مسموح من خارج الموقع.",
    failed: "تعذّر الرد الآن. حاول مرة أخرى.",
    gate: "سجّل بياناتك أولًا لاستخدام مرشد الأدوات.",
    suspended: "أُوقفت المحادثة مؤقتًا بسبب نشاط غير معتاد. حاول بعد 24 ساعة.",
  },
  en: {
    limit:
      "You have reached the temporary message limit. Try again in a few minutes.",
    refused: "Not allowed from outside the site.",
    failed: "The reply could not be sent right now. Try again.",
    gate: "Please register your details before using the tool guide.",
    suspended:
      "Chat was suspended due to unusual activity. Try again in 24 hours.",
  },
};

export const CHAT_LIMIT_MESSAGE = TEXT.ar.limit;

export function validateTurns(value: unknown): {
  turns: AssistantTurn[];
  context?: ArchyPage;
  language: ReplyLanguage;
  access: string;
} {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const raw = Array.isArray(source["turns"]) ? source["turns"] : [];
  if (raw.length === 0) throw new Error("لا توجد رسالة.");
  // Only the newest visitor turn is accepted. Earlier context comes from the server-stored
  // conversation, and client-supplied "assistant" turns could forge context.
  const entry = (raw[raw.length - 1] ?? {}) as Record<string, unknown>;
  const content =
    entry["role"] === "user" && typeof entry["content"] === "string"
      ? entry["content"].trim().slice(0, 1200)
      : "";
  if (!content) throw new Error("اكتب رسالتك أولًا.");
  const turns: AssistantTurn[] = [{ role: "user", content }];
  const language: ReplyLanguage = isReplyLanguage(source["language"])
    ? source["language"]
    : "ar";
  const access = typeof source["access"] === "string" ? source["access"] : "";
  const context = archyPage(source["context"]);
  return { turns, language, access, ...(context && { context }) };
}

export const sendAssistantMessage = createServerFn({ method: "POST" })
  .inputValidator(validateTurns)
  .handler(async ({ data }): Promise<AssistantResult> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const text = TEXT[data.language];
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none")
      return { ok: false, message: text.refused };
    const { serverFeatureEnabled } = await import("./site-features.server");
    if (!(await serverFeatureEnabled("assistant")))
      return { ok: false, message: text.failed };
    const { verifyAccessToken, gateSecrets } =
      await import("./assistant-gate.server");
    const access = await verifyAccessToken(await gateSecrets(), data.access);
    if (!access) return { ok: false, message: text.gate, code: "gate" };
    // Guest identity is minted only after the signed math check, never derived from typed email.
    if (!access.visitorId)
      return { ok: false, message: text.gate, code: "gate" };
    const email = access.email.trim().toLowerCase();
    const { checkLimits, clientIp, hashSubject, noteBudgetUsage } =
      await import("./rate-limit.server");
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    // Ban key combines IP and email so nobody can lock out another visitor by email alone.
    const banKey = `${clientIp(request)}|${access.email}`;
    // Per-visitor quotas use the same IP + email pairing: the email in the pass is typed, not verified.
    const userKey = ipEmailSubject(clientIp(request), access.email);
    const subject = await hashSubject(banKey);
    // Suspension: an earlier bot-suspicion ban blocks this visitor for 24 hours.
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const bans = await supabaseAdmin
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("bucket", "chat:ban")
      .eq("subject", subject)
      .gte("created_at", since);
    // Fail closed (without banning) when the ban store cannot be read.
    if (bans.error || bans.count === null)
      return { ok: false, message: text.failed };
    if (bans.count > 0) return { ok: false, message: text.suspended };
    // Bot suspicion: more than 5 messages within 30 seconds is not human-paced.
    const pace = await checkLimits([
      { bucket: "chat:burst", subject: banKey, limit: 5, windowSeconds: 30 },
    ]);
    if (pace === "error") return { ok: false, message: text.failed };
    if (pace === "limited") {
      await supabaseAdmin
        .from("rate_limit_events")
        .insert({ bucket: "chat:ban", subject });
      return { ok: false, message: text.suspended };
    }
    const quota = await checkLimits([
      {
        bucket: "chat:ip",
        subject: clientIp(request),
        limit: 20,
        windowSeconds: 600,
      },
      {
        bucket: "chat:ip-day",
        subject: clientIp(request),
        limit: 40,
        windowSeconds: 86_400,
      },
      {
        bucket: "chat:user-10m",
        subject: userKey,
        limit: 5,
        windowSeconds: 600,
      },
      {
        bucket: "chat:user-hour",
        subject: userKey,
        limit: 10,
        windowSeconds: 3600,
      },
      {
        bucket: "chat:user-day",
        subject: userKey,
        limit: 30,
        windowSeconds: 86_400,
      },
      {
        bucket: CHAT_GLOBAL_BUCKET,
        subject: "all",
        limit: CHAT_GLOBAL_DAY_LIMIT,
        windowSeconds: 86_400,
      },
    ]);
    if (quota === "error") return { ok: false, message: text.failed };
    if (quota === "limited") return { ok: false, message: text.limit };
    await noteBudgetUsage(
      CHAT_GLOBAL_BUCKET,
      CHAT_GLOBAL_DAY_LIMIT,
      "ai.chat_global_limit_80",
    );
    try {
      // Context is the visitor's current open conversation as stored on the server
      // (visitor + AI messages, oldest first, at most 12), then the new visitor turn.
      const live = await import("./live-chat.server");
      const history = await live.openChatContext(
        supabaseAdmin,
        access.visitorId,
      );
      const { runAssistantChat } = await import("./recommend.server");
      const answerStarted = Date.now();
      const {
        answer: reply,
        source,
        model,
      } = await runAssistantChat(
        [
          ...history,
          ...data.turns.map((turn) =>
            data.context
              ? {
                  ...turn,
                  content:
                    turn.content +
                    "\n[" +
                    contextForAnswer(data.context, data.language === "ar") +
                    "]",
                }
              : turn,
          ),
        ],
        data.language,
        true,
      );
      let messageId: string | undefined;
      // Owner asked to keep every chat (visitor prompt + AI reply) for three months so
      // admins can read it and continue with a person.
      try {
        const chat = await live.openChatFor(supabaseAdmin, {
          id: access.visitorId,
          email,
          name: access.name,
          language: data.language,
        });
        const last = data.turns[data.turns.length - 1]?.content ?? "";
        const promptId = crypto.randomUUID(),
          id = crypto.randomUUID();
        await live.appendMessages(supabaseAdmin, chat.id, [
          { id: promptId, sender: "visitor", body: last },
          {
            id,
            sender: "ai",
            body: reply.summary,
            prompt_id: promptId,
            reply_ms: Date.now() - answerStarted,
            reply_source: source,
            reply_model: model,
            reply_language: /\p{Script=Arabic}/u.test(last)
              ? "ar"
              : /[a-z]/i.test(last)
                ? "en"
                : data.language,
          },
        ]);
        messageId = id;
      } catch (error) {
        console.error("live chat save failed");
      }
      return { ok: true, reply, ...(messageId ? { messageId } : {}) };
    } catch (error) {
      console.error("assistant chat failed");
      return { ok: false, message: text.failed };
    }
  });

export type AssistantRegistration =
  | { ok: true; token: string; name: string; exp: number }
  | { ok: false; message: string; retryAt?: number };

export function validateRegistration(value: unknown): {
  name: string;
  email: string;
  question: string;
  token: string;
  answer: string;
  turnstile: string;
  website: string;
  language: ReplyLanguage;
} {
  return assistantRegistrationSchema.parse(value);
}

/**
 * Per-IP hourly ceilings for the registration gate. Generous on purpose: many visitors can
 * share one corporate IP, while a script that re-mints browser cookies is still bounded.
 */
export const CHALLENGE_IP_HOURLY_LIMIT = 60;
export const REGISTRATION_IP_HOURLY_LIMIT = 20;

export type AssistantChallenge =
  | { mode: "math"; a: number; b: number; token: string }
  | { mode: "turnstile"; siteKey: string; token: "" };

/**
 * Human check for the registration form: Cloudflare Turnstile when both Turnstile secrets
 * are set, otherwise the signed (single-use) arithmetic question.
 */
export const getAssistantChallenge = createServerFn({ method: "GET" }).handler(
  async (): Promise<AssistantChallenge> => {
    const { serverFeatureEnabled } = await import("./site-features.server");
    if (!(await serverFeatureEnabled("assistant")))
      throw new Error(TEXT.ar.failed);
    const { registrationBrowser } = await import("./assistant-gate.server");
    const { setResponseHeader, getRequest } =
      await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    // Each challenge mints a fresh registration cookie, so the per-browser registration quota
    // alone can be reset at will; the client IP bounds how many a script can collect.
    const { consumeLimits, clientIp } = await import("./rate-limit.server");
    if (
      !(await consumeLimits([
        {
          bucket: "assistant-challenge:ip",
          subject: clientIp(getRequest()),
          limit: CHALLENGE_IP_HOURLY_LIMIT,
          windowSeconds: 3600,
        },
      ]))
    )
      throw new Error(TEXT.ar.limit);
    await registrationBrowser(true);
    const turnstile = (await import("./turnstile.server")).turnstileConfig();
    if (turnstile)
      return { mode: "turnstile", siteKey: turnstile.siteKey, token: "" };
    const { issueChallenge, gateSecret } =
      await import("./assistant-gate.server");
    return { mode: "math", ...(await issueChallenge(await gateSecret())) };
  },
);

/** Display name for visitors who start without leaving their name. */
export function guestName(language: ReplyLanguage): string {
  return language === "ar" ? "زائر" : "Visitor";
}

/** Validity of the arithmetic token; a used token is refused until it would have expired. */
export const CHALLENGE_REUSE_WINDOW_SECONDS = 10 * 60;

/** Registers a visitor after human verification, stores the record, and grants 24h chat access. */
export const registerAssistantVisitor = createServerFn({ method: "POST" })
  .inputValidator(validateRegistration)
  .handler(async ({ data }): Promise<AssistantRegistration> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const text = TEXT[data.language];
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none")
      return { ok: false, message: text.refused };
    // Honeypot: real visitors never see or fill this field.
    if (data.website) return { ok: false, message: text.failed };
    const { serverFeatureEnabled } = await import("./site-features.server");
    if (!(await serverFeatureEnabled("assistant")))
      return { ok: false, message: text.failed };
    const { clientIp, hashSubject, consumeLimits } =
      await import("./rate-limit.server");
    // Per-IP ceiling on top of the per-browser quota: the browser cookie is free to re-mint,
    // so without this a script could register without limit (always when Turnstile is off).
    if (
      !(await consumeLimits([
        {
          bucket: "assistant-register:ip",
          subject: clientIp(request),
          limit: REGISTRATION_IP_HOURLY_LIMIT,
          windowSeconds: 3600,
        },
      ]))
    )
      return { ok: false, message: text.limit };
    const gate = await import("./assistant-gate.server");
    const browser = await gate.registrationBrowser(false);
    if (!browser)
      return {
        ok: false,
        message:
          data.language === "ar"
            ? "اسمح بملفات تعريف الارتباط وأعد المحاولة."
            : "Allow cookies and try again.",
      };
    const turnstileServer = await import("./turnstile.server");
    const turnstile = turnstileServer.turnstileConfig();
    if (turnstile) {
      // Cloudflare enforces single use of its own tokens.
      if (
        !(await turnstileServer.verifyTurnstile(
          turnstile,
          data.turnstile,
          clientIp(request),
        ))
      )
        return { ok: false, message: text.failed };
    } else {
      const secrets = await gate.gateSecrets();
      if (!(await gate.challengeSigned(secrets, data.token)))
        return { ok: false, message: text.failed };
      // Single use: the token's fingerprint is recorded on first use (right or wrong answer),
      // so a solved or guessed question can never be replayed within its validity.
      const { checkLimits } = await import("./rate-limit.server");
      const first = await checkLimits([
        {
          bucket: "assistant-challenge:used",
          subject: data.token,
          limit: 1,
          windowSeconds: CHALLENGE_REUSE_WINDOW_SECONDS,
        },
      ]);
      if (first !== "ok") return { ok: false, message: text.failed };
      if (!(await gate.verifyChallenge(secrets, data.token, data.answer)))
        return { ok: false, message: text.failed };
    }
    const secret = await gate.gateSecret();
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: retryAt, error } = await supabaseAdmin.rpc(
      "register_archy_guest",
      {
        _subject: await hashSubject(browser),
        _name: data.name || guestName(data.language),
        _email: data.email,
        _question: data.question,
      },
    );
    if (error) {
      console.error("assistant registration failed", error.code);
      return { ok: false, message: text.failed };
    }
    if (typeof retryAt !== "number") return { ok: false, message: text.failed };
    if (retryAt > 0) return { ok: false, message: text.limit, retryAt };
    const name = data.name || guestName(data.language);
    const access = await gate.issueAccessToken(
      secret,
      name,
      data.email,
      Date.now(),
      crypto.randomUUID(),
    );
    return { ok: true, token: access.token, name, exp: access.exp };
  });
