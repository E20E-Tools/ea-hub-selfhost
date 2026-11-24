import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/lib/language";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password | E20E Tools" },
      {
        name: "description",
        content: "Set a new password for your E20E Tools account.",
      },
      { property: "og:title", content: "Reset password | E20E Tools" },
      {
        property: "og:description",
        content: "Set a new password for your E20E Tools account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const { t, dir } = useLanguage();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")
        setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 10) return setMessage(t("pubResetTooShort"));
    if (password !== confirm) return setMessage(t("pubResetMismatch"));
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return setMessage(t("pubResetFailed"));
      setMessage(t("pubResetDone"));
      setTimeout(() => navigate({ to: "/admin" }), 1200);
    } catch {
      setMessage(t("pubResetFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      dir={dir}
      className="ea-workspace ea-account flex min-h-screen items-center justify-center bg-background px-4"
    >
      <section className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-card-foreground">
        <h1 className="mb-4 text-xl font-semibold">{t("pubResetTitle")}</h1>
        {!ready ? (
          <p className="text-sm text-muted-foreground">
            {t("pubResetOpenFromEmail")}
          </p>
        ) : (
          <form className="space-y-3" onSubmit={submit}>
            <Input
              type="password"
              autoComplete="new-password"
              aria-label={t("pubResetNew")}
              placeholder={t("pubResetNew")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Input
              type="password"
              autoComplete="new-password"
              aria-label={t("pubResetConfirm")}
              placeholder={t("pubResetConfirm")}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <Button type="submit" className="w-full" disabled={busy}>
              {t("pubResetSave")}
            </Button>
          </form>
        )}
        {message ? (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
