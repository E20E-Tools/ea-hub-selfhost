import "@/components/admin/console.css";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  useBlocker,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getAdminAccess } from "@/lib/admin.functions";
import {
  resolveAdminLocation,
  type AdminSection,
  type AdminTab,
} from "@/lib/admin-sections";
import { fallbackCatalog } from "@/lib/catalog";
import { pick } from "@/lib/language-core";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { DashboardSection, dashboardQuery } from "@/components/admin/dashboard";
import { useLiveChatAlerts } from "@/components/admin/live-chat";
import { AdminShell } from "@/components/admin/shell";
import { NotAdminScreen, SignInScreen } from "@/components/admin/sign-in";
import {
  DirtyProvider,
  LoadingBlock,
  useAdminCopy,
  useLeaveGuard,
} from "@/components/admin/ui";

const ContentSection = lazy(async () => ({
  default: (await import("@/components/admin/content")).ContentSection,
}));
const CustomersSection = lazy(async () => ({
  default: (await import("@/components/admin/customers")).CustomersSection,
}));
const EnterpriseSection = lazy(async () => ({
  default: (await import("@/components/admin/inbox")).EnterpriseSection,
}));
const SecuritySection = lazy(async () => ({
  default: (await import("@/components/admin/security")).SecuritySection,
}));
const SettingsSection = lazy(async () => ({
  default: (await import("@/components/admin/settings")).SettingsSection,
}));

export const Route = createFileRoute("/admin")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    section?: string | undefined;
    tab?: string | undefined;
    focus?: string | undefined;
  } => ({
    section:
      typeof search["section"] === "string" ? search["section"] : undefined,
    tab: typeof search["tab"] === "string" ? search["tab"] : undefined,
    focus:
      typeof search["focus"] === "string" &&
      /^[a-z0-9-]{1,80}$/.test(search["focus"])
        ? search["focus"]
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Admin console — E20E Tools" },
      {
        name: "description",
        content:
          "E20E Tools admin console for content, requests and site settings.",
      },
      { property: "og:title", content: "Admin console — E20E Tools" },
      {
        property: "og:description",
        content: "Manage E20E Tools content, requests and settings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminRoute,
});

function AdminRoute() {
  return (
    <DirtyProvider>
      <AdminConsole />
    </DirtyProvider>
  );
}

function AdminConsole() {
  const queryClient = useQueryClient();
  const { t, dir, language } = useAdminCopy();
  const catalog = useQuery(catalogQueryOptions).data ?? fallbackCatalog;
  const siteTitle = pick(
    language,
    catalog.settings.displayTitle,
    catalog.settings.displayTitleEn,
  );
  const [state, setState] = useState<
    "checking" | "signedOut" | "notAdmin" | "admin"
  >("checking");
  const [account, setAccount] = useState("");
  const search = useSearch({ strict: false }) as {
    section?: string;
    tab?: string;
  };
  const navigate = useNavigate();
  const guard = useLeaveGuard();
  const location = resolveAdminLocation(search.section, search.tab);
  // Cover browser Back/Forward as well as sidebar, tabs and command-palette navigation.
  useBlocker({
    shouldBlockFn: async () => !(await guard.confirmLeave()),
    enableBeforeUnload: false, // DirtyProvider already handles document unloads.
  });
  const readAccess = useServerFn(getAdminAccess);
  const dashboard = useQuery({
    ...dashboardQuery,
    enabled: state === "admin",
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  });

  // Live alert: when the count of new requests/offers grows, show a toast and flag the tab title.
  const pending =
    state === "admin" && dashboard.data
      ? (dashboard.data.newRequests ?? 0) + (dashboard.data.newOffers ?? 0)
      : null;
  const lastPending = useRef<number | null>(null);
  useEffect(() => {
    if (pending === null) return;
    const prev = lastPending.current;
    lastPending.current = pending;
    if (prev !== null && pending > prev) {
      toast.info(t("liveNewRequest"), {
        action: {
          label: t("liveOpenInbox"),
          onClick: () =>
            void navigate({
              to: "/admin",
              search: { section: "customers", tab: "requests" },
            }),
        },
        duration: 15_000,
      });
    }
  }, [pending, t, navigate]);

  const checkAccess = async () => {
    try {
      const access = await readAccess();
      setAccount(access.email);
      setState(access.isAdmin ? "admin" : "notAdmin");
    } catch {
      setState("signedOut");
    }
  };

  useEffect(() => {
    void checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = async (section: AdminSection, tab?: AdminTab) => {
    if (section === location.section && tab === location.tab) return;
    void navigate({
      to: "/admin",
      search:
        section === "dashboard" ? {} : { section, ...(tab ? { tab } : {}) },
    });
  };
  const onTab = (tab: AdminTab) => void go(location.section, tab);

  const signOut = async () => {
    if (!(await guard.confirmLeave())) return;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch {
      toast.error(t("adminSignOutError"));
      return;
    }
    await queryClient.cancelQueries({ queryKey: ["admin"] });
    queryClient.removeQueries({ queryKey: ["admin"] });
    lastPending.current = null;
    setAccount("");
    setState("signedOut");
  };

  const openLiveChat = useCallback(
    () =>
      void navigate({
        to: "/admin",
        search: { section: "customers", tab: "conversations" },
      }),
    [navigate],
  );
  const liveWaiting = useLiveChatAlerts(state === "admin", openLiveChat);
  // The tab title shows the same "waiting for the team" count as the sidebar badge.
  const waiting = pending === null ? null : pending + (liveWaiting ?? 0);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = `${t("consoleTitle")} — ${siteTitle}`;
    document.title =
      waiting !== null && waiting > 0 ? `(${waiting}) ${base}` : base;
  }, [waiting, siteTitle, t]);

  const brand = {
    logoUrl: catalog.settings.logoUrl,
    siteTitle,
  };

  if (state === "checking")
    return (
      <main
        dir={dir}
        className="mx-auto max-w-md px-4 py-24"
        aria-label={t("checking")}
      >
        <LoadingBlock rows={3} />
      </main>
    );
  if (state === "signedOut")
    return <SignInScreen {...brand} onSignedIn={checkAccess} />;
  if (state === "notAdmin")
    return (
      <NotAdminScreen
        {...brand}
        account={account}
        onSignOut={() => void signOut()}
      />
    );

  return (
    <AdminShell
      section={location.section}
      tab={location.tab}
      go={(section, tab) => void go(section, tab)}
      account={account}
      siteTitle={siteTitle}
      inboxBadge={
        (dashboard.data?.newRequests ?? 0) + (dashboard.data?.newOffers ?? 0)
      }
      liveBadge={liveWaiting}
      onSignOut={() => void signOut()}
    >
      <Suspense fallback={<LoadingBlock rows={3} />}>
        {location.section === "customers" ? (
          <CustomersSection tab={location.tab} onTab={onTab} />
        ) : null}
        {location.section === "dashboard" ? (
          <DashboardSection
            catalog={catalog}
            go={(s, tab) => void go(s, tab)}
          />
        ) : null}
        {location.section === "enterprise" ? <EnterpriseSection /> : null}
        {location.section === "content" ? (
          <ContentSection catalog={catalog} tab={location.tab} onTab={onTab} />
        ) : null}
        {location.section === "settings" ? (
          <SettingsSection catalog={catalog} tab={location.tab} onTab={onTab} />
        ) : null}
        {location.section === "security" ? (
          <SecuritySection tab={location.tab} onTab={onTab} account={account} />
        ) : null}
      </Suspense>
    </AdminShell>
  );
}
