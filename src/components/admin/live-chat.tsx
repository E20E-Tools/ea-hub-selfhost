import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  adminChatVisitorSupport,
  adminCloseLiveChat,
  adminSendLiveMessage,
} from "@/lib/live-chat.functions";
import { cn } from "@/lib/utils";
import { orderChatMessages } from "@/lib/chat-order";
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeader, useAdminCopy } from "./ui";
import { FaqReplies } from "./faq-replies";

type Chat = {
  id: string;
  visitor_name: string;
  visitor_email: string;
  status: string;
  requested_at: string | null;
  last_message_at: string;
  created_at: string;
  start_page: string;
  last_page: string;
  admin_email: string | null;
};
type Msg = { id: string; sender: string; body: string; created_at: string };

const chatsKey = ["admin", "live-chats"] as const;

async function loadChats(): Promise<Chat[]> {
  const { data, error } = await supabase
    .from("live_chats")
    .select(
      "id, visitor_name, visitor_email, status, requested_at, last_message_at, created_at, start_page, last_page, admin_email",
    )
    .order("last_message_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

/** Short beep through Web Audio; silently skipped when the browser blocks sound. */
function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.onended = () => {
      void ctx.close().catch(() => undefined);
    };
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    /* no audio */
  }
}

/**
 * Watches chats while the admin console is open: refreshes the list and alerts (toast + sound)
 * when a visitor asks for a person. Returns how many chats are waiting.
 */
export function useLiveChatAlerts(enabled: boolean, openChat: () => void): number {
  const { t } = useAdminCopy();
  const queryClient = useQueryClient();
  const chats = useQuery({
    queryKey: chatsKey,
    queryFn: loadChats,
    enabled,
    refetchInterval: 60_000,
  });
  const seen = useRef<Map<string, string | null> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`admin-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_chats" }, () => {
        void queryClient.invalidateQueries({ queryKey: chatsKey });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
  useEffect(() => {
    if (!chats.data) return;
    const prev = seen.current;
    const next = new Map(
      chats.data.map((c) => [c.id, c.status === "waiting" ? c.requested_at : null]),
    );
    seen.current = next;
    if (!prev) return;
    for (const chat of chats.data) {
      if (
        chat.status === "waiting" &&
        chat.requested_at &&
        prev.get(chat.id) !== chat.requested_at
      ) {
        beep();
        toast.info(t("lcAlert", { name: chat.visitor_name || chat.visitor_email }), {
          action: { label: t("lcOpen"), onClick: openChat },
          duration: 30_000,
        });
      }
    }
  }, [chats.data, t, openChat]);
  return chats.data?.filter((c) => c.status === "waiting").length ?? 0;
}

export function LiveChatSection({
  email,
  embedded = false,
}: { email?: string; embedded?: boolean } = {}) {
  const { t, date } = useAdminCopy();
  const queryClient = useQueryClient();
  const chats = useQuery({ queryKey: chatsKey, queryFn: loadChats });
  const [selected, setSelected] = useState<string | null>(null);
  const [waitingOnly, setWaitingOnly] = useState(false);
  const list = (chats.data ?? []).filter(
    (c) =>
      (!waitingOnly || c.status === "waiting") &&
      (!email || c.visitor_email.toLowerCase() === email.toLowerCase()),
  );
  const current = chats.data?.find((c) => c.id === selected) ?? null;

  return (
    <div>
      {!embedded ? (
        <PageHeader title={t("navLiveChat")} description={t("navLiveChatDesc")} />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-lg border border-border bg-card">
          <label className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={waitingOnly}
              onChange={(e) => setWaitingOnly(e.target.checked)}
            />
            {t("lcWaitingOnly")}
          </label>
          {chats.isError ? (
            <ErrorBlock onRetry={() => void chats.refetch()} />
          ) : chats.isLoading ? (
            <div className="p-3">
              <LoadingBlock rows={4} />
            </div>
          ) : list.length === 0 ? (
            <div className="p-3">
              <EmptyBlock text={t("lcEmpty")} />
            </div>
          ) : (
            <ul className="max-h-[70dvh] overflow-y-auto">
              {list.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(chat.id)}
                    aria-current={chat.id === selected ? "true" : undefined}
                    className={cn(
                      "grid w-full min-w-0 gap-1 border-b border-border px-3 py-2 text-start text-sm hover:bg-muted/60",
                      chat.id === selected && "bg-muted",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2 min-w-0">
                      <strong className="min-w-0 truncate">
                        {chat.visitor_name || chat.visitor_email}
                      </strong>
                      <Badge
                        className="shrink-0"
                        variant={
                          chat.status === "waiting"
                            ? "destructive"
                            : chat.status === "active"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {t(`lcStatus_${chat.status}`)}
                      </Badge>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {chat.visitor_email}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {date(chat.last_message_at, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        {current ? (
          <ChatThread
            key={current.id}
            chat={current}
            onChanged={() => void queryClient.invalidateQueries({ queryKey: chatsKey })}
          />
        ) : (
          <div className="rounded-lg border border-border bg-card p-6">
            <EmptyBlock text={t("lcSelect")} />
          </div>
        )}
      </div>
    </div>
  );
}

function ChatThread({ chat, onChanged }: { chat: Chat; onChanged: () => void }) {
  const { t, date } = useAdminCopy();
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [retry, setRetry] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = useServerFn(adminSendLiveMessage);
  const close = useServerFn(adminCloseLiveChat);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingOlder(true);
      setLoadError(false);
      try {
        const { data, error } = await supabase
          .from("live_chat_messages")
          .select("id, sender, body, created_at")
          .eq("chat_id", chat.id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + 100);
        if (error) throw error;
        if (active) {
          const page = (data ?? []).slice(0, 100).reverse();
          setMessages((prev) => {
            return orderChatMessages([...page, ...(prev ?? [])]);
          });
          setHasMore((data?.length ?? 0) > 100);
        }
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoadingOlder(false);
      }
    };
    void load();
    const channel = supabase
      .channel(`admin-thread-${chat.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_chat_messages",
          filter: `chat_id=eq.${chat.id}`,
        },
        (payload) => {
          const row = payload.new as Msg;
          setMessages((prev) =>
            prev && !prev.some((m) => m.id === row.id) ? orderChatMessages([...prev, row]) : prev,
          );
        },
      )
      .subscribe();
    inputRef.current?.focus();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [chat.id, offset, retry]);

  useEffect(() => {
    void endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await send({ data: { chatId: chat.id, body } });
      setText("");
      onChanged();
    } catch {
      toast.error(t("lcErrSend"));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <section className="flex min-h-[60dvh] flex-col rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <strong className="block truncate">{chat.visitor_name || chat.visitor_email}</strong>
          <a
            className="text-xs text-muted-foreground underline"
            href={`mailto:${chat.visitor_email}`}
          >
            {chat.visitor_email}
          </a>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t(`lcStatus_${chat.status}`)}</Badge>
          {chat.status !== "closed" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await close({ data: { chatId: chat.id } });
                  onChanged();
                } catch {
                  toast.error(t("lcErrSend"));
                }
              }}
            >
              <X className="size-4" /> {t("lcClose")}
            </Button>
          ) : null}
        </div>
      </header>
      <ChatDetails
        chat={chat}
        messageCount={messages?.filter((m) => m.sender !== "system").length ?? null}
      />
      <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "60dvh" }}>
        {loadError && <ErrorBlock onRetry={() => setRetry((n) => n + 1)} />}
        {hasMore && (
          <Button
            size="sm"
            variant="outline"
            disabled={loadingOlder}
            onClick={() => setOffset((n) => n + 100)}
          >
            {t("lcOlderMessages")}
          </Button>
        )}
        {messages === null ? (
          <LoadingBlock rows={3} />
        ) : (
          messages.map((m) =>
            m.sender === "system" ? (
              <p key={m.id} className="text-center text-xs text-muted-foreground">
                {t(`lcSys_${m.body}`)} · {date(m.created_at, { timeStyle: "short" })}
              </p>
            ) : (
              <div
                key={m.id}
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                  m.sender === "admin"
                    ? "ms-auto bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                <span className="mb-1 block text-xs opacity-75">
                  {t(`lcSender_${m.sender}`)} ·{" "}
                  {date(m.created_at, { dateStyle: "short", timeStyle: "short" })}
                </span>
                <p dir="auto" className="whitespace-pre-wrap break-words">
                  {m.body}
                </p>
              </div>
            ),
          )
        )}
        <div ref={endRef} />
      </div>
      <FaqReplies
        onChoose={(answer) => {
          setText(answer);
          inputRef.current?.focus();
        }}
      />
      <form className="flex items-end gap-2 border-t border-border p-3" onSubmit={submit}>
        <Textarea
          ref={inputRef}
          value={text}
          rows={2}
          maxLength={2000}
          placeholder={t("lcReply")}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <Button type="submit" disabled={busy || !text.trim()} aria-label={t("lcSend")}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </section>
  );
}

/** Visitor details for one chat: dates, message count, start page and their support requests. */
function ChatDetails({ chat, messageCount }: { chat: Chat; messageCount: number | null }) {
  const { t, date } = useAdminCopy();
  const readSupport = useServerFn(adminChatVisitorSupport);
  const support = useQuery({
    queryKey: ["admin", "chat-support", chat.id],
    queryFn: () => readSupport({ data: { chatId: chat.id } }),
    refetchInterval: 30_000,
  });
  const item = (label: string, value: ReactNode) => (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
  return (
    <section
      aria-label={t("lcDetails")}
      className="border-b border-border bg-muted/30 px-4 py-3 text-sm"
    >
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {item(t("lcStarted"), date(chat.created_at, { dateStyle: "medium", timeStyle: "short" }))}
        {item(
          t("lcLastMessage"),
          date(chat.last_message_at, { dateStyle: "medium", timeStyle: "short" }),
        )}
        {item(t("lcMessages"), messageCount ?? "…")}
        {item(
          t("lcVisitPage"),
          chat.start_page && /^\/(?![/\\])/.test(chat.start_page) ? (
            <a
              className="underline"
              dir="ltr"
              href={chat.start_page}
              target="_blank"
              rel="noreferrer"
            >
              {chat.start_page}
            </a>
          ) : (
            t("lcVisitUnknown")
          ),
        )}
        {chat.admin_email
          ? item(t("lcHandledBy"), <span dir="ltr">{chat.admin_email}</span>)
          : null}
      </dl>
      <div className="mt-3">
        <p className="text-xs text-muted-foreground">{t("lcSupport")}</p>
        {support.isLoading ? (
          <p className="text-xs">…</p>
        ) : support.isError ? (
          <p className="text-xs text-destructive">{t("lcSupportError")}</p>
        ) : (support.data ?? []).length === 0 ? (
          <p className="text-xs">{t("lcSupportNone")}</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-2">
            {(support.data ?? []).slice(0, 8).map((r) => (
              <li key={r.id}>
                <Badge variant={r.status === "new" ? "destructive" : "secondary"}>
                  {r.kind} · {r.status} · {date(r.created_at, { dateStyle: "short" })}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
