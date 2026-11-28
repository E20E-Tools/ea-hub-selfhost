import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Sign in with …" button for the self-hosted edition. Renders nothing unless single sign-on
 * (OIDC_*) is configured on the server, so the upstream sign-in screen is unchanged otherwise.
 */
const MESSAGES: Record<string, { en: string; ar: string }> = {
  not_allowed: {
    en: "Your organisation account has no access to EA-Hub yet. Ask an administrator.",
    ar: "حساب مؤسستك لا يملك صلاحية دخول EA-Hub بعد. اطلب ذلك من المسؤول.",
  },
  banned: {
    en: "This account is blocked.",
    ar: "هذا الحساب موقوف.",
  },
  failed: {
    en: "Single sign-on did not complete. Please try again.",
    ar: "لم يكتمل الدخول الموحد. حاول مرة أخرى.",
  },
  unavailable: {
    en: "Single sign-on is unavailable right now.",
    ar: "الدخول الموحد غير متاح حالياً.",
  },
};

export function SelfhostSsoSignIn() {
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/selfhost/auth/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { sso?: { enabled?: boolean; label?: string } } | null) => {
        if (alive && s?.sso?.enabled) setLabel(s.sso.label ?? "Single sign-on");
      })
      .catch(() => undefined);
    const params = new URLSearchParams(window.location.search);
    const code = params.get("sso_error");
    if (code) {
      setError(code);
      params.delete("sso_error");
      const qs = params.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
      );
    }
    return () => {
      alive = false;
    };
  }, []);

  if (!label && !error) return null;
  const message = error ? (MESSAGES[error] ?? MESSAGES["failed"]!) : null;
  return (
    <div className="mt-4 grid gap-3">
      {message ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {document.documentElement.dir === "rtl" ? message.ar : message.en}
        </p>
      ) : null}
      {label ? (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>or / أو</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void supabase.auth.signInWithOAuth({
                provider: "keycloak",
                options: {
                  redirectTo:
                    window.location.href.split("#")[0] ?? window.location.href,
                },
              })
            }
          >
            <KeyRound className="size-4" aria-hidden="true" />
            {label}
          </Button>
        </>
      ) : null}
    </div>
  );
}
