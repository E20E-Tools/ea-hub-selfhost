import { currentAuthUser } from "./current-visitor-access";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isPublicProductId } from "./my-tools";
import {
  PUBLIC_REQUEST_TYPES,
  SERVICE_KINDS,
  SERVICE_TIMELINES,
  TEAM_SIZES,
  URGENCIES,
} from "./requests.shared";

export type RequestDraftKind = "request" | "service";
export type DraftStatus = "loading" | "saved" | "unavailable";
type DraftRecord = { version: 1; includePersonal: boolean; values: Record<string, unknown> };
const NON_SENSITIVE: Record<RequestDraftKind, string[]> = {
  request: ["type", "productId", "urgency"],
  service: ["services", "tools", "teamSize", "timeline"],
};
const PERSONAL = ["name", "email", "company", "phone", "need", "impact", "exercise"];
const MAX: Record<string, number> = {
  name: 100,
  email: 255,
  company: 150,
  phone: 20,
  need: 2000,
  impact: 1000,
  exercise:2000,
  urgency: 10,
  teamSize: 20,
  timeline: 20,
};

function cleanString(value: unknown, key: string): string {
  return typeof value === "string" ? value.slice(0, MAX[key] ?? 80) : "";
}
function cleanField(key: string, value: unknown): unknown {
  if (key === "productId") return isPublicProductId(value) ? value : "";
  if (key === "type")
    return typeof value === "string" && PUBLIC_REQUEST_TYPES.includes(value as never)
      ? value
      : "new";
  if (key === "urgency")
    return typeof value === "string" && URGENCIES.includes(value as never) ? value : "";
  if (key === "teamSize")
    return typeof value === "string" && (value === "" || TEAM_SIZES.includes(value as never))
      ? value
      : "";
  if (key === "timeline")
    return typeof value === "string" && (value === "" || SERVICE_TIMELINES.includes(value as never))
      ? value
      : "";
  if (key === "services")
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter((x) => typeof x === "string" && SERVICE_KINDS.includes(x as never)),
          ),
        ].slice(0, 4)
      : [];
  if (key === "tools")
    return Array.isArray(value) ? [...new Set(value.filter(isPublicProductId))].slice(0, 60) : [];
  return cleanString(value, key);
}

/** Whitelisted session data only: no files, access tokens, credentials or arbitrary keys. */
export function sanitizeRequestDraft(
  kind: RequestDraftKind,
  value: Record<string, unknown>,
  includePersonal: boolean,
): DraftRecord {
  const values: Record<string, unknown> = {};
  for (const key of NON_SENSITIVE[kind]) values[key] = cleanField(key, value[key]);
  if (includePersonal)
    for (const key of PERSONAL) if (key in value) values[key] = cleanField(key, value[key]);
  return { version: 1, includePersonal, values };
}
export function parseRequestDraft(raw: string | null): DraftRecord | null {
  if (!raw) return null;
  try {
    const row = JSON.parse(raw) as Record<string, unknown>;
    if (
      !row ||
      row["version"] !== 1 ||
      typeof row["includePersonal"] !== "boolean" ||
      !row["values"] ||
      typeof row["values"] !== "object" ||
      Array.isArray(row["values"])
    )
      return null;
    const includePersonal = row["includePersonal"];
    const kind: RequestDraftKind = "services" in (row["values"] as object) ? "service" : "request";
    return sanitizeRequestDraft(kind, row["values"] as Record<string, unknown>, includePersonal);
  } catch {
    return null;
  }
}
export function requestDraftKey(kind: RequestDraftKind, owner: string): string {
  return `e20e-request-draft-v2:${kind}:${owner === "guest" ? "guest" : `account-${owner}`}`;
}
function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Session-scoped form draft bound to exactly one owner (guest or account id).
 * - Stale reads: the initial getUser() result is ignored once any auth event has applied.
 * - Identity change (any event, including direct A→B sign-in): the previous owner's draft is
 *   removed, in-memory fields are reset via `reset`, and only the new owner's record is restored.
 * - Same-owner events (token refresh, repeated sign-in) never re-read storage, so edits survive.
 * - Writes target the owner held in state, which changes in the same render as the reset fields,
 *   so one owner's values can never be persisted under another owner's key.
 * - `clear()` (discard or confirmed receipt) suspends writes until the visitor edits again.
 */
export function useRequestDraft<T extends Record<string, unknown>>(
  kind: RequestDraftKind,
  value: T,
  restore: (values: Record<string, unknown>) => void,
  reset: () => void = () => {},
) {
  const [owner, setOwner] = useState("");
  const [includePersonal, setIncludePersonal] = useState(false);
  const [status, setStatus] = useState<DraftStatus>("loading");
  const [suspended, setSuspended] = useState(false);
  const ownerRef = useRef("");
  const snapshotRef = useRef<string | null>(null);
  const initialValueRef = useRef(JSON.stringify(value));
  const valueRef = useRef(value);
  const restoreRef = useRef(restore);
  const resetRef = useRef(reset);
  valueRef.current = value;
  restoreRef.current = restore;
  resetRef.current = reset;

  useEffect(() => {
    let active = true;
    let authEventApplied = false;
    const apply = (next: string) => {
      if (!active) return;
      const previous = ownerRef.current;
      if (previous === next) return;
      const store = sessionStore();
      if (previous) {
        try {
          store?.removeItem(requestDraftKey(kind, previous));
        } catch {
          /* unavailable */
        }
      }
      ownerRef.current = next;
      let record: DraftRecord | null = null;
      try {
        record = parseRequestDraft(store?.getItem(requestDraftKey(kind, next)) ?? null);
      } catch {
        record = null;
      }
      if (previous) {
        // Never carry the previous owner's fields (or opt-in) into the new identity.
        resetRef.current();
        if (record) restoreRef.current(record.values);
      } else if (record && JSON.stringify(valueRef.current) === initialValueRef.current) {
        // First owner resolution: restore only if the visitor has not started typing.
        restoreRef.current(record.values);
      }
      snapshotRef.current = null;
      setSuspended(false);
      setIncludePersonal(record?.includePersonal ?? false);
      setStatus(store ? "saved" : "unavailable");
      setOwner(next);
    };
    // Only a true guest (no stored sign-in) uses the guest draft; a stored sign-in that
    // cannot be confirmed loads no draft until the next auth event settles the owner.
    void currentAuthUser().then((auth) => {
      if (!authEventApplied && auth) apply(auth.kind === "account" ? auth.user.id : "guest");
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventApplied = true;
      apply(session?.user?.id ?? "guest");
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [kind]);

  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!owner || owner !== ownerRef.current) return;
    if (suspended) {
      if (snapshotRef.current === null) {
        snapshotRef.current = serialized;
        return;
      }
      if (snapshotRef.current === serialized) return;
      snapshotRef.current = null;
      setSuspended(false);
    }
    try {
      const store = sessionStore();
      if (!store) throw new Error("unavailable");
      store.setItem(
        requestDraftKey(kind, owner),
        JSON.stringify(sanitizeRequestDraft(kind, valueRef.current, includePersonal)),
      );
      setStatus("saved");
    } catch {
      setStatus("unavailable");
    }
  }, [kind, serialized, includePersonal, owner, suspended]);

  const clear = () => {
    try {
      if (ownerRef.current) sessionStore()?.removeItem(requestDraftKey(kind, ownerRef.current));
    } catch {
      /* unavailable */
    }
    snapshotRef.current = null;
    setSuspended(true);
    setIncludePersonal(false);
  };
  const changePersonal = (next: boolean) => {
    snapshotRef.current = null;
    setSuspended(false);
    setIncludePersonal(next);
  };
  return {
    ready: owner !== "",
    includePersonal,
    setIncludePersonal: changePersonal,
    status,
    clear,
  };
}
