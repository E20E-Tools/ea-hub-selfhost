import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  CircuitBoard,
  Eye,
  EyeOff,
  Info,
  Languages,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { FieldError, useAdminCopy } from "./ui";

export const SIGN_IN_MAX_FAILURES = 5;
export const SIGN_IN_COOLDOWN_MS = 60_000;

function Frame({
  logoUrl,
  siteTitle,
  children,
}: {
  logoUrl: string;
  siteTitle: string;
  children: React.ReactNode;
}) {
  const { t, dir, language, setLanguage } = useAdminCopy();
  return (
    <main dir={dir} className="ea-auth">
      <div className="ea-auth-panel">
        <aside className="ea-auth-identity">
          <div className="ea-auth-brand">
            {logoUrl ? (
              <img src={logoUrl} alt="" />
            ) : (
              <CircuitBoard aria-hidden="true" />
            )}
            <bdi>{siteTitle}</bdi>
          </div>
          <div className="ea-auth-schematic" aria-hidden="true">
            <i />
            <i />
            <i />
            <ShieldCheck strokeWidth={1.4} />
          </div>
          <div className="ea-auth-name">{t("adminWorkspace")}</div>
        </aside>
        <section className="ea-auth-form">
          <div className="ea-auth-tools">
            <a href="/">
              {t("backToSite")}
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("switchLanguageLabel")}
              onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
            >
              <Languages size={16} aria-hidden="true" />
              {t("switchLanguage")}
            </Button>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}

export function SignInScreen({
  logoUrl,
  siteTitle,
  onSignedIn,
}: {
  logoUrl: string;
  siteTitle: string;
  onSignedIn: () => Promise<void>;
}) {
  const { t } = useAdminCopy();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const failures = useRef(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const locked = now < lockedUntil;

  useEffect(() => {
    if (!lockedUntil) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= lockedUntil) {
        setLockedUntil(0);
        setError("");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || locked) return;
    setInfo("");
    setError("");
    setBusy(true);
    try {
      const { error: failed } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (failed) {
        failures.current += 1;
        if (failures.current >= SIGN_IN_MAX_FAILURES) {
          failures.current = 0;
          const time = Date.now();
          setNow(time);
          setLockedUntil(time + SIGN_IN_COOLDOWN_MS);
          setError(t("signInCooldown"));
        } else {
          setError(t("signInFailed"));
        }
        return;
      }
      failures.current = 0;
      await onSignedIn();
    } catch {
      setError(t("adminConnectionError"));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (busy) return;
    setError("");
    setInfo("");
    const address = email.trim().toLowerCase();
    if (!address) {
      setError(t("forgotNeedEmail"));
      return;
    }
    setBusy(true);
    try {
      const { error: failed } = await supabase.auth.resetPasswordForEmail(
        address,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );
      if (failed) throw failed;
      setInfo(t("forgotSent"));
    } catch {
      setError(t("adminResetError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame logoUrl={logoUrl} siteTitle={siteTitle}>
      <h1 className="text-center text-lg font-semibold">{t("signInTitle")}</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        {t("signInDesc")}
      </p>
      <form
        className="mt-6 grid gap-4"
        onSubmit={(e) => void submit(e)}
        noValidate
      >
        <div className="grid gap-1.5">
          <label htmlFor="admin-email" className="text-sm font-medium">
            {t("email")}
          </label>
          <Input
            id="admin-email"
            type="email"
            dir="ltr"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="admin-password" className="text-sm font-medium">
              {t("password")}
            </label>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={busy}
              onClick={() => void forgot()}
            >
              {t("forgotPassword")}
            </button>
          </div>
          <div className="relative">
            <Input
              id="admin-password"
              type={show ? "text" : "password"}
              dir="ltr"
              autoComplete="current-password"
              className="pe-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={show ? t("hidePassword") : t("showPassword")}
              aria-pressed={show}
              onClick={() => setShow(!show)}
            >
              {show ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        {error ? <FieldError text={error} /> : null}
        {info ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-foreground"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {info}
          </p>
        ) : null}
        <Button type="submit" disabled={busy || locked || !email || !password}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {t("signIn")}
        </Button>
      </form>
    </Frame>
  );
}

export function NotAdminScreen({
  logoUrl,
  siteTitle,
  account,
  onSignOut,
}: {
  logoUrl: string;
  siteTitle: string;
  account: string;
  onSignOut: () => void;
}) {
  const { t } = useAdminCopy();
  return (
    <Frame logoUrl={logoUrl} siteTitle={siteTitle}>
      <h1 className="text-center text-lg font-semibold">
        {t("notAdminTitle")}
      </h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        {t("notAdminBody")}
      </p>
      {account ? (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {t("currentAccount", { email: "" })}
          <bdi dir="ltr">{account}</bdi>
        </p>
      ) : null}
      <Button className="mt-6 w-full" variant="outline" onClick={onSignOut}>
        {t("signOut")}
      </Button>
    </Frame>
  );
}
