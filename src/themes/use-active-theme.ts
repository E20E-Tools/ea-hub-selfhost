import { useEffect, useState } from "react";
import { isDesignThemeId, type DesignThemeId } from "@/lib/design-themes";

/** Follows `data-design-theme` on <html> (saved theme, admin draft or tab preview). */
export function useActiveTheme(initial: DesignThemeId): DesignThemeId {
  const [theme, setTheme] = useState<DesignThemeId>(initial);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => {
      const value = el.dataset["designTheme"];
      setTheme(isDesignThemeId(value) ? value : "classic");
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-design-theme"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}
