import {archyPage,pagePrompts,type ArchyPage} from "@/lib/archy-page";
import { ReplyRating } from "./reply-rating";
import { trackProductEvent } from "@/lib/metrics-consent";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ChatProductPage } from "@/components/chat-product";
import { currentAuthUser } from "@/lib/current-visitor-access";
import {
  Compass,
  History,
  LifeBuoy,
  Loader2,
  ChevronDown,
  RotateCcw,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { ChatHistory } from "@/components/chat-history";
import { ArchyGuide, type ArchyOpenIntent } from "@/components/archy-guide";
import { ArchyLauncher } from "@/components/archy-launcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getAssistantChallenge,
  registerAssistantVisitor,
  sendAssistantMessage,
} from "@/lib/assistant-chat.functions";
import { useQuery } from "@tanstack/react-query";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { TurnstileWidget } from "@/components/turnstile-widget";
import {
  clearLegacy,
  historyKey,
  loadAccountState,
  sessionKey,
  GUEST_CHAT_OWNER,
  type StoredMessage,
  type StoredSession,
} from "@/lib/assistant-storage";
import { useLanguage } from "@/lib/language";
import { fill2 } from "@/lib/copy";
import { supabase } from "@/integrations/supabase/client";
import {
  endVisitorLiveChat,
  requestHumanChat,
  sendVisitorLiveMessage,
} from "@/lib/live-chat.functions";
import { assistantRegistrationSchema } from "@/lib/assistant-registration";
import { readVisitorChats } from "@/lib/live-chat.functions";
import { orderChatMessages } from "@/lib/chat-order";
import { isWithPerson } from "@/lib/live-chat.shared";
import {
  currentTourVisit,
  updateBrowserTourVisit,
} from "@/lib/archy-tour-visit-client";
import {
  ASSISTANT_SESSION_EVENT,
  OPEN_ASSISTANT_EVENT,
  type ChatToolRequest,
  type OpenAssistantDetail,
} from "@/lib/assistant-events";

type LiveMsg = { id: string; sender: string; body: string; created_at: string };

type ChatMessage = StoredMessage;
function limitedDraft(owner:string) {
  try {
    const saved=sessionStorage.getItem("archy-guest-retry:v2:"+owner);
    const legacyKey="archy-retry:"+owner;
    const value=JSON.parse(saved??sessionStorage.getItem(legacyKey)??"null");
    if(!saved && value){value.until=Date.now();sessionStorage.removeItem(legacyKey);}
    if(value && Number.isFinite(value.until) && value.until+3600000>Date.now()){
      return {until:Number(value.until),name:String(value.name??""),email:String(value.email??""),question:String(value.question??"")};
    }
  }catch{/* Browser storage is optional. */}
  return null;
}
function ReplyBody({message,ar,openProduct}:{message:ChatMessage;ar:boolean;openProduct:(id:string)=>boolean|void}){
  const split=message.role==="assistant"?message.content.search(/\n\n(?=\[[^\n]+\]\(\/product\/[^)]+#(?:access|capabilities)\))/):-1;
  return <><ChatMarkdown onOpenProduct={openProduct}>{split<0?message.content:message.content.slice(0,split)}</ChatMarkdown>
    {split>=0&&<details><summary>{ar?"المصادر والملاءمة":"Sources and fit"}</summary><ChatMarkdown>{message.content.slice(split).trim()}</ChatMarkdown></details>}</>;
}

type GateSession = StoredSession;
type Challenge = Awaited<ReturnType<typeof getAssistantChallenge>>;

export { OPEN_ASSISTANT_EVENT } from "@/lib/assistant-events";

/** window.localStorage can throw on access itself (privacy modes, sandboxed frames). */
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Loaded only when a visitor opens a tool request inside the chat.
const ToolRequestDialog = lazy(() =>
  import("@/components/tool-request-dialog").then((m) => ({
    default: m.ToolRequestDialog,
  })),
);

export function AssistantChat() {
  const { language, dir, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [context,setContext]=useState<ArchyPage|null>(null);
  useEffect(()=>{
    if(!open)return;
    const refresh=()=>{
      const [,route,id]=window.location.pathname.split("/");
      const el=document.querySelector<HTMLElement>("main[data-archy-service]");
      const page=route==="enterprise-services"?(id==="request"?"service-request":"services"):route;
      const next=archyPage({page,tool:el?.dataset["archyTool"]||id,service:el?.dataset["archyService"]});
      setContext(prev=>prev?.page===next?.page&&prev?.tool===next?.tool&&prev?.service===next?.service?prev:next);
    };
    refresh();const observer=new MutationObserver(refresh);
    observer.observe(document.querySelector(".site-content")??document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["data-archy-tool","data-archy-service"]});
    return ()=>observer.disconnect();
  },[open]);
  const suggestions=context ? pagePrompts(context,language==="ar") : [];
  const previousOpen=useRef(false);
  useEffect(()=>{if(previousOpen.current&&!open)document.getElementById("assistant-launcher")?.focus();previousOpen.current=open;},[open]);

  // Centered window mode, opened from the «من المشكلة إلى الأداة» bar.
  const [modal, setModal] = useState(false);
  const [requestForm, setRequestForm] = useState<ChatToolRequest | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [comparison, setComparison] = useState<NonNullable<OpenAssistantDetail["comparison"]>>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<GateSession | null>(null);
  const tourChatOpened = useRef(false);
  useEffect(() => {
    if (!open) {
      setComparison([]);
      tourChatOpened.current = false;
      return;
    }
    if (!currentTourVisit()) return;
    if (!tourChatOpened.current) {
      trackProductEvent("project.archy_post_tour_chat_opened");
      tourChatOpened.current = true;
    }
    updateBrowserTourVisit("chat", session?.token ?? "");
  }, [open, session]);
  // Other parts of the page (e.g. the homepage hero) open the guide with this event.
  useEffect(() => {
    const show = (e: Event) => {
      const detail = (e as CustomEvent<OpenAssistantDetail | undefined>).detail;
      setModal(Boolean(detail?.modal));
      setRequestForm(detail?.request ?? null);
      setSelectedProductId(null);
      setComparison(detail?.comparison ?? []);
      if (detail?.draft) {
        const draft = detail.draft.slice(0, 1200);
        setInput(draft);
        setGateQuestion(draft);
        setShowHistory(false);
      }
      setOpen(true);
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, show);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, show);
  }, []);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [gateName, setGateName] = useState("");
  const [gateEmail, setGateEmail] = useState("");
  const [gateQuestion, setGateQuestion] = useState("");
  const [gateAnswer, setGateAnswer] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [gateWebsite, setGateWebsite] = useState(""); // honeypot
  const [gateBusy, setGateBusy] = useState(false);
  const [challengeRetry, setChallengeRetry] = useState(0);
  const [challengeFailed, setChallengeFailed] = useState(false);
  const [gateError, setGateError] = useState("");
  const [retryAt,setRetryAt]=useState(0);
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{if(!retryAt)return;const id=setInterval(()=>{const t=Date.now();setNow(t);if(t>=retryAt){setRetryAt(0);setGateError("");setChallenge(null);}},1000);return ()=>clearInterval(id);},[retryAt]);
  // Confirmed email of the signed-in visitor; the chat stays closed without it.
  const [verified, setVerified] = useState<string | null>(null);

  // Account that owns the visible chat; responses for any other account are discarded.
  const accountRef = useRef<string | null>(null);
  // Bumped on every account change; async work started under an older generation is dropped,
  // so a reply for A cannot land after A -> B -> A even though the account ID matches again.
  const genRef = useRef(0);
  const mountedRef = useRef(true);
  const live = (gen: number) => mountedRef.current && gen === genRef.current;
  const { data: catalog } = useQuery(catalogQueryOptions);
  const selectedProduct = selectedProductId
    ? catalog?.products.find((product) => product.id === selectedProductId)
    : undefined;
  const openProduct = (productId: string): boolean => {
    if (!catalog?.products.some((product) => product.id === productId))
      return false;
    setSelectedProductId(productId);
    setRequestForm(null);
    setShowHistory(false);
    setShowOptions(false);
    return true;
  };
  // Conversation with a person: set while the visitor's stored chat is waiting or active.
  const [liveChat, setLive] = useState<{ id: string; status: string } | null>(
    null,
  );
  const [liveMessages, setLiveMessages] = useState<LiveMsg[]>([]);
  const [liveNote, setLiveNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const askHuman = useServerFn(requestHumanChat);
  const sendLive = useServerFn(sendVisitorLiveMessage);
  const endLive = useServerFn(endVisitorLiveChat);
  // Find an open conversation with a person for this account (e.g. after a reload).
  useEffect(() => {
    if (!verified) {
      setLive(null);
      return;
    }
    const owner = accountRef.current;
    if (!owner) {
      setLive(null);
      return;
    }
    let active = true;
    if (!session) return;
    void readVisitorChats({ data: { access: session.token } })
      .then((result) => {
        const chat = result.chats.find((c) => isWithPerson(c.status));
        if (active) setLive(chat ? { id: chat.id, status: chat.status } : null);
      })
      .catch(() => {
        if (active) setLiveNote(t("chatFailed"));
      });
    return () => {
      active = false;
    };
  }, [verified, session, t]);
  const liveId = liveChat?.id ?? null;
  const withPerson = Boolean(liveChat && isWithPerson(liveChat.status));
  useEffect(() => {
    if (!liveId) {
      setLiveMessages([]);
      return;
    }
    if (!open || !withPerson || !session) return;
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await readVisitorChats({
          data: { access: session.token, chatId: liveId },
        });
        if (!active) return;
        const chat = result.chats.find((c) => c.id === liveId);
        setLive(
          chat && isWithPerson(chat.status)
            ? { id: chat.id, status: chat.status }
            : null,
        );
        setLiveMessages(
          orderChatMessages(
            result.messages.filter((m) => m.chat_id === liveId),
          ),
        );
        setLiveNote("");
      } catch {
        if (active) setLiveNote(t("chatFailed"));
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [liveId, session, open, withPerson, t]);
  useEffect(() => {
    mountedRef.current = true;
    let authEvents = 0;
    const apply = (
      user: {
        id?: string;
        email?: string;
        email_confirmed_at?: string | null;
      } | null,
    ) => {
      const email =
        user?.email && user.email_confirmed_at
          ? user.email.toLowerCase()
          : null;
      const id = email && user?.id ? user.id : GUEST_CHAT_OWNER;
      if (!mountedRef.current) return;
      const store = browserStorage();
      if (store) clearLegacy(store);
      if (id !== accountRef.current) {
        accountRef.current = id;
        genRef.current += 1;
        let state: ReturnType<typeof loadAccountState> | null = null;
        try {
          state = id && store ? loadAccountState(store, id) : null;
        } catch {
          state = null;
        }
        setSession(state?.session ?? null);
        setMessages(state?.history ?? []);
        setChallenge(null);
        setInput("");
        setBusy(false);
        setGateBusy(false);
        setGateName("");
        setGateQuestion("");
        setGateAnswer("");
        setGateError("");
        setLive(null);
        setLiveNote("");
        setShowHistory(false);
        setSelectedProductId(null);
      }
      setVerified(email ?? "guest");
      const stored = store ? loadAccountState(store, id).session : null;
      const draft=limitedDraft(id);
      if(!stored && draft){
        setGateName(draft.name);setGateEmail(draft.email);setGateQuestion(draft.question);
        setRetryAt(draft.until>Date.now()?draft.until:0);if(draft.until>Date.now())setGateError(" ");
      }else{setGateEmail(stored?.email ?? email ?? "");setRetryAt(0);}

    };
    // The initial lookup is ignored if any auth event arrived first: that event is newer.
    // An unconfirmed stored sign-in (revoked, invalid, offline) is unknown: load no owner.
    void currentAuthUser().then((auth) => {
      if (authEvents === 0 && auth)
        apply(auth.kind === "account" ? auth.user : null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      authEvents += 1;
      apply(s?.user ?? null);
    });
    return () => {
      mountedRef.current = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fetchChallenge = useServerFn(getAssistantChallenge);
  const register = useServerFn(registerAssistantVisitor);

  // The greeting is never stored: it is always shown in the visitor's current language.
  const greeting: ChatMessage = {
    role: "assistant",
    content: t("chatGreeting"),
  };

  useEffect(() => {
    if (!open || session || challenge) return;
    let cancelled = false;
    setChallengeFailed(false);
    fetchChallenge()
      .then((value) => {
        if (!cancelled) setChallenge(value);
      })
      .catch(() => {
        if (!cancelled) setChallengeFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, verified, session, challenge, fetchChallenge, challengeRetry]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
    if (open && session && !busy) inputRef.current?.focus();
  }, [messages, liveMessages, open, busy, session, selectedProductId]);

  const save = (next: ChatMessage[], gen = genRef.current) => {
    const owner = accountRef.current;
    if (!owner || !live(gen)) return;
    setMessages(next);
    try {
      browserStorage()?.setItem(
        historyKey(owner),
        JSON.stringify(next.slice(-40)),
      );
    } catch {
      /* storage full */
    }
  };

  const expireSession = (gen: number) => {
    const owner = accountRef.current;
    if (!owner || !live(gen)) return;
    try {
      browserStorage()?.removeItem(sessionKey(owner));
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new Event(ASSISTANT_SESSION_EVENT));
    setSession(null);
    setChallenge(null);
  };

  const ask = async (history: ChatMessage[], access: string, gen: number) => {
    setBusy(true);
    try {
      const turns = history
        .filter((m) => !m.error)
        .map(({ role, content }) => ({ role, content }));
      const result = await sendAssistantMessage({
        data: { turns, language, access, context },
      });
      if (!live(gen)) return;
      if (!result.ok && result.code === "gate") {
        expireSession(gen);
        setGateError(result.message);
        return;
      }
      save(
        [
          ...history,
          result.ok
            ? {
                role: "assistant",
                content: result.reply.summary || t("chatSuggestion"),
                picks: result.reply.picks,
                ...(result.messageId ? {messageId:result.messageId} : {}),
              }
            : { role: "assistant", content: result.message, error: true },
        ],
        gen,
      );
    } catch {
      save(
        [
          ...history,
          { role: "assistant", content: t("chatFailed"), error: true },
        ],
        gen,
      );
    } finally {
      if (live(gen)) setBusy(false);
    }
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = input.trim();
    const gen = genRef.current;
    if (!text || busy || !session || !accountRef.current) return;
    if (session.exp <= Date.now()) {
      expireSession(gen);
      return;
    }
    if (withPerson && liveChat) {
      setBusy(true);
      setLiveNote("");
      try {
        const result = await sendLive({
          data: {
            access: session.token,
            chatId: liveChat.id,
            body: text,
            language,
          },
        });
        if (!live(gen)) return;
        if (result.ok) setInput("");
        else if (result.code === "gate") expireSession(gen);
        else if (result.code === "closed")
          setLive((p) => (p ? { ...p, status: "closed" } : p));
        else
          setLiveNote(
            result.code === "limit" ? t("humanLimit") : t("chatFailed"),
          );
      } catch {
        if (live(gen)) setLiveNote(t("chatFailed"));
      } finally {
        if (live(gen)) setBusy(false);
      }
      return;
    }
    const next = [...messages, { role: "user" as const, content: text }];
    save(next, gen);
    setInput("");
    await ask(next, session.token, gen);
  };

  const startHuman = async () => {
    if (!session || busy) return;
    const gen = genRef.current;
    setBusy(true);
    setLiveNote("");
    try {
      const result = await askHuman({
        data: { access: session.token, language },
      });
      if (!live(gen)) return;
      if (result.ok) setLive({ id: result.chatId, status: "waiting" });
      else if (result.code === "gate") expireSession(gen);
      else
        setLiveNote(
          result.code === "limit" ? t("humanLimit") : t("chatFailed"),
        );
    } catch {
      if (live(gen)) setLiveNote(t("chatFailed"));
    } finally {
      if (live(gen)) setBusy(false);
    }
  };

  // Archy's guide card opens the chat with a draft (never sent) or a request for a person.
  const [pendingHuman, setPendingHuman] = useState(false);
  // Archy's choices show inside the chat once the visitor has passed the gate.
  const [showOptions, setShowOptions] = useState(false);
  const openWith = (intent: ArchyOpenIntent) => {
    setShowHistory(false);
    if (intent.prefill || intent.human) setShowOptions(false);
    if (intent.prefill) {
      if (session) setInput(intent.prefill);
      else setGateQuestion(intent.prefill);
    }
    if (intent.human) setPendingHuman(true);
    setOpen(true);
  };
  useEffect(() => {
    if (!pendingHuman || !open) return;
    setPendingHuman(false);
    if (verified && session && !withPerson) void startHuman();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHuman, open]);

  const stopHuman = async () => {
    if (!session || !liveChat || busy) return;
    const gen = genRef.current;
    const id = liveChat.id;
    setBusy(true);
    try {
      const result = await endLive({
        data: { access: session.token, chatId: id, language },
      });
      if (!live(gen)) return;
      if (result.ok) {
        setLive(null);
        setLiveNote("");
      } else if (result.code === "gate") expireSession(gen);
      else setLiveNote(t("chatFailed"));
    } catch {
      if (live(gen)) setLiveNote(t("chatFailed"));
    } finally {
      if (live(gen)) setBusy(false);
    }
  };

  // The question typed before starting is sent automatically once the chat opens.
  const autoSendRef = useRef(false);
  useEffect(() => {
    if (!autoSendRef.current || !session || !input.trim() || busy) return;
    autoSendRef.current = false;
    void submit();
    // submit reads the latest state; re-run only when the session or input arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, input]);

  const submitGate = async (event: FormEvent) => {
    event.preventDefault();
    const owner = accountRef.current;
    const gen = genRef.current;
    if (gateBusy || !challenge || !owner) return;
    setGateBusy(true);
    setGateError("");
    try {
      const registration = assistantRegistrationSchema.safeParse({
        name: gateName,
        email: gateEmail,
        question: gateQuestion,
        token: challenge.token,
        answer: challenge.mode === "math" ? gateAnswer : "",
        turnstile: challenge.mode === "turnstile" ? turnstileToken : "",
        website: gateWebsite,
        language,
      });
      if (!registration.success) {
        setGateError(t("chatFailed"));
        return;
      }
      const result = await register({ data: registration.data });
      if (!live(gen)) return;
      if (!result.ok) {
        setGateError(result.message); if(result.retryAt){setNow(Date.now());setRetryAt(result.retryAt);
        try{sessionStorage.setItem("archy-guest-retry:v2:"+owner,JSON.stringify({until:result.retryAt,name:gateName,email:gateEmail,question:gateQuestion}));}catch{/* Keep the in-memory draft. */}}
        setChallenge(null); // fetch a fresh question for the next attempt
        setTurnstileToken("");
        return;
      }
      try{sessionStorage.removeItem("archy-guest-retry:v2:"+owner);}catch{/* Optional storage. */}
      const next: GateSession = {
        token: result.token,
        name: result.name,
        exp: result.exp,
        email: gateEmail.trim().toLowerCase(),
      };
      setSession(next);
      try {
        browserStorage()?.setItem(sessionKey(owner), JSON.stringify(next));
      } catch {
        /* storage full */
      }
      window.dispatchEvent(new Event(ASSISTANT_SESSION_EVENT));
      const first: ChatMessage[] = [];
      save(first, gen);
      if (gateQuestion.trim()) {
        setInput(gateQuestion);
        autoSendRef.current = true; // send the prepared question as soon as the session is set
      }
      setGateQuestion("");
      setGateAnswer("");
      setShowOptions(false);
    } catch (error) {
      if (live(gen))
        setGateError(error instanceof Error ? error.message : t("chatFailed"));
    } finally {
      if (live(gen)) setGateBusy(false);
    }
  };

  // Close and hand keyboard focus back to the Archy launcher instead of dropping it on the page.
  const closePanel = () => {
    setOpen(false);
    setModal(false);
    setRequestForm(null);
    setSelectedProductId(null);
    window.requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(".archy-character")
        ?.focus({ preventScroll: true }),
    );
  };
  const closeRef = useRef(closePanel);
  closeRef.current = closePanel;
  // On open, move focus into the panel (without summoning the phone keyboard) and let Escape close it.
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (panel && !panel.contains(document.activeElement))
        panel.focus({ preventScroll: true });
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className="assistant-chat"
      dir={dir}
      data-open={open ? "true" : "false"}
      data-modal={open && modal ? "true" : undefined}
    >
      {open && modal && (
        <div
          className="assistant-backdrop"
          aria-hidden="true"
          onClick={closePanel}
        />
      )}
      {open && (
        <section
          role={modal ? "dialog" : undefined}
          aria-modal={modal ? true : undefined}
          id="assistant-panel"
          className="assistant-panel"
          aria-label={t("chatTitle")}
          ref={panelRef}
          tabIndex={-1}
        >
          <header className="assistant-head">
            <span className="assistant-avatar">
              <Compass className="size-4" />
            </span>
            <strong>{t("chatTitle")}</strong>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("chatClose")}
              onClick={closePanel}
            >
              <X className="size-4" />
            </Button>
          </header>
          {comparison.length > 0 && (
            <nav className="ea-comparison-sources" aria-label={language === "ar" ? "صفحات المنتجات" : "Product references"}>
              {comparison.map(item => <a key={item.id} href={"/product/" + encodeURIComponent(item.id)}
                target="_blank" rel="noopener noreferrer">{item.name} ↗</a>)}
            </nav>
          )}
          {requestForm ? (
            <Suspense
              fallback={<Loader2 className="m-4 size-4 animate-spin" />}
            >
              <ToolRequestDialog
                inline
                open
                onOpenChange={(next) => {
                  if (!next) setRequestForm(null);
                }}
                product={requestForm.product}
                need={requestForm.need}
              />
            </Suspense>
          ) : selectedProduct ? (
            <ChatProductPage
              product={selectedProduct}
              onBack={() => setSelectedProductId(null)}
            />
          ) : session && showHistory ? (
            <ChatHistory
              onClose={() => setShowHistory(false)}
              access={session?.token ?? ""}
              onOpenProduct={openProduct}
            />
          ) : !session ? (
            <form
              className="assistant-form assistant-gate"
              onSubmit={submitGate}
            >
              <div className="ea-chat-welcome">
                <h2>
                  {language === "ar" ? "تحدث مع Archy" : "Chat with Archy"}
                </h2>
                <p>
                  {language === "ar"
                    ? "اسأل مباشرة عن أداة أو صف احتياج فريقك. لا يلزم تسجيل."
                    : "Ask straight away about a tool or what your team needs. No sign-up needed."}
                </p>
              </div>
              {suggestions.length>0 && <div className="ea-archy-prompts">{suggestions.map(q=><button key={q} aria-pressed={gateQuestion===q} type="button" onClick={()=>setGateQuestion(q)}>{q}</button>)}</div>}
              <Label htmlFor="gate-question">{language==="ar"?"سؤالك":"Your question"}</Label>
              <Textarea id="gate-question" maxLength={1200} value={gateQuestion} placeholder={language==="ar"?"مثال: نحتاج خريطة لتطبيقاتنا وتكرارها":"e.g. We need a map of our applications and their overlap"} onChange={e=>setGateQuestion(e.target.value)}/>
              <details className="ea-gate-contact" open={Boolean(gateName || gateEmail) || undefined}>
                <summary>{language==="ar"?"أضف اسمك وبريدك ليتابع معك الفريق (اختياري)":"Add your name and email so the team can follow up (optional)"}</summary>
                <Label htmlFor="gate-name">{t("gateName")}</Label>
                <Input
                  autoComplete="name"
                  minLength={2}
                  id="gate-name"
                  value={gateName}
                  maxLength={80}
                  onChange={(e) => setGateName(e.target.value)}
                />
                <Label htmlFor="gate-email">{t("gateEmail")}</Label>
                <Input
                  autoComplete="email"
                  id="gate-email"
                  type="email"
                  value={gateEmail}
                  maxLength={200}
                  onChange={(e) => setGateEmail(e.target.value)}
                />
              </details>
              {challenge?.mode === "turnstile" ? (
                <TurnstileWidget
                  siteKey={challenge.siteKey}
                  language={language}
                  onToken={setTurnstileToken}
                  onError={() => setGateError(t("chatFailed"))}
                />
              ) : challenge?.mode === "math" ? (
                <>
                  <Label htmlFor="gate-answer">
                    {challenge
                      ? fill2(
                          t("gateCaptcha"),
                          String(challenge.a),
                          String(challenge.b),
                        )
                      : "…"}
                  </Label>
                  <Input
                    id="gate-answer"
                    inputMode="numeric"
                    value={gateAnswer}
                    maxLength={10}
                    required
                    onChange={(e) => setGateAnswer(e.target.value)}
                  />
                </>
              ) : challengeFailed ? (
                <div className="ea-chat-retry" role="alert">
                  {language === "ar"
                    ? "تعذّر تحميل سؤال التحقق."
                    : "The verification question could not load."}
                  <button
                    type="button"
                    onClick={() => setChallengeRetry((n) => n + 1)}
                  >
                    {language === "ar" ? "إعادة المحاولة" : "Try again"}
                  </button>
                </div>
              ) : (
                <p role="status">
                  {language === "ar"
                    ? "جارٍ تجهيز التحقق…"
                    : "Preparing verification…"}
                </p>
              )}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
                value={gateWebsite}
                onChange={(e) => setGateWebsite(e.target.value)}
              />
              {gateError && (
                <p role="alert" className="text-sm text-destructive">
                  {retryAt>now?(language==="ar"?`يمكنك المحاولة بعد ${Math.ceil((retryAt-now)/60000)} دقيقة.`:`Try again in ${Math.ceil((retryAt-now)/60000)} min.`):gateError}
                </p>
              )}
              <Button
                type="submit"
                disabled={
                  retryAt>now || gateBusy ||
                  !challenge ||
                  (challenge.mode === "turnstile" && !turnstileToken)
                }
              >
                {gateBusy ? t("gateWorking") : t("gateStart")}
                {gateBusy && <Loader2 className="size-4 animate-spin" />}
              </Button>
            </form>
          ) : (
            <>
              {session && (
                <details className="ea-chat-services" key={String(withPerson)}>
                  <summary>
                    {language === "ar"
                      ? "خيارات المحادثة والدعم"
                      : "Chat and support options"}
                    <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  <div
                    className="assistant-human-bar"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a,button"))
                        e.currentTarget
                          .closest("details")
                          ?.removeAttribute("open");
                    }}
                  >
                    <section className="ea-chat-action-group">
                      <h3>{language === "ar" ? "المحادثات" : "Conversations"}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("histOpen")}
                      aria-pressed={showHistory}
                      onClick={() => setShowHistory((v) => !v)}
                    >
                      <History className="size-4" /> {t("histOpen")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("chatNewChat")}
                      disabled={gateBusy || withPerson}
                      onClick={() => {
                        genRef.current += 1;
                        setBusy(false);
                        setInput("");
                        setShowHistory(false);
                        setSelectedProductId(null);
                        setShowOptions(false);
                        save([]);
                      }}
                    >
                      <RotateCcw className="size-4" /> {t("chatNewChat")}
                    </Button>

                    </section>
                    <section className="ea-chat-action-group">
                      <h3>{language === "ar" ? "الدعم" : "Support"}</h3>
                    {withPerson ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void stopHuman()}
                      >
                        <Compass className="size-4" /> {t("humanBack")}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void startHuman()}
                        disabled={busy}
                      >
                        <UserRound className="size-4" /> {t("humanAsk")}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        to="/request"
                        search={{ type: "support", from: "chat" }}
                        onClick={() => {
                          try {
                            sessionStorage.setItem(
                              "e20e-request-prefill",
                              JSON.stringify({
                                name: session.name,
                                email: session.email ?? gateEmail,
                                access: session.token,
                              }),
                            );
                          } catch {
                            /* storage unavailable: the visitor types their details */
                          }
                          setOpen(false);
                        }}
                      >
                        <LifeBuoy className="size-4" />{" "}
                        {t("chatSupportRequest")}
                      </Link>
                    </Button>

                    </section>
                  </div>
                </details>
              )}
              {withPerson ? (
                <div className="assistant-log">
                  {liveMessages.map((m) =>
                    m.sender === "system" ? (
                      <p
                        key={m.id}
                        className="assistant-system text-center text-xs text-muted-foreground"
                      >
                        {m.body === "requested"
                          ? t("humanWaiting")
                          : m.body === "joined"
                            ? t("humanJoined")
                            : t("humanClosed")}
                      </p>
                    ) : (
                      <div
                        key={m.id}
                        className={`assistant-msg ${m.sender === "visitor" ? "user" : "assistant"}`}
                      >
                        {m.sender !== "visitor" && (
                          <span className="block text-xs text-muted-foreground">
                            {m.sender === "admin"
                              ? t("humanTeam")
                              : t("chatTitle")}
                          </span>
                        )}
                        <div
                          dir="auto"
                          className="whitespace-pre-wrap break-words"
                        >
                          <ChatMarkdown onOpenProduct={openProduct}>
                            {m.body}
                          </ChatMarkdown>
                        </div>
                        {m.sender==="ai" && session && <ReplyRating id={m.id} access={session.token} ar={language==="ar"}/>}
                      </div>
                    ),
                  )}
                  {liveNote && (
                    <p role="alert" className="text-sm text-destructive">
                      {liveNote}
                    </p>
                  )}
                  <div ref={endRef} />
                </div>
              ) : (
                <div className="assistant-log">
                  {liveNote && (
                    <p role="alert" className="text-sm text-destructive">
                      {liveNote}
                    </p>
                  )}
                  {session && showOptions && (
                    <ArchyGuide
                      inline
                      autoFocus={false}
                      onClose={() => setShowOptions(false)}
                      onChoose={(intent) => {
                        setShowOptions(false);
                        openWith(intent);
                      }}
                    />
                  )}
                  {suggestions.length>0 && !messages.length && <div className="ea-archy-prompts">{suggestions.map(q=><button key={q} type="button" onClick={()=>setInput(q)}>{q}</button>)}</div>}
                  {[greeting, ...messages].map((message, index) => (
                    <div
                      key={index}
                      className={`assistant-msg ${message.role}${message.error ? " error" : ""}`}
                    >
                      <div className="prose-sm">
                        <ReplyBody message={message} ar={language==="ar"} openProduct={openProduct} />
                      </div>
                      {message.messageId && session && <ReplyRating id={message.messageId} access={session.token} ar={language==="ar"}/>}
                      {message.picks?.slice(0,1).map((pick) => {
                        // Live catalog only: unknown or not-yet-launched tools are not shown.
                        const product = catalog?.products.find(
                          (p) => p.id === pick.id && !p.comingSoon,
                        );
                        if (!product) return null;
                        return (
                          <a
                            key={pick.id}
                            href={`/product/${encodeURIComponent(pick.id)}`}
                            className="assistant-pick"
                            onClick={(event) => {
                              if (
                                event.metaKey ||
                                event.ctrlKey ||
                                event.shiftKey ||
                                event.altKey
                              )
                                return;
                              if (openProduct(pick.id)) event.preventDefault();
                            }}
                          >
                            <strong>{product.name}</strong>
                            <span>{pick.reason}</span>
                          </a>
                        );
                      })}
                    </div>
                  ))}
                  {!messages.length && !showOptions && (
                    <button type="button" className="ea-chat-starters" onClick={() => setShowOptions(true)}>
                      <Compass size={16} aria-hidden="true" />{language === "ar" ? "ساعدني في اختيار أداة" : "Help me choose a tool"}
                    </button>
                  )}
                  {busy && (
                    <div className="assistant-msg assistant">
                      <Loader2 className="size-4 animate-spin" />{" "}
                      {t("chatThinking")}
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
              )}
              <form className="assistant-form" onSubmit={submit}>
                <Textarea
                  ref={inputRef}
                  value={input}
                  rows={2}
                  maxLength={1200}
                  placeholder={
                    withPerson ? t("humanPlaceholder") : t("chatPlaceholder")
                  }
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    )
                      void submit(e as unknown as FormEvent);
                  }}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={busy || !input.trim()}
                  aria-label={t("chatSend")}
                >
                  <Send className="size-4" />
                </Button>
              </form>
            </>
          )}
        </section>
      )}
      <ArchyLauncher
        open={open}
        onClose={() => setOpen(false)}
        onChoose={openWith}
      />
    </div>
  );
}
