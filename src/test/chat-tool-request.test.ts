import { describe, expect, it } from "vitest";
import { OPEN_ASSISTANT_EVENT, openToolRequestInChat } from "@/lib/assistant-events";

describe("tool request inside the live chat", () => {
  it("opens the chat window carrying the chosen tool and problem", () => {
    let detail: unknown;
    const on = (e: Event) => (detail = (e as CustomEvent).detail);
    window.addEventListener(OPEN_ASSISTANT_EVENT, on);
    openToolRequestInChat({ product: { id: "apm", name: "APM" }, need: "no app map" });
    window.removeEventListener(OPEN_ASSISTANT_EVENT, on);
    expect(detail).toEqual({ modal: true, request: { product: { id: "apm", name: "APM" }, need: "no app map" } });
  });
});
