import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_MY_TOOLS,
  MAX_COMPARE,
  MY_TOOLS_CHANGED,
  MY_TOOLS_KEY,
  readMyTools,
  productIds,
  toggleComparison,
  type MyToolsValue,
} from "./my-tools";

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Minimal local IDs only; storage and cross-tab failures never block catalog browsing. */
export function useMyTools() {
  const [value, setValue] = useState<MyToolsValue>(EMPTY_MY_TOOLS);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<"ok" | "malformed" | "unavailable">("ok");
  const [limited, setLimited] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const commit = useCallback((next: MyToolsValue) => {
    valueRef.current = next;
    setValue(next);
    try {
      const store = localStore();
      if (!store) throw new Error("unavailable");
      store.setItem(MY_TOOLS_KEY, JSON.stringify(next));
      setStatus("ok");
      window.dispatchEvent(new Event(MY_TOOLS_CHANGED));
    } catch {
      setStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    const refresh = () => {
      const read = readMyTools(localStore());
      valueRef.current = read.value;
      setValue(read.value);
      setStatus(read.status);
      setHydrated(true);
    };
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === MY_TOOLS_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(MY_TOOLS_CHANGED, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MY_TOOLS_CHANGED, refresh);
    };
  }, []);

  const current = () => {
    const read = readMyTools(localStore());
    return read.status === "unavailable" ? valueRef.current : read.value;
  };
  const toggleFavorite = useCallback(
    (id: string) => {
      const before = current();
      const favorites = before.favorites.includes(id)
        ? before.favorites.filter((item) => item !== id)
        : [...before.favorites, id].slice(-100);
      commit({ ...before, favorites });
    },
    [commit],
  );
  const toggleCompare = useCallback(
    (id: string) => {
      const before = current();
      const result = toggleComparison(before.compare, id);
      setLimited(result.limited);
      if (!result.limited) commit({ ...before, compare: result.ids });
      return !result.limited;
    },
    [commit],
  );
  const replaceCompare = useCallback((ids: string[]) => commit({ ...current(), compare: productIds(ids, MAX_COMPARE) }), [commit]);
  const clearCompare = useCallback(() => commit({ ...current(), compare: [] }), [commit]);
  const clearFavorites = useCallback(() => {
    const before = current();
    commit({ ...before, favorites: [] });
    return before.favorites;
  }, [commit]);
  const restoreFavorites = useCallback((removed: string[]) => {
    const before = current();
    commit({ ...before, favorites: productIds([...before.favorites, ...removed], 100) });
  }, [commit]);
  const removeFavorite = useCallback(
    (id: string) => {
      const before = current();
      if (before.favorites.includes(id)) {
        commit({ ...before, favorites: before.favorites.filter((item) => item !== id) });
      }
    },
    [commit],
  );
  return {
    ...value,
    hydrated,
    status,
    limited,
    maxCompare: MAX_COMPARE,
    toggleFavorite,
    toggleCompare,
    replaceCompare,
    clearCompare,
    clearFavorites,
    restoreFavorites,
    removeFavorite,
  };
}
