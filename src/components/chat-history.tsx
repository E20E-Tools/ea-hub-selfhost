import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Star } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Textarea } from "@/components/ui/textarea";
import { readVisitorChats } from "@/lib/live-chat.functions";
import { rateLiveChat, readVisitorRating } from "@/lib/chat-feedback.functions";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { formatDate } from "@/lib/format-date";
import { orderChatMessages } from "@/lib/chat-order";
import { ChatMarkdown } from "@/components/chat-markdown";

type Chat = { id: string; status: string; created_at: string; last_message_at: string };
type Msg = { id: string; sender: string; body: string; created_at: string };

/** Paginated history verified through the signed guest identity. */
export function ChatHistory({
  onClose,
  access,
  onOpenProduct,
}: {
  onClose: () => void;
  access: string;
  onOpenProduct?: ((productId: string) => boolean | void) | undefined;
}) {
  const { t, language, dir } = useLanguage();
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [open, setOpen] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;

  const [error, setError] = useState(false);
  const [offset, setOffset] = useState(0);
  const [messageOffset, setMessageOffset] = useState(0);
  const [moreChats, setMoreChats] = useState(false);
  const [moreMessages, setMoreMessages] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    void readVisitorChats({ data: { access, offset } })
      .then((result) => {
        if (!active) return;
        setChats((prev) => (offset === 0 ? result.chats : [...(prev ?? []), ...result.chats]));
        setMoreChats(result.hasMore);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [access, offset, retry]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(false);
    if (messageOffset === 0) setMessages(null);
    void readVisitorChats({ data: { access, chatId: open.id, offset: messageOffset } })
      .then((result) => {
        if (!active) return;
        setMessages((prev) =>
          orderChatMessages(
            messageOffset === 0 ? result.messages : [...result.messages, ...(prev ?? [])],
          ),
        );
        setMoreMessages(result.hasMore);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [open, access, messageOffset, retry]);

  const when = (v: string) => formatDate(v, language, { dateStyle: "medium", timeStyle: "short" });
  const statusLabel = (s: string) =>
    s === "waiting"
      ? t("histWaiting")
      : s === "active"
        ? t("histActive")
        : s === "closed"
          ? t("histClosed")
          : t("histAi");

  return (
    <div className="assistant-log chat-history">
      <div className="chat-history-head">
        <Button variant="ghost" size="sm" onClick={open ? () => setOpen(null) : onClose}>
          <Back className="size-4" /> {open ? t("histAll") : t("histBackToChat")}
        </Button>
        <strong>{open ? when(open.created_at) : t("histTitle")}</strong>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t("chatFailed")}{" "}
          <Button variant="ghost" size="sm" onClick={() => setRetry((n) => n + 1)}>
            {t("histRetry")}
          </Button>
        </p>
      )}
      {!open ? (
        chats === null ? (
          <Loader2 className="size-4 animate-spin" />
        ) : chats.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("histEmpty")}</p>
        ) : (
          <>
            <ul className="chat-history-list">
              {chats.map((c) => (
                <li key={c.id}>
                  <Button
                    variant="ghost"
                    type="button"
                    className="chat-history-item h-auto"
                    onClick={() => {
                      setMessages(null);
                      setMessageOffset(0);
                      setOpen(c);
                    }}
                  >
                    <span className="chat-history-row">
                      <span className="chat-history-badge" data-status={c.status}>
                        {statusLabel(c.status)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {when(c.last_message_at)}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
            {moreChats && (
              <Button variant="outline" size="sm" onClick={() => setOffset((n) => n + 50)}>
                {t("histMoreChats")}
              </Button>
            )}
          </>
        )
      ) : messages === null ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <>
          {moreMessages && (
            <Button variant="outline" size="sm" onClick={() => setMessageOffset((n) => n + 100)}>
              {t("histOlderMessages")}
            </Button>
          )}
          {messages.map((m) =>
            m.sender === "system" ? (
              <p key={m.id} className="text-center text-xs text-muted-foreground">
                {m.body === "requested"
                  ? t("histSysRequested")
                  : m.body === "joined"
                    ? t("humanJoined")
                    : t("histSysClosed")}
              </p>
            ) : (
              <div
                key={m.id}
                className={`assistant-msg ${m.sender === "visitor" ? "user" : "assistant"}`}
              >
                {m.sender !== "visitor" && (
                  <span className="block text-xs text-muted-foreground">
                    {m.sender === "admin" ? t("humanTeam") : t("chatTitle")}
                  </span>
                )}
                <div dir="auto" className="whitespace-pre-wrap break-words">
                  <ChatMarkdown onOpenProduct={onOpenProduct}>{m.body}</ChatMarkdown>
                </div>
              </div>
            ),
          )}
          {messages.length > 0 && <RateChat key={open.id} chatId={open.id} access={access} />}
        </>
      )}
    </div>
  );
}

/** 1–5 stars (plus optional comment) for one saved chat; rating again replaces it. */
function RateChat({ chatId, access }: { chatId: string; access: string }) {
  const { t } = useLanguage();
  const rate = useServerFn(rateLiveChat);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

  useEffect(() => {
    let active = true;
    void readVisitorRating({ data: { access, chatId } })
      .then((data) => {
        if (!active || !data) return;
        setStars(data.stars);
        setComment(data.comment);
      })
      .catch(() => {
        if (active) setState("failed");
      });
    return () => {
      active = false;
    };
  }, [chatId, access]);

  const send = async () => {
    if (!stars) return;
    setState("busy");
    try {
      const result = await rate({ data: { access, chatId, stars, comment } });
      setState(result.ok ? "done" : "failed");
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="chat-rate">
      <strong className="text-sm">{t("rateTitle")}</strong>
      <div className="chat-rate-stars" role="radiogroup" aria-label={t("rateTitle")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={t("rateStar").replace("{n}", String(n))}
            onClick={() => {
              setStars(n);
              setState("idle");
            }}
          >
            <Star className="size-5" data-on={n <= stars} />
          </button>
        ))}
      </div>
      {stars > 0 && (
        <>
          <Textarea
            value={comment}
            maxLength={500}
            rows={2}
            placeholder={t("rateComment")}
            onChange={(e) => {
              setComment(e.target.value);
              setState("idle");
            }}
          />
          <Button size="sm" disabled={state === "busy"} onClick={() => void send()}>
            {state === "busy" && <Loader2 className="size-4 animate-spin" />} {t("rateSend")}
          </Button>
        </>
      )}
      {state === "done" && <p className="text-xs text-muted-foreground">{t("rateThanks")}</p>}
      {state === "failed" && <p className="text-xs text-destructive">{t("rateFailed")}</p>}
    </div>
  );
}
