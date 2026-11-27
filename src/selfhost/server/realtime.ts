import { db, type RequestAuth } from "./db";
import { executeSpec } from "./execute";
import type { Filter } from "../supabase-js/spec";

/**
 * Minimal replacement for Supabase Realtime "postgres_changes": a NOTIFY trigger
 * (selfhost/db/post-migrate.sql) announces row changes, and every Server-Sent-Events stream
 * re-reads the changed row *as the subscriber* so RLS decides what each browser may see.
 */

export type Subscription = {
  id: number;
  event: "INSERT" | "UPDATE" | "DELETE" | "*";
  schema: string;
  table: string;
  filter?: string;
};

type Change = {
  schema: string;
  table: string;
  type: "INSERT" | "UPDATE" | "DELETE";
  id: string | null;
};
type Listener = (change: Change) => void;

const CHANNEL = "ea_hub_realtime";
const listeners = new Set<Listener>();
let listening: Promise<unknown> | undefined;
const MAX_STREAMS = 500;

function ensureListening(): Promise<unknown> {
  if (!listening) {
    listening = db()
      .listen(CHANNEL, (payload) => {
        let change: Change;
        try {
          change = JSON.parse(payload) as Change;
        } catch {
          return;
        }
        for (const l of listeners) l(change);
      })
      .catch((error) => {
        listening = undefined;
        throw error;
      });
  }
  return listening;
}

const SIMPLE_FILTER =
  /^([A-Za-z_][A-Za-z0-9_]*)=(eq|neq|gt|gte|lt|lte)\.(.*)$/s;

function filterOf(sub: Subscription): Filter[] | null {
  if (!sub.filter) return [];
  const m = SIMPLE_FILTER.exec(sub.filter);
  if (!m) return null;
  return [{ kind: "op", column: m[1]!, op: m[2] as "eq", value: m[3]! }];
}

export function realtimeStream(
  subscriptions: Subscription[],
  auth: RequestAuth,
  signal: AbortSignal,
  stillValid: () => Promise<boolean>,
): Response {
  if (listeners.size >= MAX_STREAMS)
    return new Response("Too many realtime connections", { status: 503 });
  const subs = subscriptions
    .filter(
      (s) =>
        s &&
        s.schema === "public" &&
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(s.table)),
    )
    .slice(0, 20);
  const encoder = new TextEncoder();
  let close: () => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          close();
        }
      };
      const listener: Listener = (change) => {
        for (const sub of subs) {
          if (sub.table !== change.table || sub.schema !== change.schema)
            continue;
          if (sub.event !== "*" && sub.event !== change.type) continue;
          void deliver(sub, change);
        }
      };
      const deliver = async (sub: Subscription, change: Change) => {
        const base = {
          schema: change.schema,
          table: change.table,
          commit_timestamp: new Date().toISOString(),
          eventType: change.type,
          errors: null,
        };
        if (change.type === "DELETE") {
          send("change", {
            id: sub.id,
            payload: { ...base, new: {}, old: { id: change.id } },
          });
          return;
        }
        const filters = filterOf(sub);
        if (!filters || !change.id) return;
        const result = await executeSpec(
          {
            schema: "public",
            table: change.table,
            action: "select",
            columns: "*",
            returning: false,
            filters: [
              { kind: "op", column: "id", op: "eq", value: change.id },
              ...filters,
            ],
            order: [],
            limit: 1,
          },
          auth,
        );
        const row = Array.isArray(result.data) ? result.data[0] : null;
        if (!row) return;
        send("change", { id: sub.id, payload: { ...base, new: row, old: {} } });
      };
      try {
        await ensureListening();
      } catch (error) {
        console.error(
          "[selfhost] realtime LISTEN failed",
          (error as Error)?.message ?? error,
        );
        send("error", { message: "realtime unavailable" });
        controller.close();
        return;
      }
      listeners.add(listener);
      send("ready", { subscriptions: subs.map((s) => s.id) });
      const heartbeat = setInterval(async () => {
        if (!(await stillValid())) return close();
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          close();
        }
      }, 25_000);
      close = () => {
        clearInterval(heartbeat);
        listeners.delete(listener);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      signal.addEventListener("abort", () => close(), { once: true });
    },
    cancel() {
      close();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
