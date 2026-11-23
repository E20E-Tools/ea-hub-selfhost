export const OPEN_ASSISTANT_EVENT = "e20e:open-assistant";
/** Fired after the browser saves or removes a signed Archy guest pass, so pages can re-read it. */
export const ASSISTANT_SESSION_EVENT = "e20e:assistant-session";
/** Optional detail for OPEN_ASSISTANT_EVENT: centered window mode and a prefilled message. */
export type ChatToolRequest = { product: { id: string; name: string } | null; need: string };
export type OpenAssistantDetail = {
  modal?: boolean;
  comparison?: { id: string; name: string }[];
  draft?: string | undefined;
  /** Shows the tool request form inside the chat window. */
  request?: ChatToolRequest | undefined;
};
/** Opens the live chat as a centered window, like the tool request window. */
export function openAssistantWindow(draft?: string, comparison?: OpenAssistantDetail["comparison"]) {
  window.dispatchEvent(
    new CustomEvent<OpenAssistantDetail>(OPEN_ASSISTANT_EVENT, { detail: { modal: true, draft, ...(comparison ? { comparison } : {}) } }),
  );
}
/** Opens the live chat window with the tool request form inside it. */
export function openToolRequestInChat(request: ChatToolRequest) {
  window.dispatchEvent(
    new CustomEvent<OpenAssistantDetail>(OPEN_ASSISTANT_EVENT, { detail: { modal: true, request } }),
  );
}
