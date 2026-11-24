export const OFFICIAL_GROQ_HOST = "api.groq.com";
/** Exact provider-controlled hosts; arbitrary customer DNS is not an egress boundary. */
export const TRUSTED_AI_HOSTS = [
  "api.groq.com",
  "api.openai.com",
  "openrouter.ai",
  "api.mistral.ai",
  "api.together.xyz",
  "api.deepseek.com",
] as const;
export const AI_URL_RULE =
  "رابط https فقط لخدمة عامة؛ تُرفض العناوين المحلية والداخلية وعناوين IP المباشرة. مفتاح الخادم يُرسل إلى api.groq.com فقط، وأي خدمة أخرى تحتاج مفتاحًا محفوظًا هنا.";

/** Returns an error message, or null when the base URL is a safe public https endpoint. */
export function aiBaseUrlProblem(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "رابط الخدمة غير صحيح.";
  }
  if (url.protocol !== "https:") return "يجب أن يبدأ الرابط بـ https.";
  if (url.username || url.password) return "لا يُسمح ببيانات دخول داخل الرابط.";
  if (url.search || url.hash || value.includes("#") || value.includes("?"))
    return "لا يُسمح بمعاملات استعلام أو # داخل الرابط.";
  if (url.port && url.port !== "443") return "يُسمح بالمنفذ القياسي 443 فقط.";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return "لا يُسمح بالعناوين المحلية.";
  }
  if (host.includes(":") || /^\d+(\.\d+){0,3}$/.test(host) || /^0x/i.test(host))
    return "لا يُسمح بعناوين IP المباشرة.";
  if (!host.includes(".")) return "اكتب اسم نطاق كاملًا.";
  if (!(TRUSTED_AI_HOSTS as readonly string[]).includes(host))
    return "هذه الوجهة ليست ضمن مزودي الخدمة الموثوقين المسموحين.";
  return null;
}

/** Origin of a base URL, or "" when it cannot be parsed. */
export function aiOrigin(value: string | null | undefined): string {
  try {
    return value ? new URL(value).origin.toLowerCase() : "";
  } catch {
    return "";
  }
}

/**
 * A saved key belongs to the host it was saved for. Moving to a different origin without
 * typing a replacement (or removing the key) would silently send it elsewhere.
 */
export function keyMoveProblem(input: {
  previousBaseUrl: string | null | undefined;
  nextBaseUrl: string;
  hasSavedKey: boolean;
  newKey: string;
  removeKey: boolean;
}): boolean {
  if (!input.hasSavedKey || input.newKey || input.removeKey) return false;
  const before = aiOrigin(
    input.previousBaseUrl ?? "https://api.groq.com/openai/v1",
  );
  return before !== aiOrigin(input.nextBaseUrl);
}

export const AI_REQUEST_TIMEOUT_MS = 45_000;

/** Provider-controlled errors may echo credentials or prompts: log only numeric HTTP status. */
export function safeAiError(error: unknown): string {
  const status =
    error && typeof error === "object" && "statusCode" in error
      ? error.statusCode
      : null;
  return typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
    ? `provider failure status=${status}`
    : "provider failure";
}

/**
 * Fetch for the AI provider: refuses redirects, only talks to the configured origin and
 * aborts after a bounded time (composed with any caller signal).
 * Exact provider-controlled host admission (not a DNS precheck) excludes arbitrary
 * visitor/admin-controlled DNS names. Provider DNS/TLS remain a trusted boundary.
 */
export function boundedAiFetch(
  baseURL: string,
  timeoutMs = AI_REQUEST_TIMEOUT_MS,
  base: typeof fetch = fetch,
): typeof fetch {
  const origin = aiOrigin(baseURL);
  return (input, init) => {
    const target =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (
      aiBaseUrlProblem(baseURL) ||
      aiBaseUrlProblem(target) ||
      !origin ||
      aiOrigin(target) !== origin
    )
      return Promise.reject(new Error("AI request to unexpected origin"));
    // Compose every caller signal (Request.signal and init.signal) with the timeout; the
    // timeout keeps running while a streamed body is read, so a stalled stream is aborted too.
    const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
    if (typeof input === "object" && !(input instanceof URL) && input.signal)
      signals.push(input.signal);
    if (init?.signal) signals.push(init.signal);
    const signal = AbortSignal.any(signals);
    // Workers reject redirect: "error"; use "manual" and refuse any redirect response.
    return base(input, { ...init, redirect: "manual", signal }).then(
      (response) => {
        if (
          response.type === "opaqueredirect" ||
          (response.status >= 300 && response.status < 400)
        )
          throw new Error("AI provider redirect refused");
        return response;
      },
    );
  };
}

export function isOfficialGroq(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === OFFICIAL_GROQ_HOST
    );
  } catch {
    return false;
  }
}

/** Keeps chat-capable OpenAI model ids, newest-looking first; drops audio/image/embedding/etc. */
export function pickOpenAiChatModels(ids: string[]): string[] {
  const skip =
    /(embed|whisper|tts|audio|realtime|transcribe|dall-e|image|moderation|search|davinci|babbage|instruct|codex|computer-use|sora)/i;
  const keep = ids.filter(
    (id) => /^(gpt-|o\d|chatgpt-)/i.test(id) && !skip.test(id),
  );
  return [...new Set(keep)]
    .sort((a, b) => b.localeCompare(a, "en", { numeric: true }))
    .slice(0, 60);
}
