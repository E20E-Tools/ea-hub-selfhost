import type { AdminActivityRow } from "./admin.functions";
import { toCsv } from "./requests.shared";

/** Activity-log filter groups (action prefixes); labels live in the admin dictionary as group_<key>. */
export const ACTIVITY_GROUPS = {
  all: true,
  ai: true,
  product: true,
  affiliate: true,
  settings: true,
  image: true,
  contact: true,
  request: true,
  suggestion: true,
  offer: true,
  password: true,
} as const;
export type ActivityGroup = keyof typeof ACTIVITY_GROUPS;

export function filterActivity(
  rows: AdminActivityRow[],
  group: ActivityGroup,
  search: string,
  from: string,
  to: string,
) {
  const needle = search.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    const day = row.created_at.slice(0, 10);
    return (
      (group === "all" || row.action.startsWith(`${group}.`)) &&
      (!from || day >= from) &&
      (!to || day <= to) &&
      (!needle ||
        `${row.actor_email} ${row.action} ${row.target}`.toLocaleLowerCase().includes(needle))
    );
  });
}

export function activityCsv(rows: AdminActivityRow[]) {
  return toCsv(
    ["time", "actor", "action", "target"],
    rows.map((row) => [row.created_at, row.actor_email, row.action, row.target]),
  );
}

export type AiUsageView = {
  since: string;
  chat: number;
  recommendations: number;
  bans: number;
  chatLimit: number;
  recommendationLimit: number;
};

export type AssistantReplyRow = {
  id: string;
  visitor_email: string;
  visitor_name: string;
  reply: string;
  language: string;
  created_at: string;
};

export function filterAssistantReplies(
  rows: AssistantReplyRow[],
  search: string,
  from: string,
  to: string,
) {
  const needle = search.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    const day = row.created_at.slice(0, 10);
    return (
      (!from || day >= from) &&
      (!to || day <= to) &&
      (!needle ||
        `${row.visitor_email} ${row.visitor_name} ${row.reply}`
          .toLocaleLowerCase()
          .includes(needle))
    );
  });
}
