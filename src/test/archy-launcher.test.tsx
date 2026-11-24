import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArchyLauncher } from "@/components/archy-launcher";
import {
  LanguageProvider,
  LANGUAGE_STORAGE_KEY,
  useLanguage,
} from "@/lib/language";
import {
  ARCHY_GREETING_VISIBLE_MS,
  ARCHY_MUTED_STORAGE_KEY,
} from "@/lib/archy-mascot";
import { pickArchyVoice } from "@/lib/archy-speech";

const gesture = () =>
  document.querySelector(".archy-dock")?.getAttribute("data-gesture");
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  ClientOnly: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/archy-guide", () => ({
  ArchyGuide: () => <div data-testid="archy-guide" />,
}));
vi.mock("@/lib/catalog.functions", () => ({
  catalogQueryOptions: {
    queryKey: ["catalog"],
    queryFn: async () => ({ products: [], settings: {} }),
  },
}));
const voice = (lang: string) => ({ lang, name: lang }) as SpeechSynthesisVoice;
const speech = {
  speak: vi.fn(),
  cancel: vi.fn(),
  getVoices: vi.fn(() => [voice("en-US"), voice("ar-EG"), voice("ar-SA")]),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

class MockUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  lang = "";
  rate = 1;
  pitch = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function mount(withLanguageSwitch = false, open = false) {
  function SwitchLanguage() {
    const { setLanguage } = useLanguage();
    return (
      <button onClick={() => setLanguage("ar")}>Switch test language</button>
    );
  }
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LanguageProvider>
        {withLanguageSwitch && <SwitchLanguage />}
        <ArchyLauncher
          open={open}
          onClose={() => undefined}
          onChoose={() => undefined}
        />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  speech.speak.mockClear();
  speech.cancel.mockReset();
  speech.getVoices.mockReset();
  speech.getVoices.mockImplementation(() => [
    voice("en-US"),
    voice("ar-EG"),
    voice("ar-SA"),
  ]);
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: speech,
  });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    value: MockUtterance,
  });
});

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("automatically waves and speaks on arrival only once per session", async () => {
  vi.useFakeTimers();
  const first = mount();
  await act(async () => undefined);
  expect(
    first.getByText("Hello! I’m Archy, and I’m ready to help."),
  ).toBeInTheDocument();
  expect(gesture()).toBe("Wave");
  expect(speech.speak).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(ARCHY_GREETING_VISIBLE_MS));
  expect(
    first.queryByText("Hello! I’m Archy, and I’m ready to help."),
  ).toBeNull();
  first.unmount();
  const second = mount();
  await act(async () => undefined);
  expect(
    second.queryByText("Hello! I’m Archy, and I’m ready to help."),
  ).toBeNull();
  expect(speech.speak).toHaveBeenCalledTimes(1);
});

it("keeps Archy static with reduced motion", async () => {
  window.matchMedia = vi.fn(
    (query) =>
      ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
  mount();
  await act(async () => undefined);
  expect(gesture()).toBe("Idle");
});

it("keeps Atlas visible in both display modes", async () => {
  const view = mount();
  await act(async () => undefined);
  expect(view.container.querySelector(".atlas-head")).toBeVisible();
  fireEvent.click(view.getByRole("button", { name: "Play with Archy" }));
  fireEvent.click(view.getByRole("button", { name: "Read a book" }));
  expect(gesture()).toBe("Read");
  fireEvent.click(view.getByRole("button", { name: "Archy lightweight mode" }));
  expect(gesture()).toBe("Idle");
  expect(view.container.querySelector(".archy-poster")).toBeVisible();
  fireEvent.click(view.getByRole("button", { name: "Animate Archy" }));
  expect(view.container.querySelectorAll(".atlas-joint")).toHaveLength(4);
});

it("still waves automatically but never speaks when the visitor saved mute", async () => {
  localStorage.setItem(ARCHY_MUTED_STORAGE_KEY, "muted");
  mount();
  await act(async () => undefined);
  expect(gesture()).toBe("Wave");
  expect(speech.speak).not.toHaveBeenCalled();
});

it("pauses the scene when the document becomes hidden", async () => {
  mount();
  await act(async () => undefined);
  const original = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: true,
  });
  fireEvent(document, new Event("visibilitychange"));
  expect(gesture()).toBe("Idle");
  // document.hidden lives on Document.prototype; drop the own override so later tests see a visible tab.
  if (original) Object.defineProperty(document, "hidden", original);
  else delete (document as unknown as Record<string, unknown>)["hidden"];
});

it("uses the Saudi Arabic voice and cancels speech when muted or unmounted", async () => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, "ar");
  const view = mount();
  await act(async () => undefined);
  speech.speak.mockClear(); // Isolate manual replays from the arrival greeting.
  fireEvent.click(view.getByRole("button", { name: "اسمع الترحيب" }));
  expect(speech.speak).toHaveBeenCalledTimes(1);
  const utterance = speech.speak.mock.calls[0]![0] as MockUtterance;
  expect(utterance.voice?.lang).toBe("ar-SA");
  expect(utterance.text).toBe("مرحبًا! أنا أرشي، أنا مستعد للمساعدة.");
  fireEvent.click(view.getByRole("button", { name: "كتم صوت أرشي" }));
  expect(localStorage.getItem(ARCHY_MUTED_STORAGE_KEY)).toBe("muted");
  expect(speech.cancel).toHaveBeenCalled();
  expect(view.getByRole("button", { name: "اسمع الترحيب" })).toBeDisabled();
  view.unmount();
  expect(speech.cancel).toHaveBeenCalled();
});

it("cancels English speech on a language switch and replays in Arabic", async () => {
  const view = mount(true);
  await act(async () => undefined);
  speech.speak.mockClear(); // Isolate manual replays from the arrival greeting.
  fireEvent.click(view.getByRole("button", { name: "Hear greeting" }));
  expect(speech.speak).toHaveBeenCalledTimes(1);
  fireEvent.click(view.getByRole("button", { name: "Switch test language" }));
  expect(speech.cancel).toHaveBeenCalled();
  fireEvent.click(view.getByRole("button", { name: "اسمع الترحيب" }));
  expect(speech.speak).toHaveBeenCalledTimes(2);
  const utterance = speech.speak.mock.calls[1]![0] as MockUtterance;
  expect(utterance.voice?.lang).toBe("ar-SA");
  expect(utterance.text).toBe("مرحبًا! أنا أرشي، أنا مستعد للمساعدة.");
});

it("honors saved mute and reports a missing matching voice without speaking", async () => {
  localStorage.setItem(ARCHY_MUTED_STORAGE_KEY, "muted");
  speech.getVoices.mockImplementation(() => [voice("ar-SA")]);
  const view = mount();
  await act(async () => undefined);
  expect(view.getByRole("button", { name: "Hear greeting" })).toBeDisabled();
  fireEvent.click(view.getByRole("button", { name: "Unmute Archy" }));
  fireEvent.click(view.getByRole("button", { name: "Hear greeting" }));
  expect(speech.speak).not.toHaveBeenCalled();
  expect(
    view.getByText(
      "A matching voice is unavailable here; you can read the greeting instead.",
    ),
  ).toBeInTheDocument();
});

it("chooses a Saudi Arabic voice first, then any Arabic voice", () => {
  expect(
    pickArchyVoice([voice("en-US"), voice("ar-EG"), voice("ar-SA")], "ar")
      ?.lang,
  ).toBe("ar-SA");
  expect(pickArchyVoice([voice("en-US"), voice("ar-EG")], "ar")?.lang).toBe(
    "ar-EG",
  );
  expect(pickArchyVoice([voice("fr-FR")], "en")).toBeNull();
});

it("replays a wave and renews the bubble interval on Hear greeting", async () => {
  vi.useFakeTimers();
  const view = mount();
  await act(async () => undefined);
  act(() => vi.advanceTimersByTime(5_000));
  fireEvent.click(view.getByRole("button", { name: "Hear greeting" }));
  expect(gesture()).toBe("Wave");
  act(() => vi.advanceTimersByTime(5_000));
  expect(
    view.getByText("Hello! I’m Archy, and I’m ready to help."),
  ).toBeInTheDocument();
  expect(speech.speak).toHaveBeenCalledTimes(2);
});

it("pauses the scene while the chat is open", async () => {
  mount(false, true);
  await act(async () => undefined);
  expect(gesture()).toBe("Idle");
});

it("never pops a floating guide card; Archy's choices live inside the chat", async () => {
  vi.useFakeTimers();
  const view = mount();
  await act(async () => undefined);
  act(() => vi.advanceTimersByTime(ARCHY_GREETING_VISIBLE_MS + 60_000));
  expect(view.queryByTestId("archy-guide")).toBeNull();
});

it.each(["getVoices", "cancel"] as const)(
  "keeps greeting and launcher usable when optional speech %s throws",
  async (method) => {
    speech[method].mockImplementation(() => {
      throw new Error("speech unavailable");
    });
    const view = mount(true);
    await act(async () => undefined);
    expect(
      view.getByRole("button", { name: "Open chat with Archy" }),
    ).toBeInTheDocument();
    expect(
      view.getByText("Hello! I’m Archy, and I’m ready to help."),
    ).toBeInTheDocument();
    fireEvent.click(view.getByRole("button", { name: "Hear greeting" }));
    fireEvent.click(view.getByRole("button", { name: "Switch test language" }));
    expect(() => view.unmount()).not.toThrow();
  },
);
