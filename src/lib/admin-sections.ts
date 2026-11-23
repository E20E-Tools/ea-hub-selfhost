/**
 * Admin console information architecture: five sidebar sections (plus "View site" in the
 * top bar), each with URL-addressable tabs (/admin?section=…&tab=…). Old section ids keep
 * working through SECTION_ALIASES. Labels are dictionary keys, never literal text.
 */
import type { AdminCopyKey } from "./admin-copy";

export const ADMIN_SECTION_TABS = {
  dashboard: [],
  customers: ["requests", "offers", "conversations", "assistant", "feedback", "visitors"],
  enterprise: [],
  content: ["products", "categories", "affiliates", "media"],
  settings: [
    "overview",
    "terms",
    "notifications",
    "general",
    "appearance",
    "customize",
    "testimonials",
    "navigation",
    "features",
    "status",
    "contact",
    "ai",
    "archy",
    "health",
    "history",
    "retention",
    "journey",
  ],
  security: ["account", "admins", "activity"],
} as const;

export type AdminSection = keyof typeof ADMIN_SECTION_TABS;
export type AdminTab = (typeof ADMIN_SECTION_TABS)[AdminSection][number];
export type AdminLocation = {
  section: AdminSection;
  tab: AdminTab | undefined;
};

/** Presentation groups only: keep existing tab IDs and save ownership unchanged. */
export const SETTINGS_GROUPS = [
  {
    label: "settingsIdentity",
    tabs: ["general", "navigation", "appearance", "customize"],
  },
  {
    label: "settingsServices",
    tabs: ["features", "status", "testimonials", "terms"],
  },
  {
    label: "settingsChannels",
    tabs: ["contact", "notifications", "archy", "ai"],
  },
  { label: "settingsOps", tabs: ["health", "history", "retention", "journey"] },
] as const satisfies readonly {
  label: AdminCopyKey;
  tabs: readonly AdminTab[];
}[];

export const ADMIN_NAV: {
  group: AdminCopyKey;
  items: { id: AdminSection; label: AdminCopyKey; description: AdminCopyKey }[];
}[] = [
  {
    group: "groupOverview",
    items: [
      {
        id: "dashboard",
        label: "navDashboard",
        description: "navDashboardDesc",
      },
    ],
  },
  {
    group: "adminCustomerGroup",
    items: [
      {
        id: "customers",
        label: "navCustomers",
        description: "navCustomersDesc",
      },
      {
        id: "enterprise",
        label: "navEnterprise",
        description: "navEnterpriseDesc",
      },
    ],
  },
  {
    group: "groupManage",
    items: [{ id: "content", label: "navContent", description: "navContentDesc" }],
  },
  {
    group: "groupSystem",
    items: [
      { id: "settings", label: "navSettings", description: "navSettingsDesc" },
      { id: "security", label: "navSecurity", description: "navSecurityDesc" },
    ],
  },
];

export const ADMIN_SECTIONS = ADMIN_NAV.flatMap((g) => g.items);

export const TAB_LABELS: Record<AdminTab, AdminCopyKey> = {
  conversations: "navLiveChat",
  feedback: "navFeedback",
  visitors: "cwVisitors",
  requests: "tabRequests",
  offers: "tabOffers",
  assistant: "tabAssistant",
  products: "tabProducts",
  categories: "tabCategories",
  affiliates: "tabAffiliates",
  media: "tabMedia",
  overview: "settingsDirectory",
  terms: "termsTitle",
  notifications: "notifications",
  general: "tabGeneral",
  appearance: "tabAppearance",
  customize: "tabCustomize",
  testimonials: "tabTestimonials",
  navigation: "tabNavigation",
  features: "tabFeatures",
  status: "tabFeatureStatus",
  contact: "tabContact",
  ai: "tabAi",
  archy: "tabArchy",
  health: "opsHealth",
  history: "opsHistory",
  retention: "opsRetention",
  journey: "journeyMetrics",
  account: "tabAccount",
  admins: "tabAdmins",
  activity: "tabActivity",
};

/** Old ?section= values (bookmarks, earlier links) and where they open now. */
export const SECTION_ALIASES: Record<string, { section: AdminSection; tab?: AdminTab }> = {
  home: { section: "dashboard" },
  "enterprise-requests": { section: "enterprise" },
  // Inbox, live chat and feedback now live inside the customer workspace.
  inbox: { section: "customers", tab: "requests" },
  livechat: { section: "customers", tab: "conversations" },
  feedback: { section: "customers", tab: "feedback" },
  requests: { section: "customers", tab: "requests" },
  offers: { section: "customers", tab: "offers" },
  "ai-chats": { section: "customers", tab: "assistant" },
  "live-chat": { section: "customers", tab: "conversations" },
  ratings: { section: "customers", tab: "feedback" },
  faq: { section: "customers", tab: "feedback" },
  products: { section: "content", tab: "products" },
  releases: { section: "content", tab: "products" },
  gallery: { section: "content", tab: "media" },
  affiliates: { section: "content", tab: "affiliates" },
  identity: { section: "settings", tab: "general" },
  menu: { section: "settings", tab: "navigation" },
  appearance: { section: "settings", tab: "appearance" },
  "design-theme": { section: "settings", tab: "appearance" },
  "site-features": { section: "settings", tab: "features" },
  features: { section: "settings", tab: "features" },
  "feature-status": { section: "settings", tab: "status" },
  contact: { section: "settings", tab: "contact" },
  ai: { section: "settings", tab: "ai" },
  testimonials: { section: "settings", tab: "testimonials" },
  "ai-settings": { section: "settings", tab: "ai" },
  "ai-usage": { section: "settings", tab: "ai" },
  archy: { section: "settings", tab: "archy" },
  team: { section: "security", tab: "admins" },
  activity: { section: "security", tab: "activity" },
  account: { section: "security", tab: "account" },
};

function isSection(value: unknown): value is AdminSection {
  return typeof value === "string" && Object.hasOwn(ADMIN_SECTION_TABS, value);
}

export function defaultTab(section: AdminSection): AdminTab | undefined {
  return ADMIN_SECTION_TABS[section][0];
}

/** Resolves raw URL values to a valid section + tab (unknown values fall back safely). */
export function resolveAdminLocation(section: unknown, tab?: unknown): AdminLocation {
  if (isSection(section)) {
    const tabs = ADMIN_SECTION_TABS[section] as readonly string[];
    const valid = typeof tab === "string" && tabs.includes(tab);
    return { section, tab: valid ? (tab as AdminTab) : defaultTab(section) };
  }
  if (typeof section === "string" && Object.hasOwn(SECTION_ALIASES, section)) {
    const alias = SECTION_ALIASES[section];
    if (alias)
      return {
        section: alias.section,
        tab: alias.tab ?? defaultTab(alias.section),
      };
  }
  return { section: "dashboard", tab: undefined };
}

export function sectionMeta(id: AdminSection) {
  const meta = ADMIN_SECTIONS.find((s) => s.id === id);
  if (!meta) throw new Error("Unknown admin section");
  return meta;
}
