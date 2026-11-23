import { createServerFn } from "@tanstack/react-start";
import { languageFromCookie, type Language } from "./language-core";

/** Saved language from the request cookie, so the server sends the right lang/dir first. */
export const getLanguageCookie = createServerFn({ method: "GET" }).handler(
  async (): Promise<Language | null> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    return languageFromCookie(getRequestHeader("cookie") ?? null);
  },
);

/** Server: the request cookie. Browser: document.cookie, with no network call. */
export async function savedLanguage(): Promise<Language | null> {
  if (typeof document !== "undefined") return languageFromCookie(document.cookie);
  return getLanguageCookie();
}
