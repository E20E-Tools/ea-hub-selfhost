export const TOUR_VISIT_SESSION = "e20e-archy-tour-visit-v1";
export type TourVisit = {
  id: string;
  visitor_key: string;
  started_at: string;
  completed_at: string | null;
  chat_opened_at: string | null;
  visitor_name: string;
  visitor_email: string;
  support_request_id: string | null;
  support_submitted_at: string | null;
};

/** Distinct browser identities within the loaded tour sample, not verified people. */
export function summarizeTourVisits(rows: readonly TourVisit[]) {
  const started = new Set<string>();
  const completed = new Set<string>();
  const chatted = new Set<string>();
  const supported = new Set<string>();
  for (const row of rows) {
    started.add(row.visitor_key);
    if (!row.completed_at) continue;
    completed.add(row.visitor_key);
    if (row.chat_opened_at) chatted.add(row.visitor_key);
    if (row.support_submitted_at && row.support_request_id) supported.add(row.visitor_key);
  }
  return {
    tours: rows.length,
    started: started.size,
    completed: completed.size,
    chatted: chatted.size,
    supported: supported.size,
    completionRate: started.size ? Math.round((completed.size / started.size) * 100) : null,
  };
}

/** Post-tour means after the handle reached 100%, not merely after a cancelled start. */
export function tourVisitPatch(
  row: Pick<TourVisit, "started_at" | "completed_at" | "chat_opened_at">,
  action: "completed" | "chat",
  now = new Date().toISOString(),
) {
  if (action === "completed") return row.completed_at ? {} : { completed_at: now };
  return row.completed_at && !row.chat_opened_at ? { chat_opened_at: now } : {};
}
