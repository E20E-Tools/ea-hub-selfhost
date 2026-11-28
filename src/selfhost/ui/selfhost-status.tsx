import { useEffect, useState } from "react";
import { CircleCheck, CircleMinus, CircleX, Server } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Self-hosted server status for administrators (version, database, migrations, storage,
 * mail, single sign-on, jobs, metrics, search). Shown under Settings → Application health.
 */
type Check = { ok: boolean | null; detail: string };
type Report = {
  version: string;
  node: string;
  uptimeSeconds: number;
  appUrl: string;
  checks: Record<string, Check>;
};

const LABELS: Record<string, { en: string; ar: string }> = {
  database: { en: "Database", ar: "قاعدة البيانات" },
  migrations: { en: "Database updates", ar: "تحديثات القاعدة" },
  storage: { en: "Uploaded files", ar: "الملفات المرفوعة" },
  mail: { en: "E-mail", ar: "البريد" },
  sso: { en: "Single sign-on", ar: "الدخول الموحد" },
  scheduledJobs: { en: "Scheduled jobs", ar: "المهام المجدولة" },
  metrics: { en: "Prometheus metrics", ar: "مقاييس Prometheus" },
  semanticSearch: { en: "Search by meaning", ar: "البحث بالمعنى" },
};

function duration(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export function SelfhostStatus() {
  const [report, setReport] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);
  const ar =
    typeof document !== "undefined" && document.documentElement.dir === "rtl";

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/selfhost/status", {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as Report;
        if (alive) setReport(body);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (failed || !report) return null;
  return (
    <section
      className="mt-6 rounded-lg border bg-card p-4"
      aria-labelledby="selfhost-status-title"
    >
      <h2
        id="selfhost-status-title"
        className="flex items-center gap-2 text-base font-semibold"
      >
        <Server className="size-4" aria-hidden="true" />
        {ar ? "حالة الخادم (استضافة ذاتية)" : "Server status (self-hosted)"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
        EA-Hub {report.version} · Node {report.node} · {ar ? "يعمل منذ" : "up"}{" "}
        {duration(report.uptimeSeconds)}
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {Object.entries(report.checks).map(([key, check]) => {
          const Icon =
            check.ok === true
              ? CircleCheck
              : check.ok === false
                ? CircleX
                : CircleMinus;
          const color =
            check.ok === true
              ? "text-emerald-600"
              : check.ok === false
                ? "text-destructive"
                : "text-muted-foreground";
          const label = LABELS[key] ?? { en: key, ar: key };
          return (
            <li key={key} className="flex items-start gap-2 text-sm">
              <Icon
                className={`mt-0.5 size-4 shrink-0 ${color}`}
                aria-hidden="true"
              />
              <span>
                <span className="font-medium">{ar ? label.ar : label.en}</span>
                <span className="block text-muted-foreground" dir="ltr">
                  {check.detail}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
