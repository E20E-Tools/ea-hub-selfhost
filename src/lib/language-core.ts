/**
 * Language rules with no React in them, so browser code, server code and data
 * mapping can all share the same behaviour.
 */
export type Language = "ar" | "en";
export type Direction = "rtl" | "ltr";

/** Key the visitor's choice is remembered under, in their own browser only. */
export const LANGUAGE_STORAGE_KEY = "e20e-language";

/**
 * Visitor's saved choice wins; with none, the site opens in Arabic.
 * Browser locale does not override the site's default.
 */
export function resolveLanguage(stored: string | null, browserLanguage: string): Language {
  if (stored === "ar" || stored === "en") return stored;
  void browserLanguage;
  return "ar";
}

/**
 * The language a page actually shows. When the admin switches Arabic off,
 * visitor pages show English; the admin console keeps both languages, and the
 * visitor's saved choice is left untouched so it returns if Arabic is re-enabled.
 */
export function effectiveLanguage(
  chosen: Language,
  arabicEnabled: boolean,
  onAdmin: boolean,
): Language {
  if (chosen === "ar" && !arabicEnabled && !onAdmin) return "en";
  return chosen;
}

/** Same choice mirrored in a first-party cookie so the server can send lang/dir up front. */
export const LANGUAGE_COOKIE = "e20e-language";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Reads the saved language from a Cookie header or document.cookie string. */
export function languageFromCookie(cookies: string | null | undefined): Language | null {
  if (!cookies) return null;
  for (const part of cookies.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LANGUAGE_COOKIE) {
      const value = rest.join("=").trim();
      return value === "ar" || value === "en" ? value : null;
    }
  }
  return null;
}

/** Cookie string for document.cookie; readable by the page, sent to this site only. */
export function languageCookie(language: Language, secure: boolean): string {
  return `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function directionOf(language: Language): Direction {
  return language === "ar" ? "rtl" : "ltr";
}

/**
 * Picks the wording for the visitor's language and falls back to the other one
 * when a field has not been filled in yet, so nothing ever renders blank.
 */
export function pick(language: Language, arabic: string, english: string): string {
  const wanted = (language === "en" ? english : arabic).trim();
  if (wanted) return wanted;
  return (language === "en" ? arabic : english).trim();
}

/** Same rule for lists: an empty English list falls back to the Arabic one. */
export function pickList(language: Language, arabic: string[], english: string[]): string[] {
  const usable = (items: string[]) =>
    Array.isArray(items)
      ? items.filter((item) => typeof item === "string" && item.trim() !== "")
      : [];
  const wanted = usable(language === "en" ? english : arabic);
  if (wanted.length > 0) return wanted;
  return usable(language === "en" ? arabic : english);
}
