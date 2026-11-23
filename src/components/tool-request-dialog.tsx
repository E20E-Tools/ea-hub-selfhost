import { createContext, useContext, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequestImages } from "@/components/request-images";
import { FieldError } from "@/components/request-draft-controls";
import { submitRequest } from "@/lib/requests.functions";
import {
  requestSchema,
  PUBLIC_REQUEST_TYPES,
  URGENCIES,
  type PublicRequestType,
} from "@/lib/requests.shared";
import { useLanguage } from "@/lib/language";
import { dictionaries, fill, type Copy } from "@/lib/copy";
import { currentVisitorAccess } from "@/lib/current-visitor-access";
import { metricsAllowed } from "@/lib/journey-client";

const TYPE_KEYS: Record<PublicRequestType, { title: keyof Copy; hint: keyof Copy }> = {
  new: { title: "rqType_new", hint: "rqType_new_hint" },
  feature: { title: "rqType_feature", hint: "rqType_feature_hint" },
  support: { title: "rqType_support", hint: "rqType_support_hint" },
  general: { title: "rqType_general", hint: "rqType_general_hint" },
};

// Inline mode renders the same form inside the live chat window instead of a dialog.
const InlineContext = createContext(false);
function Frame({
  inline,
  open,
  onOpenChange,
  dir,
  children,
}: {
  inline: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dir: "rtl" | "ltr";
  children: ReactNode;
}) {
  if (inline)
    return (
      <InlineContext.Provider value>
        <div className="assistant-request grid gap-4 overflow-y-auto p-4" dir={dir}>
          {children}
        </div>
      </InlineContext.Provider>
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" dir={dir}>
        {children}
      </DialogContent>
    </Dialog>
  );
}
function FrameHeader({ children }: { children: ReactNode }) {
  return useContext(InlineContext) ? (
    <div className="grid gap-1">{children}</div>
  ) : (
    <DialogHeader>{children}</DialogHeader>
  );
}
function FrameTitle({ children }: { children: ReactNode }) {
  return useContext(InlineContext) ? (
    <strong className="text-base">{children}</strong>
  ) : (
    <DialogTitle>{children}</DialogTitle>
  );
}
function FrameDescription({ children }: { children: ReactNode }) {
  return useContext(InlineContext) ? (
    <p className="text-sm text-muted-foreground">{children}</p>
  ) : (
    <DialogDescription>{children}</DialogDescription>
  );
}
function FrameFooter({ children }: { children: ReactNode }) {
  return useContext(InlineContext) ? (
    <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
  ) : (
    <DialogFooter>{children}</DialogFooter>
  );
}

const hiddenTrap = {
  position: "absolute",
  width: 1,
  height: 1,
  opacity: 0,
  overflow: "hidden",
  clipPath: "inset(50%)",
  pointerEvents: "none",
} as const;

/**
 * Tool request window used by the «من المشكلة إلى الأداة» bar: request type, project
 * details and attachments, sent through the same store as /request so the request
 * reaches the admin console with a tracked receipt.
 */
export function ToolRequestDialog({
  open,
  onOpenChange,
  product,
  need,
  inline = false,
}: {
  inline?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: { id: string; name: string } | null;
  need: string;
}) {
  const { t, language, dir } = useLanguage();
  const tr = (key: string) => (key in dictionaries.ar ? t(key as keyof Copy) : key);
  const [type, setType] = useState<PublicRequestType>("new");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [detail, setDetail] = useState(need);
  const [impact, setImpact] = useState("");
  const [urgency, setUrgency] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<{ id: string; createdAt: string } | null>(null);
  const requestId = useRef("");
  const sendRequest = useServerFn(submitRequest);

  const needsProduct = type === "feature" || type === "support";
  const allowImages = type !== "general";
  const messageLabel =
    type === "new"
      ? t("requestNeedLabel")
      : type === "feature"
        ? t("rqFeatureLabel")
        : type === "support"
          ? t("rqIssueLabel")
          : t("rqMessageLabel");

  const missing = [
    name.trim().length < 2 && t("requestMissingName"),
    !email.includes("@") && t("requestMissingEmail"),
    type === "support" && phone.replace(/\D/g, "").length < 7 && t("requestMissingPhone"),
    needsProduct && !product && t("rqMissingProduct"),
    type === "support" && !urgency && t("rqMissingUrgency"),
    detail.trim().length < 20 && t("rqMissingMessage"),
  ].filter(Boolean);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const validation = requestSchema.safeParse({
      requestId: requestId.current,
      type,
      name,
      email,
      company,
      phone,
      need: detail,
      productId: product?.id ?? "",
      urgency,
      impact,
    });
    if (!validation.success) {
      const next: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        const field = String(issue.path[0] ?? "form");
        if (!next[field]) next[field] = tr(issue.message);
      }
      setFieldErrors(next);
      setError(tr(validation.error.issues[0]?.message ?? "rqErrInvalid"));
      return;
    }
    setFieldErrors({});
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("language", language);
      form.set("metrics", metricsAllowed() ? "on" : "off");
      const access = await currentVisitorAccess();
      if (access) form.set("visitorAccess", access);
      Object.entries(validation.data).forEach(([key, value]) => {
        if (typeof value === "string") form.set(key, value);
      });
      const trap = document.getElementById("tool-request-website") as HTMLInputElement | null;
      form.set("website", trap?.value ?? "");
      if (allowImages) images.forEach((image) => form.append("images", image));
      const result = await sendRequest({ data: form });
      if (result.ok) {
        setReceipt({ id: result.id, createdAt: result.createdAt });
      } else {
        setError(tr(result.message));
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(message.startsWith("rq") ? tr(message) : t("requestSaveError"));
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setReceipt(null);
    requestId.current = "";
    setDetail(need);
    setImages([]);
    setFieldErrors({});
    setError("");
  }

  return (
    <Frame inline={inline} open={open} onOpenChange={onOpenChange} dir={dir}>
      <FrameHeader>
        <FrameTitle>
          {receipt ? t("requestReceivedTitle") : fill(t("trRequestToolTitle"), product?.name ?? "")}
        </FrameTitle>
        <FrameDescription>
          {receipt ? t("requestSavedPlain") : t("trRequestToolLead")}
        </FrameDescription>
      </FrameHeader>

      {receipt ? (
        <div className="grid gap-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {fill(t("requestThanks"), name.split(" ")[0] ?? "")}
          </p>
          <dl className="grid gap-1 text-sm">
            <dt className="text-muted-foreground">{t("requestNumberLabel")}</dt>
            <dd className="break-all" dir="ltr">
              {receipt.id}
            </dd>
            <dt className="text-muted-foreground">{t("requestTimeLabel")}</dt>
            <dd dir="ltr">
              {new Date(receipt.createdAt).toLocaleString(language === "ar" ? "ar-SA" : "en-GB")}
            </dd>
          </dl>
          <FrameFooter>
            <Button type="button" variant="outline" onClick={again} disabled={busy}>
              {t("trRequestToolAnother")}
            </Button>
            <Button type="button" onClick={() => onOpenChange(false)} disabled={busy}>
              {t("trRequestToolClose")}
            </Button>
          </FrameFooter>
        </div>
      ) : (
        <form onSubmit={submit} aria-busy={busy} noValidate className="grid gap-4">
          <input
            id="tool-request-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={hiddenTrap}
          />
          {product ? (
            <p className="text-sm text-muted-foreground">{fill(t("ucToolLabel"), product.name)}</p>
          ) : null}

          <fieldset className="grid gap-2" disabled={busy}>
            <legend className="text-sm font-medium">{t("rqTypeLegend")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PUBLIC_REQUEST_TYPES.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer flex-col gap-0.5 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary"
                >
                  <input
                    type="radio"
                    name="tool-request-type"
                    value={option}
                    checked={type === option}
                    onChange={() => {
                      setType(option);
                      if (option !== "support") {
                        setPhone("");
                        setUrgency("");
                      }
                      setFieldErrors({});
                      setError("");
                    }}
                    className="accent-primary"
                  />
                  <strong>{t(TYPE_KEYS[option].title)}</strong>
                  <small className="text-muted-foreground">{t(TYPE_KEYS[option].hint)}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-3" disabled={busy}>
            <legend className="text-sm font-medium">{t("requestContactSection")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span>{t("requestNameLabel")}</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  required
                  aria-invalid={Boolean(fieldErrors["name"])}
                  aria-describedby={fieldErrors["name"] ? "tool-request-name-error" : undefined}
                />
                <FieldError id="tool-request-name-error" message={fieldErrors["name"]} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("requestEmailLabel")}</span>
                <Input
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={255}
                  required
                  aria-invalid={Boolean(fieldErrors["email"])}
                  aria-describedby={fieldErrors["email"] ? "tool-request-email-error" : undefined}
                />
                <FieldError id="tool-request-email-error" message={fieldErrors["email"]} />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t("requestCompanyLabel")}</span>
                <Input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  maxLength={150}
                />
              </label>
              {type === "support" ? (
                <label className="grid gap-1 text-sm">
                  <span>{t("rqPhoneSupport")}</span>
                  <Input
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={20}
                    required
                    aria-invalid={Boolean(fieldErrors["phone"])}
                    aria-describedby={fieldErrors["phone"] ? "tool-request-phone-error" : undefined}
                  />
                  <FieldError id="tool-request-phone-error" message={fieldErrors["phone"]} />
                </label>
              ) : null}
              {type === "support" ? (
                <label className="grid gap-1 text-sm">
                  <span>{t("rqUrgencyLabel")}</span>
                  <select
                    className="rounded-md border border-border bg-background p-2 text-sm"
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value)}
                    required
                    aria-invalid={Boolean(fieldErrors["urgency"])}
                    aria-describedby={
                      fieldErrors["urgency"] ? "tool-request-urgency-error" : undefined
                    }
                  >
                    <option value="">{t("spSelect")}</option>
                    {URGENCIES.map((u) => (
                      <option key={u} value={u}>
                        {t(`rqUrgency_${u}` as keyof Copy)}
                      </option>
                    ))}
                  </select>
                  <FieldError id="tool-request-urgency-error" message={fieldErrors["urgency"]} />
                </label>
              ) : null}
            </div>
          </fieldset>

          <fieldset className="grid gap-3" disabled={busy}>
            <legend className="text-sm font-medium">{t("trRequestProjectSection")}</legend>
            <label className="grid gap-1 text-sm">
              <span>{messageLabel}</span>
              <Textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={5}
                maxLength={2000}
                required
                dir="auto"
                aria-invalid={Boolean(fieldErrors["need"])}
                aria-describedby={fieldErrors["need"] ? "tool-request-need-error" : undefined}
              />
              <FieldError id="tool-request-need-error" message={fieldErrors["need"]} />
            </label>
            {type === "feature" ? (
              <label className="grid gap-1 text-sm">
                <span>{t("rqImpactLabel")}</span>
                <Textarea
                  value={impact}
                  onChange={(e) => setImpact(e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              </label>
            ) : null}
          </fieldset>

          {allowImages ? (
            <section className="grid gap-2">
              <h3 className="text-sm font-medium">
                {type === "support" ? t("rqScreenshots") : t("requestImagesSection")}{" "}
                <small className="text-muted-foreground">{t("requestOptional")}</small>
              </h3>
              <RequestImages files={images} onChange={setImages} disabled={busy} />
            </section>
          ) : null}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <FrameFooter>
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {busy ? t("requestSaving") : missing.length ? t("requestMissingLead") : ""}
            </span>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={16} aria-hidden="true" />
              )}
              <span>{busy ? t("requestSaving") : t("trRequestToolSend")}</span>
            </Button>
          </FrameFooter>
        </form>
      )}
    </Frame>
  );
}
