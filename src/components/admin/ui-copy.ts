/** Admin console copy hook: localized text, dates and numbers for the current language. */
import { useMemo } from "react";
import { adminText, type AdminCopyKey } from "@/lib/admin-copy";
import { formatDate } from "@/lib/format-date";
import { useLanguage } from "@/lib/language";

export function useAdminCopy() {
  const { language, dir, setLanguage } = useLanguage();
  return useMemo(
    () => ({
      language,
      dir,
      setLanguage,
      t: (key: AdminCopyKey | string, vars?: Record<string, string | number>) =>
        adminText(language, key, vars),
      date: (
        value: string | null | undefined,
        options?: Intl.DateTimeFormatOptions,
      ) => formatDate(value, language, options),
      number: (value: number) =>
        new Intl.NumberFormat(language === "ar" ? "ar" : "en").format(value),
    }),
    [language, dir, setLanguage],
  );
}
