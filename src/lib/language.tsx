import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { dictionaries, type Copy } from "./copy";
import { languageFromSearch } from "./share";
import {
  LANGUAGE_STORAGE_KEY,
  directionOf,
  effectiveLanguage,
  languageCookie,
  languageFromCookie,
  resolveLanguage,
  type Direction,
  type Language,
} from "./language-core";

export {
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  languageFromCookie,
  directionOf,
  effectiveLanguage,
  pick,
  pickList,
  resolveLanguage,
  type Direction,
  type Language,
} from "./language-core";

type LanguageValue = {
  language: Language;
  dir: Direction;
  setLanguage: (language: Language) => void;
  /** False when the admin switched Arabic off for visitor pages. */
  arabicAvailable: boolean;
  t: (key: keyof Copy) => string;
};

const LanguageContext = createContext<LanguageValue>({
  language: "en",
  dir: "ltr",
  setLanguage: () => {},
  arabicAvailable: true,
  t: (key) => dictionaries.en[key],
});

/** Mirrors the choice into the language cookie the server reads for lang/dir. */
function rememberCookie(language: Language) {
  try {
    document.cookie = languageCookie(language, window.location.protocol === "https:");
  } catch {
    /* cookies blocked: the browser-only choice still applies */
  }
}

export function LanguageProvider({
  children,
  arabicEnabled = true,
  onAdmin = false,
  initialLanguage = "en",
}: {
  children: ReactNode;
  arabicEnabled?: boolean;
  onAdmin?: boolean;
  /** Language from the visitor's cookie, read on the server, so the first render matches. */
  initialLanguage?: Language;
}) {
  // The server renders the cookie's language (English without one); browser storage is
  // read only after hydration, so nothing here reads it during render.
  const [chosen, setLanguageState] = useState<Language>(initialLanguage);
  const arabicAvailable = arabicEnabled || onAdmin;
  const language = effectiveLanguage(chosen, arabicEnabled, onAdmin);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
      stored = null;
    }
    const fromLink = languageFromSearch(window.location.search);
    if (fromLink) {
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, fromLink);
      } catch {
        /* private browsing */
      }
      rememberCookie(fromLink);
      setLanguageState(fromLink);
      return;
    }
    // Storage blocked: the cookie still carries the saved choice.
    const resolved = resolveLanguage(
      stored ?? languageFromCookie(document.cookie) ?? initialLanguage,
      window.navigator.language || "ar",
    );
    // Returning visitors who chose before the cookie existed get it now; no choice, no cookie.
    if (stored && languageFromCookie(document.cookie) !== resolved) rememberCookie(resolved);
    setLanguageState(resolved);
  }, [initialLanguage]);

  const setLanguage = useCallback(
    (next: Language) => {
      // With Arabic switched off, visitor pages ignore requests to change into it.
      if (effectiveLanguage(next, arabicEnabled, onAdmin) !== next) return;
      setLanguageState(next);
      rememberCookie(next);
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
      } catch {
        // Private browsing: the choice still applies for this visit.
      }
    },
    [arabicEnabled, onAdmin],
  );

  useEffect(() => {
    const html = document.documentElement;
    html.lang = language;
    html.dir = directionOf(language);
    // The first-paint direction hint is only needed until React applies the language.
    html.style.removeProperty("direction");
    html.style.removeProperty("text-align");
  }, [language]);

  const value = useMemo<LanguageValue>(
    () => ({
      language,
      dir: directionOf(language),
      setLanguage,
      arabicAvailable,
      t: (key) => dictionaries[language][key],
    }),
    [language, setLanguage, arabicAvailable],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageValue {
  return useContext(LanguageContext);
}
