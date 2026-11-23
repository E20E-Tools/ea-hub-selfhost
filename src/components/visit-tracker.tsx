import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { recordVisit } from "@/lib/site-visits.functions";
import {
  riyadhDay,
  VISIT_DAY_STORAGE,
  VISITOR_KEY_STORAGE,
  isVisitorKey,
} from "@/lib/site-visits.shared";

/** Counts this browser once per day for the admin visitor totals; skipped on admin pages. */
export function VisitTracker() {
  const admin = useRouterState({ select: (s) => s.location.pathname.startsWith("/admin") });
  const record = useServerFn(recordVisit);
  useEffect(() => {
    if (admin) return;
    try {
      const day = riyadhDay();
      if (localStorage.getItem(VISIT_DAY_STORAGE) === day) return;
      let key = localStorage.getItem(VISITOR_KEY_STORAGE);
      if (!isVisitorKey(key)) {
        key = crypto.randomUUID();
        localStorage.setItem(VISITOR_KEY_STORAGE, key);
      }
      void record({ data: { key } })
        .then((r) => {
          if (r.ok) localStorage.setItem(VISIT_DAY_STORAGE, day);
        })
        .catch(() => {
          /* Counting failure must not interrupt the visitor. */
        });
    } catch {
      /* storage blocked: skip counting */
    }
  }, [admin, record]);
  return null;
}
