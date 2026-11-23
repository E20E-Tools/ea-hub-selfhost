import { useSyncExternalStore } from "react";

export const directions = {
  atlas: { ar: "الأطلس الهندسي", en: "Engineering Atlas" },
  signal: { ar: "مرصد الإشارات", en: "Signal Observatory" },
  journal: { ar: "دفتر القرار", en: "Decision Journal" },
} as const;
export type DirectionId = keyof typeof directions;
const key = "ea-studio-direction";
const changeEvent = "ea:direction-change";
function read(): DirectionId {
  const value = document.documentElement.dataset["studio"];
  return value === "signal" || value === "journal" ? value : "atlas";
}
function refresh() {
  try {
    const value = localStorage.getItem(key);
    document.documentElement.dataset["studio"] =
      value === "signal" || value === "journal" ? value : "atlas";
  } catch {
    /* The current tab keeps its choice when storage is unavailable. */
  }
}
function subscribe(listener: () => void) {
  const sync = (event: StorageEvent) => {
    if (!event.key || event.key === key) {
      refresh();
      listener();
    }
  };
  window.addEventListener(changeEvent, listener);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener("storage", sync);
  };
}
export function useDirection() {
  return useSyncExternalStore(subscribe, read, () => "atlas" as DirectionId);
}
export function chooseDirection(id: DirectionId) {
  document.documentElement.dataset["studio"] = id;
  try {
    localStorage.setItem(key, id);
  } catch {
    /* Selection still applies to this page. */
  }
  window.dispatchEvent(new Event(changeEvent));
}
export const directionBootstrap = `try{var d=localStorage.getItem("ea-studio-direction");document.documentElement.dataset.studio=d==="signal"||d==="journal"?d:"atlas"}catch(e){}`;
