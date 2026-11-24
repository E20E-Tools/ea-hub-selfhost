import { needsVisitorReply } from "@/lib/requests.shared";
import { JourneyHeading } from "@/studio/journey-heading";
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Inbox, MessagesSquare, RefreshCw } from "lucide-react";
import { orderChatMessages } from "@/lib/chat-order";
import {
  clarifyRequest,
  getMyChatHistory,
  getMyJourney,
  type TrackedMessage,
} from "@/lib/tracking.functions";
import { currentViewer } from "@/lib/current-visitor-access";
import { supabase } from "@/integrations/supabase/client";
import {
  ASSISTANT_SESSION_EVENT,
  OPEN_ASSISTANT_EVENT,
} from "@/lib/assistant-events";
import { useLanguage } from "@/lib/language";
import type { Copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { pageUrl } from "@/lib/seo";
import { dictionaries } from "@/lib/copy";

export const Route = createFileRoute("/my-requests")({
  head: () => ({
    meta: [
      { title: "My requests and chats — E20E Tools | طلباتي ومحادثاتي" },
      {
        name: "description",
        content:
          "Ownership-verified request status, replies, receipts and related chat messages.",
      },
      { property: "og:title", content: "My requests and chats — E20E Tools" },
      {
        property: "og:description",
        content: "Track your E20E requests without typed-email authorization.",
      },
      { property: "og:url", content: pageUrl("/my-requests") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MyRequestsPage,
});

function MessageList({ messages }: { messages: TrackedMessage[] }) {
  const { language, t } = useLanguage();
  if (!messages.length) return <p>{t("bxNoMessages")}</p>;
  return (
    <div>
      {messages.map((message) => (
        <div className="bx-message" key={message.id}>
          <small>
            {message.sender} ·{" "}
            {new Date(message.created_at).toLocaleString(
              language === "ar" ? "ar-SA" : "en-GB",
            )}
          </small>
          <span dir="auto">{message.body}</span>
        </div>
      ))}
    </div>
  );
}

/** Lazily pages one conversation (newest first) after the server re-checks ownership. */
function ChatHistory({
  chatId,
  access,
  generation,
  label,
}: {
  chatId: string;
  access: string;
  generation: number;
  label: string;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const history = useInfiniteQuery({
    queryKey: ["my-chat-history", generation, chatId],
    queryFn: ({ pageParam }) =>
      getMyChatHistory({ data: { access, chatId, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.status === "ok" && last.hasMore ? last.nextOffset : undefined,
    enabled: open,
    retry: 1,
  });
  const pages = history.data?.pages ?? [];
  const denied = pages.some((page) => page.status !== "ok");
  const messages = orderChatMessages(
    pages.flatMap((page) => (page.status === "ok" ? page.messages : [])),
  );
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{label}</summary>
      {!open ? null : history.isPending ? (
        <p role="status">{t("bxHistoryLoading")}</p>
      ) : history.isError ? (
        <div role="alert">
          <p>{t("bxHistoryError")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void history.refetch()}
          >
            <RefreshCw aria-hidden="true" />
            {t("retry")}
          </Button>
        </div>
      ) : denied ? (
        <p role="alert">{t("bxHistoryNotFound")}</p>
      ) : (
        <>
          {history.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              {history.isFetchingNextPage
                ? t("bxHistoryLoading")
                : t("bxHistoryLoadOlder")}
            </Button>
          ) : (
            messages.length > 0 && (
              <p className="text-sm">{t("bxHistoryStart")}</p>
            )
          )}
          {history.isFetchNextPageError && (
            <p role="alert">{t("bxHistoryError")}</p>
          )}
          <MessageList messages={messages} />
        </>
      )}
    </details>
  );
}

function MyRequestsPage() {
  const { language, dir, t } = useLanguage();
  const queryClient = useQueryClient();
  const [viewer, setViewer] = useState<{
    token: string;
    accountId: string;
  } | null>(null);
  const [generation, setGeneration] = useState(0);
  const accessRef = useRef<string | null>(null);
  const access = viewer ? viewer.token : null;
  // A signed-in account is tracked through its verified session even without an Archy pass.
  const canTrack = Boolean(viewer);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const show = (next: { token: string; accountId: string } | null) => {
      const key = next ? `${next.accountId}|${next.token}` : null;
      if (accessRef.current === key) return;
      accessRef.current = key;
      // Drop every cached overview/history before the next owner's state can render.
      queryClient.removeQueries({ queryKey: ["my-journey"] });
      queryClient.removeQueries({ queryKey: ["my-chat-history"] });
      setViewer(next);
      setGeneration((value) => value + 1);
    };
    const refresh = async (identityChanged: boolean) => {
      const mine = ++sequence;
      // Sign-in/out hides the previous owner's data at once, not after the next read resolves.
      if (identityChanged) show(null);
      const next = await currentViewer();
      // Only the newest read may apply, so a slow earlier read cannot restore a previous owner.
      if (!active || mine !== sequence) return;
      show(next);
    };
    void refresh(false);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // Token refreshes keep the same owner; every other auth event may change it.
      void refresh(event !== "TOKEN_REFRESHED" && event !== "INITIAL_SESSION");
    });
    // A guest pass saved or expired is an identity transition too: hide rows at once.
    const onSession = () => void refresh(true);
    window.addEventListener(ASSISTANT_SESSION_EVENT, onSession);
    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener(ASSISTANT_SESSION_EVENT, onSession);
    };
  }, [queryClient]);
  const query = useQuery({
    queryKey: ["my-journey", generation],
    queryFn: () => getMyJourney({ data: { access: access ?? "" } }),
    enabled: canTrack,
    refetchInterval: canTrack ? 15000 : false,
    retry: 1,
  });
  const data = query.data;
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (data?.status === "ok" && /^receipt-[a-f0-9-]{36}$/.test(id))
      document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [data?.status]);
  const [selectedList, setListView] = useState<"requests" | "chats" | null>(
    null,
  );
  const listView =
    selectedList ??
    (data?.status === "ok" && !data.requests.length && data.chats.length
      ? "chats"
      : "requests");
  const openArchy = () => window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT));
  const requestStatus = (status: string) =>
    t(`bxRequestStatus_${status}` as keyof Copy);
  const chatStatus = (status: string) =>
    t(`bxChatStatus_${status}` as keyof Copy);
  const nextAction = (status: string) =>
    status === "new" || status === "in_progress"
      ? t("bxNextWait")
      : status === "resolved"
        ? t("bxNextNone")
        : t("bxNextContact");
  const formatDate = (value: string | null) =>
    value
      ? new Date(value).toLocaleString(language === "ar" ? "ar-SA" : "en-GB")
      : "—";
  return (
    <main className="bx-page ea-workspace ea-my-requests" dir={dir}>
      <JourneyHeading
        icon={Inbox}
        title={t("bxTrackingTitle")}
        description={t("bxTrackingLead")}
      />
      {viewer === null || (query.isPending && canTrack) ? (
        <section className="bx-panel" role="status">
          <p>…</p>
        </section>
      ) : !canTrack || data?.status === "unauthorized" ? (
        <section className="bx-panel">
          <h2>{t("bxTrackingOpenArchy")}</h2>
          <p>{t("bxTrackingNeedIdentity")}</p>
          <Button type="button" onClick={openArchy}>
            <MessagesSquare aria-hidden="true" />
            {t("bxTrackingOpenArchy")}
          </Button>
        </section>
      ) : query.isError ? (
        <section className="bx-panel" role="alert">
          <p>{t("bxTrackingError")}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void query.refetch()}
          >
            <RefreshCw aria-hidden="true" />
            {t("retry")}
          </Button>
        </section>
      ) : data?.status === "ok" ? (
        <>
          <div className="bx-actions">
            <Button asChild>
              <Link to="/request" search={{ type: "general" }}>
                {t("requestCta")}
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw aria-hidden="true" />
              {language === "ar" ? "تحديث" : "Refresh"}
            </Button>
          </div>
          {!data.requests.length && !data.chats.length && (
            <div className="bx-empty mt-5" role="status">
              {t("bxTrackingEmpty")}
            </div>
          )}
          <div
            className="ea-view-switch"
            role="group"
            aria-label={t("bxTrackingTitle")}
          >
            <button
              type="button"
              aria-pressed={listView === "requests"}
              onClick={() => setListView("requests")}
            >
              {t("bxTrackingRequests")} <b>{data.requests.length}</b>
            </button>
            <button
              type="button"
              aria-pressed={listView === "chats"}
              onClick={() => setListView("chats")}
            >
              {t("bxTrackingChats")} <b>{data.chats.length}</b>
            </button>
          </div>
          <section
            hidden={listView !== "requests"}
            className="mt-7"
            aria-labelledby="tracked-requests"
          >
            <h2 id="tracked-requests">
              {t("bxTrackingRequests")} · {data.requests.length}
            </h2>
            {!data.requests.length && data.chats.length > 0 && (
              <p className="bx-empty">
                {language === "ar"
                  ? "لم تُسجَّل طلبات لهذه الهوية بعد."
                  : "No requests are linked to this identity yet."}
              </p>
            )}
            {data.requests.some(needsVisitorReply) && (
              <section
                className="bx-panel mb-4"
                aria-labelledby="awaiting-response"
              >
                <h3 id="awaiting-response">
                  {language === "ar" ? "يحتاج ردّك" : "Needs your reply"}
                </h3>
                <ul className="grid gap-3">
                  {data.requests.filter(needsVisitorReply).map((request) => (
                    <li key={request.id}>
                      <p dir="auto">{request.pending_question}</p>
                      <a
                        className="underline"
                        href={"#reply-" + request.id}
                        onClick={() =>
                          document
                            .getElementById("reply-" + request.id)
                            ?.focus()
                        }
                      >
                        {language === "ar" ? "أضف ردّك" : "Add your reply"}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.requestsHasMore && (
              <p className="bx-limit-note" role="note">
                {t("bxListLimitedRequests")}
              </p>
            )}
            {data.repliesHasMore && (
              <p className="bx-limit-note" role="note">
                {t("bxRepliesLimited")}
              </p>
            )}
            <div className="bx-tracking-grid mt-4">
              {[...data.requests]
                .sort(
                  (a, b) =>
                    Number(needsVisitorReply(b)) - Number(needsVisitorReply(a)),
                )
                .map((request) => {
                  const replies = data.replies.filter(
                    (reply) => reply.request_id === request.id,
                  );
                  const active = ["new", "in_progress"].includes(
                    request.status,
                  );
                  const pending = needsVisitorReply(request)
                    ? request.pending_question || ""
                    : "";
                  const next = pending
                    ? language === "ar"
                      ? "بانتظار ردّك"
                      : "Waiting for your response"
                    : active
                      ? language === "ar"
                        ? "بانتظار مراجعة الفريق"
                        : "Waiting for team review"
                      : nextAction(request.status);
                  return (
                    <article
                      className="bx-tracking-card"
                      id={"receipt-" + request.id}
                      key={request.id}
                    >
                      <header>
                        <h3>
                          {t(`rqType_${request.request_type}` as keyof Copy)}
                        </h3>
                        <strong>{requestStatus(request.status)}</strong>
                      </header>
                      <dl>
                        <div>
                          <dt>{t("bxReceipt")}</dt>
                          <dd dir="ltr">{request.id}</dd>
                        </div>
                        <div>
                          <dt>{t("bxLastUpdate")}</dt>
                          <dd>
                            {formatDate(
                              [
                                request.status_updated_at ?? request.created_at,
                                ...replies.map((r) => r.created_at),
                              ]
                                .sort()
                                .at(-1) ?? request.created_at,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>{t("bxNextAction")}</dt>
                          <dd>{next}</dd>
                        </div>
                        <div>
                          <dt>{t("bxAttachments")}</dt>
                          <dd>{request.attachmentCount}</dd>
                        </div>
                      </dl>
                      <p className="mt-4 whitespace-pre-wrap">{request.need}</p>
                      <details className="ea-request-history">
                        <summary>
                          {language === "ar" ? "سجل الطلب" : "Request timeline"}
                        </summary>
                        <ol>
                          {[
                            {
                              id: "submitted",
                              at: request.created_at,
                              title: t("requestReceivedTitle"),
                              body: "",
                            },
                            ...(data.statusEvents ?? [])
                              .filter((event) => event.requestId === request.id)
                              .map((event) => ({
                                id: "status-" + event.id,
                                at: event.at,
                                title: requestStatus(event.status),
                                body: "",
                              })),
                            ...replies.map((reply) => ({
                              id: reply.id,
                              at: reply.created_at,
                              title:
                                reply.author_kind === "visitor"
                                  ? language === "ar"
                                    ? "توضيحك"
                                    : "Your clarification"
                                  : language === "ar"
                                    ? "رد الفريق"
                                    : "Team reply",
                              body: reply.body,
                            })),
                          ]
                            .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
                            .map((event) => (
                              <li key={event.id}>
                                <strong>{event.title}</strong> ·{" "}
                                <time dateTime={event.at}>
                                  {formatDate(event.at)}
                                </time>
                                {event.body && <p dir="auto">{event.body}</p>}
                              </li>
                            ))}
                        </ol>
                        {data.historyHasMore && (
                          <p>
                            {language === "ar"
                              ? "تُعرض أحدث تحديثات الحالة المتاحة."
                              : "Showing the most recent recorded status updates."}
                          </p>
                        )}
                      </details>
                      {request.exercise && (
                        <pre className="whitespace-pre-wrap">
                          {request.exercise}
                        </pre>
                      )}
                      <Clarification
                        question={pending}
                        key={generation + request.id}
                        id={request.id}
                        access={access ?? ""}
                        ar={language === "ar"}
                        refresh={() => void query.refetch()}
                      />
                      {request.chatId && (
                        <ChatHistory
                          chatId={request.chatId}
                          access={access ?? ""}
                          generation={generation}
                          label={t("bxMessages")}
                        />
                      )}
                    </article>
                  );
                })}
            </div>
          </section>
          <section
            hidden={listView !== "chats"}
            className="mt-8"
            aria-labelledby="tracked-chats"
          >
            <h2 id="tracked-chats">
              {t("bxTrackingChats")} · {data.chats.length}
            </h2>
            {!data.chats.length && data.requests.length > 0 && (
              <p className="bx-empty">
                {language === "ar"
                  ? "لم تبدأ محادثات بهذه الهوية بعد."
                  : "No chats are linked to this identity yet."}
              </p>
            )}
            {data.chatsHasMore && (
              <p className="bx-limit-note" role="note">
                {t("bxListLimitedChats")}
              </p>
            )}
            <div className="bx-tracking-grid mt-4">
              {data.chats.map((chat) => (
                <article className="bx-tracking-card" key={chat.id}>
                  <header>
                    <h3 dir="ltr">{chat.id}</h3>
                    <strong>{chatStatus(chat.status)}</strong>
                  </header>
                  <dl>
                    <div>
                      <dt>{t("bxLastUpdate")}</dt>
                      <dd>{formatDate(chat.last_message_at)}</dd>
                    </div>
                    <div>
                      <dt>{t("bxStatus")}</dt>
                      <dd>{chatStatus(chat.status)}</dd>
                    </div>
                  </dl>
                  <ChatHistory
                    chatId={chat.id}
                    access={access ?? ""}
                    generation={generation}
                    label={t("bxMessages")}
                  />
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

function Clarification({
  id,
  access,
  ar,
  refresh,
  question,
}: {
  question: string;
  id: string;
  access: string;
  ar: boolean;
  refresh: () => void;
}) {
  const [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const note = useRef("");
  return (
    <details key={question} open={!!question || undefined}>
      <summary>
        {question || dictionaries[ar ? "ar" : "en"].myRequestsAddAClarification}
      </summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setMessage("");
          note.current ||= crypto.randomUUID();
          try {
            const result = await clarifyRequest({
              data: { access, requestId: id, noteId: note.current, body },
            });
            if (!result.ok) throw Error();
            setBody("");
            note.current = "";
            setMessage(
              dictionaries[ar ? "ar" : "en"].myRequestsClarificationAddedToYour,
            );
            refresh();
          } catch {
            setMessage(
              dictionaries[ar ? "ar" : "en"].myRequestsCouldNotSaveYour,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="grid gap-2">
          {dictionaries[ar ? "ar" : "en"].myRequestsNoteForTheTeam}
          <textarea
            id={"reply-" + id}
            required
            minLength={2}
            maxLength={1500}
            disabled={busy}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              note.current = "";
            }}
          />
        </label>
        <Button disabled={busy}>
          {dictionaries[ar ? "ar" : "en"].myRequestsSaveClarification}
        </Button>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}
