import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Gauge, Volume2, VolumeX, X, SmilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AtlasPuppet, atlasActions } from "./atlas-puppet";
import archyPoster from "@/assets/archy-atlas.webp";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/lib/language";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import {
  archyGreetingText,
  DEFAULT_ARCHY_GREETING,
} from "@/lib/archy-settings";
import type { ArchyOpenIntent } from "./archy-guide";
import { useArchySpeech } from "@/lib/use-archy-speech";
import {
  ARCHY_TOUR_SPEECH_CAP_MS,
  archyTour,
  archyTourRobotReady,
  cancelArchyTour,
} from "@/lib/archy-tour";
import { useArchyTourMotion } from "@/lib/use-archy-tour-motion";
import {
  browserSaveData,
  readArchyLightweight,
  saveArchyLightweight,
} from "@/lib/archy-display";
import {
  ARCHY_GREETING_VISIBLE_MS,
  ARCHY_HOP_DELAY_MS,
  markArchyGreetingShown,
  shouldShowArchyGreeting,
  type ArchyAnimation,
} from "@/lib/archy-mascot";

const idleSequence = [
  "Think",
  "Read",
  "Hop",
  "Eat",
  "Exercise",
  "Phone",
  "Laugh",
  "Sleep",
] as const;

const jokes: Partial<Record<ArchyAnimation, [string, string]>> = {
  Sleep: [
    "غفوة قصيرة… صحّيني قبل الاجتماع!",
    "Power nap… wake me before the meeting!",
  ],
  Eat: [
    "تفاحة في اليوم تُبعد فنّي الصيانة!",
    "An apple a day keeps the mechanic away!",
  ],
  Exercise: [
    "واحد، اثنان… حتى المفاصل تحتاج تحديثًا!",
    "One, two… even my joints need an update!",
  ],
  Read: [
    "وجدتُ الفقرة! أين وضعتُ علامة الصفحة؟",
    "Found the paragraph! Now where’s my bookmark?",
  ],
  Laugh: [
    "هههه! أظن أن أحدًا دغدغ دوائري.",
    "Ha! Someone tickled my circuits.",
  ],
  Think: [
    "لحظة… الفكرة على طرف الهوائي!",
    "One second… it’s on the tip of my antenna!",
  ],
};
function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function ArchyLauncher({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (intent: ArchyOpenIntent) => void;
}) {
  const { language, t } = useLanguage();
  const { data: catalog } = useQuery(catalogQueryOptions);
  const greetingSettings =
    catalog?.settings?.archyGreeting ?? DEFAULT_ARCHY_GREETING;
  const greeting = archyGreetingText(
    greetingSettings,
    language,
    t("archyGreeting"),
  );
  const tour = useSyncExternalStore(
    archyTour.subscribe,
    archyTour.getSnapshot,
    archyTour.getServerSnapshot,
  );
  const touring = tour.phase !== "idle";
  const away = touring && tour.phase !== "rewind";
  const dockRef = useRef<HTMLDivElement>(null);
  useArchyTourMotion(dockRef);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [joking, setJoking] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const lastHello = useRef(0);
  useEffect(() => {
    if (!actionsOpen) return;
    const outside = (e: PointerEvent) => {
      if (!dockRef.current?.contains(e.target as Node)) setActionsOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActionsOpen(false);
        menuRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [actionsOpen]);
  const onToggle = () => {
    setActionsOpen(false);
    cancelArchyTour(true);
    if (open) onClose();
    else {
      // Owner request: Archy opens the chat itself; its choices live inside the chat.
      onChoose({});
    }
  };
  const [animation, setAnimation] = useState<ArchyAnimation>("Idle");
  const [animationKey, setAnimationKey] = useState(0);
  const [greetingVisible, setGreetingVisible] = useState(false);
  // Bumped on every display so a replay renews the full bubble interval.
  const [greetingRun, setGreetingRun] = useState(0);
  // Set on mount when this session has not been greeted; consumed once the model is visible.
  const [greetingPending, setGreetingPending] = useState(false);
  const [greetingChecked, setGreetingChecked] = useState(false);
  const [greetingStartedAt, setGreetingStartedAt] = useState<number | null>(
    null,
  );
  const [greetingNow, setGreetingNow] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [lightweight, setLightweight] = useState(false);
  const idleTurn = useRef(0);
  const hopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { muted, status, replay, cancel, toggleMuted } = useArchySpeech(
    language,
    greeting,
    {
      voiceOn: greetingSettings.voiceOn,
      rate: greetingSettings.rate,
      pitch: greetingSettings.pitch,
    },
  );

  const play = useCallback((clip: ArchyAnimation) => {
    setJoking(false);
    setAnimation(clip);
    setAnimationKey((value) => value + 1);
  }, []);

  useEffect(() => {
    let store: Storage | null = null;
    try {
      store = window.localStorage;
    } catch {
      /* storage blocked */
    }
    setLightweight(readArchyLightweight(store, browserSaveData()));
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (shouldShowArchyGreeting(sessionStore())) setGreetingPending(true);
    setGreetingChecked(true);
  }, []);

  useEffect(() => {
    archyTour.update({ robotPresent: true });
    return () => {
      cancelArchyTour(true);
      archyTour.update({ robotPresent: false, robotReady: false });
    };
  }, []);

  useLayoutEffect(() => {
    archyTour.update({
      robotReady: archyTourRobotReady({
        greetingChecked,
        sceneFinal: true,
        greetingPending,
        greetingStartedAt,
        now: greetingNow,
        animation,
        speaking: status === "speaking",
        open,
        hidden,
      }),
    });
  }, [
    greetingChecked,
    lightweight,
    greetingPending,
    greetingStartedAt,
    greetingNow,
    status,
    animation,
    open,
    hidden,
  ]);

  useEffect(() => {
    if (greetingStartedAt === null || status !== "speaking") return;
    const remaining = Math.max(
      0,
      ARCHY_TOUR_SPEECH_CAP_MS - (performance.now() - greetingStartedAt),
    );
    const timer = setTimeout(
      () => setGreetingNow(performance.now()),
      remaining,
    );
    return () => clearTimeout(timer);
  }, [greetingStartedAt, status]);

  useEffect(() => {
    if (tour.phase === "rewind" || tour.phase === "fly")
      setGreetingVisible(false);
  }, [tour.phase]);

  useEffect(() => {
    if (tour.clipRequest > 0) play(tour.clip);
  }, [tour.clipRequest, tour.clip, play]);

  useEffect(() => {
    if (!greetingPending || hidden || open) return;
    setGreetingPending(false);
    markArchyGreetingShown(sessionStore());
    const startedAt = performance.now();
    setGreetingStartedAt(startedAt);
    setGreetingNow(startedAt);
    setGreetingVisible(true);
    setGreetingRun((v) => v + 1);
    if (!lightweight && !reducedMotion) play("Wave");
    replay();
  }, [greetingPending, hidden, lightweight, open, play, reducedMotion, replay]);

  useEffect(() => {
    if (!greetingVisible) return;
    const timer = setTimeout(() => {
      setGreetingVisible(false);
      setAnimation("Idle");
    }, ARCHY_GREETING_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [greetingVisible, greetingRun]);

  useEffect(() => {
    if (
      lightweight ||
      open ||
      hidden ||
      reducedMotion ||
      greetingVisible ||
      touring ||
      animation !== "Idle"
    )
      return;
    hopTimer.current = setTimeout(() => {
      play(idleSequence[idleTurn.current % idleSequence.length]!);
      idleTurn.current++;
    }, ARCHY_HOP_DELAY_MS);
    return () => {
      if (hopTimer.current) clearTimeout(hopTimer.current);
    };
  }, [
    animation,
    lightweight,
    greetingVisible,
    hidden,
    open,
    play,
    reducedMotion,
    touring,
  ]);

  useEffect(() => {
    if (animation === "Idle") return;
    // Poster fallback has no mixer completion event, so it returns to ready text here.
    const timer = setTimeout(
      () => setAnimation("Idle"),
      animation === "Hop" ? 2300 : 3650,
    );
    return () => clearTimeout(timer);
  }, [animation, animationKey]);

  useEffect(() => {
    if (open) {
      cancelArchyTour(true);
      setGreetingVisible(false);
      cancel();
    }
  }, [cancel, open]);

  useEffect(() => {
    if (hidden) cancel();
  }, [cancel, hidden]);

  const hearGreeting = () => {
    setGreetingVisible(true);
    setGreetingRun((v) => v + 1);
    if (!lightweight && !reducedMotion) play("Wave");
    replay();
  };

  const gesture =
    !touring && !open && !hidden && !reducedMotion && !lightweight
      ? animation
      : "Idle";
  const staticMode = lightweight || reducedMotion;
  const sayHello = () => {
    if (
      open ||
      touring ||
      hidden ||
      staticMode ||
      actionsOpen ||
      Date.now() - lastHello.current < 12000
    )
      return;
    lastHello.current = Date.now();
    play(animation === "Sleep" ? "Laugh" : "Wave");
  };
  const joke =
    joking && !actionsOpen && !touring
      ? jokes[gesture]?.[language === "ar" ? 0 : 1]
      : "";
  return (
    <div
      data-gesture={gesture}
      data-atlas-paused={open || hidden || touring ? true : undefined}
      ref={dockRef}
      className="archy-dock"
      data-archy-tour={touring ? tour.phase : undefined}
      data-scene-ready="true"
      data-archy-lightweight={lightweight ? "true" : undefined}
    >
      {(tour.bubble || greetingVisible || joke) && !open && (
        <div className="archy-bubble" role="status" aria-live="polite">
          <p>{tour.bubble ? t(tour.bubble) : joke || greeting}</p>
          <button
            type="button"
            className="archy-dismiss"
            aria-label={t("archyDismiss")}
            onClick={() => {
              if (touring) cancelArchyTour();
              else {
                setGreetingVisible(false);
                setJoking(false);
              }
            }}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      )}
      <button
        type="button"
        id="assistant-launcher"
        className="assistant-toggle archy-character"
        onClick={onToggle}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") sayHello();
        }}
        onFocus={sayHello}
        aria-label={open ? t("chatClose") : t("archyOpen")}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {staticMode ? (
          <img
            className="archy-poster"
            src={archyPoster}
            alt=""
            aria-hidden="true"
          />
        ) : (
          <AtlasPuppet key={animationKey} action={gesture} />
        )}
      </button>
      {!open && (
        <div className="archy-toolbar" hidden={away}>
          {!staticMode && (
            <>
              <Button
                ref={menuRef}
                variant="ghost"
                size="icon"
                type="button"
                aria-expanded={actionsOpen}
                aria-label={
                  language === "ar" ? "العب مع أرشي" : "Play with Archy"
                }
                title={language === "ar" ? "العب مع أرشي" : "Play with Archy"}
                onClick={() => setActionsOpen((v) => !v)}
              >
                <SmilePlus aria-hidden="true" />
              </Button>
              {actionsOpen && (
                <div
                  className="atlas-actions"
                  role="group"
                  aria-label={
                    language === "ar" ? "حركات أرشي" : "Archy actions"
                  }
                >
                  {atlasActions.map(([clip, ar, en]) => (
                    <button
                      key={clip}
                      type="button"
                      onClick={() => {
                        setActionsOpen(false);
                        setGreetingVisible(false);
                        menuRef.current?.focus();
                        lastHello.current = Date.now();
                        play(clip);
                        setJoking(true);
                      }}
                    >
                      {language === "ar" ? ar : en}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="archy-lightweight-button"
            onClick={() => {
              const next = !lightweight;
              setLightweight(next);
              saveArchyLightweight(next);
            }}
            aria-label={lightweight ? t("bxFull3d") : t("bxLightMode")}
            aria-pressed={lightweight}
            title={lightweight ? t("bxFull3d") : t("bxLightMode")}
          >
            <Gauge aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="archy-sound-button"
            onClick={hearGreeting}
            disabled={muted}
            aria-label={t("archyHear")}
            aria-pressed={status === "speaking"}
            title={t("archyHear")}
          >
            <Volume2 aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="archy-mute-button"
            onClick={toggleMuted}
            aria-label={muted ? t("archyUnmute") : t("archyMute")}
            aria-pressed={muted}
            title={muted ? t("archyUnmute") : t("archyMute")}
          >
            {muted ? (
              <VolumeX aria-hidden="true" />
            ) : (
              <Volume2 aria-hidden="true" />
            )}
          </Button>
        </div>
      )}
      {lightweight && !open && (
        <p className="sr-only" role="status">
          {t("bxLightEnabled")}
        </p>
      )}
      {status === "unavailable" && !muted && !open && (
        <p className="sr-only" role="status">
          {t("archyVoiceUnavailable")}
        </p>
      )}
    </div>
  );
}
