import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { recordVisit } from "@/lib/site-visits.functions";
import {
  riyadhDay,
  PRODUCT_VIEW_DAY_STORAGE,
  VISIT_DAY_STORAGE,
  VISITOR_KEY_STORAGE,
  isVisitorKey,
} from "@/lib/site-visits.shared";

/** Counts this browser once per day for the admin visitor totals; skipped on admin pages. */
export function VisitTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const admin = pathname.startsWith("/admin");
  const product = /^\/product\/[^/]+/.test(pathname);
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
  // A second, separate mark the first time this browser opens any product page today.
  useEffect(() => {
    if (!product) return;
    try {
      const day = riyadhDay();
      if (localStorage.getItem(PRODUCT_VIEW_DAY_STORAGE) === day) return;
      const key = localStorage.getItem(VISITOR_KEY_STORAGE);
      if (!isVisitorKey(key)) return; // the site visit above creates it; next page view counts
      void record({ data: { key, kind: "product" } })
        .then((r) => {
          if (r.ok) localStorage.setItem(PRODUCT_VIEW_DAY_STORAGE, day);
        })
        .catch(() => {});
    } catch {
      /* storage blocked: skip counting */
    }
  }, [product, record]);
  return null;
}
