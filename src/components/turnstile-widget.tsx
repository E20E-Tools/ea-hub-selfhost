import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      language?: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (id: string) => void;
};

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  const existing = (window as unknown as { turnstile?: TurnstileApi })
    .turnstile;
  if (existing) return Promise.resolve(existing);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (api) resolve(api);
      else reject(new Error("turnstile unavailable"));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("turnstile unavailable"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Cloudflare Turnstile check, shown only when the server has both Turnstile keys. */
export function TurnstileWidget({
  siteKey,
  language,
  onToken,
  onError,
}: {
  siteKey: string;
  language: "ar" | "en";
  onToken: (token: string) => void;
  onError: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onToken, onError });
  handlers.current = { onToken, onError };

  useEffect(() => {
    let id: string | null = null;
    let api: TurnstileApi | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((loaded) => {
        if (cancelled || !ref.current) return;
        api = loaded;
        id = loaded.render(ref.current, {
          sitekey: siteKey,
          language,
          callback: (token) => handlers.current.onToken(token),
          "expired-callback": () => handlers.current.onToken(""),
          "error-callback": () => handlers.current.onError(),
        });
      })
      .catch(() => handlers.current.onError());
    return () => {
      cancelled = true;
      if (api && id) api.remove(id);
    };
  }, [siteKey, language]);

  return <div ref={ref} className="min-h-[65px]" />;
}
