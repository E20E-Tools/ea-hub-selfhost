/**
 * Outgoing mail for the self-hosted build.
 *
 * Upstream EA-Hub sends mail through the Resend HTTP API (https://api.resend.com/emails).
 * When SMTP_HOST is set, `installResendBridge` routes those exact requests to your SMTP
 * server instead, so the upstream mail code works unchanged with any mail provider.
 */
type Mail = {
  to: string | string[];
  subject: string;
  text?: string | undefined;
  html?: string | undefined;
  from?: string | undefined;
  replyTo?: string | string[] | undefined;
  headers?: Record<string, string> | undefined;
};

const RESEND = "https://api.resend.com/emails";

export function smtpConfigured(): boolean {
  return Boolean(process.env["SMTP_HOST"]?.trim());
}

function defaultFrom(): string {
  return (
    process.env["SMTP_FROM"]?.trim() ||
    process.env["NOTIFY_FROM"]?.trim() ||
    process.env["NEWSLETTER_FROM"]?.trim() ||
    "EA-Hub <no-reply@localhost>"
  );
}

type Transport = {
  sendMail(message: Record<string, unknown>): Promise<{ messageId?: string }>;
};
let transport: Promise<Transport> | undefined;

async function smtp(): Promise<Transport> {
  if (!transport) {
    transport = import("nodemailer").then((m) => {
      const port = Number(process.env["SMTP_PORT"] ?? 587) || 587;
      const secure =
        (
          process.env["SMTP_SECURE"] ?? (port === 465 ? "true" : "false")
        ).toLowerCase() === "true";
      const user = process.env["SMTP_USER"]?.trim();
      return m.default.createTransport({
        host: process.env["SMTP_HOST"]!.trim(),
        port,
        secure,
        auth: user
          ? { user, pass: process.env["SMTP_PASSWORD"] ?? "" }
          : undefined,
      }) as unknown as Transport;
    });
  }
  return transport;
}

async function sendSmtp(mail: Mail): Promise<{ id: string }> {
  const info = await (
    await smtp()
  ).sendMail({
    from: mail.from || defaultFrom(),
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    replyTo: mail.replyTo,
    headers: mail.headers,
  });
  return { id: info.messageId ?? "smtp" };
}

/** Sends through SMTP, else through Resend when a real key is set. Returns false when neither is configured. */
export async function sendMail(mail: Mail): Promise<boolean> {
  try {
    if (smtpConfigured()) {
      await sendSmtp(mail);
      return true;
    }
    const key = process.env["RESEND_API_KEY"]?.trim();
    if (key && key !== SMTP_PLACEHOLDER) {
      const res = await originalFetch(RESEND, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...mail, from: mail.from || defaultFrom() }),
      });
      return res.ok;
    }
  } catch (error) {
    console.error(
      "[selfhost] mail delivery failed",
      (error as Error)?.message ?? error,
    );
  }
  return false;
}

/** RESEND_API_KEY value that only says "mail is on"; requests are delivered over SMTP. */
export const SMTP_PLACEHOLDER = "selfhost-smtp";
let originalFetch: typeof fetch = globalThis.fetch;

export function installResendBridge(): void {
  if (!smtpConfigured()) return;
  if (!process.env["RESEND_API_KEY"])
    process.env["RESEND_API_KEY"] = SMTP_PLACEHOLDER;
  originalFetch = globalThis.fetch;
  const bridged: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url !== RESEND || (init?.method ?? "GET").toUpperCase() !== "POST")
      return originalFetch(input, init);
    try {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        from?: string | undefined;
        to?: string | string[] | undefined;
        subject?: string | undefined;
        text?: string | undefined;
        html?: string | undefined;
        reply_to?: string | string[] | undefined;
        headers?: Record<string, string> | undefined;
      };
      const result = await sendSmtp({
        from: body.from,
        to: body.to ?? [],
        subject: body.subject ?? "",
        text: body.text,
        html: body.html,
        replyTo: body.reply_to,
        headers: body.headers,
      });
      return Response.json(result, { status: 200 });
    } catch (error) {
      console.error(
        "[selfhost] SMTP delivery failed",
        (error as Error)?.message ?? error,
      );
      return Response.json(
        { name: "smtp_error", message: "SMTP delivery failed" },
        { status: 502 },
      );
    }
  };
  globalThis.fetch = bridged;
}
