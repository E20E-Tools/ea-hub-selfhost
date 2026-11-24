import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  themeFontsHref,
  themeMeta,
  type DesignThemeId,
} from "@/lib/design-themes";
import { useFontStylesheet } from "./use-theme-fonts";
import { fill } from "@/lib/copy";
import { useLanguage } from "@/lib/language";
import {
  PREVIEW_STORAGE_KEY,
  resolvePreviewTheme,
  stripPreviewParam,
} from "./preview";

function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(PREVIEW_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Applies `?preview-theme=` to this tab only and shows the floating exit bar. */
export function ThemePreview({ saved }: { saved: DesignThemeId }) {
  const { t, language, dir } = useLanguage();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const [preview, setPreview] = useState<DesignThemeId | null>(null);
  const onAdmin = pathname.startsWith("/admin");
  // A previewed design brings its own fonts, loaded only while it is previewed.
  useFontStylesheet(preview && !onAdmin ? themeFontsHref(preview) : "");

  useEffect(() => {
    const stored = readStored();
    const id = resolvePreviewTheme(window.location.search, stored);
    if (id && id !== stored) {
      try {
        window.sessionStorage.setItem(PREVIEW_STORAGE_KEY, id);
      } catch {
        /* storage blocked: preview lasts until reload */
      }
    }
    setPreview(id);
  }, [searchStr]);

  useEffect(() => {
    if (!preview) return;
    document.documentElement.dataset["designTheme"] = onAdmin ? saved : preview;
  }, [preview, onAdmin, saved]);

  if (!preview || onAdmin) return null;

  const end = () => {
    try {
      window.sessionStorage.removeItem(PREVIEW_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    document.documentElement.dataset["designTheme"] = saved;
    const { pathname: path, search, hash } = window.location;
    window.history.replaceState(
      window.history.state,
      "",
      `${path}${stripPreviewParam(search)}${hash}`,
    );
    setPreview(null);
  };

  return (
    <div className="theme-preview-bar" role="status" dir={dir}>
      <span>
        {fill(t("themePreviewing"), themeMeta(preview).name[language])}
      </span>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={end}>
        {t("themePreviewEnd")}
      </button>
    </div>
  );
}
