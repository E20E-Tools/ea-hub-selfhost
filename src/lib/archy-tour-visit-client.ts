import { startTourVisit, updateTourVisit } from "./archy-tour-visits.functions";
import { TOUR_VISIT_SESSION } from "./archy-tour-visits.shared";
import { isVisitorKey, VISITOR_KEY_STORAGE } from "./site-visits.shared";

let pending: Promise<void> = Promise.resolve();
export function startBrowserTourVisit() {
  pending = (async () => {
    sessionStorage.removeItem(TOUR_VISIT_SESSION);
    let key = localStorage.getItem(VISITOR_KEY_STORAGE);
    if (!isVisitorKey(key)) {
      key = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY_STORAGE, key);
    }
    const result = await startTourVisit({ data: { key } });
    if (result)
      sessionStorage.setItem(
        TOUR_VISIT_SESSION,
        JSON.stringify({ token: result.token, completed: false }),
      );
  })().catch(() => undefined);
}
export function currentTourVisit() {
  try {
    const value = JSON.parse(sessionStorage.getItem(TOUR_VISIT_SESSION) ?? "null");
    return typeof value?.token === "string" && value.completed === true
      ? (value.token as string)
      : "";
  } catch {
    return "";
  }
}
export function updateBrowserTourVisit(action: "completed" | "chat", access = "") {
  pending = pending
    .then(async () => {
      const value = JSON.parse(sessionStorage.getItem(TOUR_VISIT_SESSION) ?? "null");
      if (!value?.token || (action !== "completed" && !value.completed)) return;
      const result = await updateTourVisit({ data: { token: value.token, action, access } });
      if (result.ok && action === "completed")
        sessionStorage.setItem(
          TOUR_VISIT_SESSION,
          JSON.stringify({ token: value.token, completed: true }),
        );
    })
    .catch(() => undefined);
}
