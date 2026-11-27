import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { defaultSettings, type Catalog } from "@/lib/catalog";
import { DESIGN_THEMES, type DesignThemeId } from "@/lib/design-themes";

const transport = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/lib/admin.functions", () => ({
  saveAppearanceSettings: transport.save,
}));
vi.mock("@/components/ui/slider", () => ({ Slider: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { AppearanceSettings } from "@/components/admin/settings-appearance";

afterEach(() => {
  cleanup();
  transport.save.mockReset();
  // A test that stops midway must not leave its preview theme for the next one.
  delete document.documentElement.dataset["designTheme"];
});

// The settings panel is a large tree, and role queries compute visibility for every node.
// Skipping that check (hidden: true) keeps these interaction tests well inside their time
// budget on a loaded machine; the controls queried here are always visible.
const radio = (name: string) =>
  screen.getByRole("radio", { name, hidden: true });
const button = (name: RegExp) =>
  screen.getByRole("button", { name, hidden: true });
/** Render, preview, discard, save and reload: allow for a full-suite run on a slow machine. */
const INTERACTION_TIMEOUT_MS = 20_000;

const newIds: DesignThemeId[] = ["circuit-core", "transformation-board"];
it.each(newIds)(
  "%s previews, discards, saves through the appearance transport, and reloads",
  async (theme) => {
    let stored = structuredClone(defaultSettings);
    stored.designTheme = {
      theme: "classic",
      animations: false,
      intensity: "low",
    };
    const original = structuredClone(stored);
    transport.save.mockImplementation(async ({ data }) => {
      stored = { ...stored, ...data };
      return { ok: true };
    });
    const mount = () =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <AppearanceSettings
            catalog={{ settings: stored, products: [] } satisfies Catalog}
          />
        </QueryClientProvider>,
      );
    const view = mount();
    const meta = DESIGN_THEMES.find((item) => item.id === theme);
    if (!meta) throw new Error("missing theme");
    fireEvent.click(radio(meta.name.en));
    expect(document.documentElement.dataset["designTheme"]).toBe(theme);
    expect(transport.save).not.toHaveBeenCalled();
    fireEvent.click(button(/discard/i));
    expect(document.documentElement.dataset["designTheme"]).toBe("classic");
    fireEvent.click(radio(meta.name.en));
    fireEvent.click(button(/^save$/i));
    await waitFor(() => expect(transport.save).toHaveBeenCalledTimes(1));
    expect(stored.designTheme).toEqual({
      theme,
      animations: false,
      intensity: "low",
    });
    expect(stored.colors).toEqual(original.colors);
    expect(stored.headingFont).toBe(original.headingFont);
    view.unmount();
    mount();
    expect(radio(meta.name.en).getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.dataset["designTheme"]).toBe(theme);
  },
  INTERACTION_TIMEOUT_MS,
);

it(
  "failed saves keep the draft without replacing the saved theme",
  async () => {
    transport.save.mockResolvedValue({
      ok: false,
      message: "errSaveAppearance",
    });
    const view = render(
      <QueryClientProvider client={new QueryClient()}>
        <AppearanceSettings
          catalog={{ settings: defaultSettings, products: [] }}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(radio("Circuit Core"));
    fireEvent.click(button(/^save$/i));
    await waitFor(() => expect(transport.save).toHaveBeenCalled());
    expect(document.documentElement.dataset["designTheme"]).toBe(
      "circuit-core",
    );
    view.unmount();
    expect(document.documentElement.dataset["designTheme"]).toBe("classic");
  },
  INTERACTION_TIMEOUT_MS,
);

it("lists Classic plus nine experience themes, each previewing its own homepage", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppearanceSettings
        catalog={
          {
            settings: structuredClone(defaultSettings),
            products: [],
          } satisfies Catalog
        }
      />
    </QueryClientProvider>,
  );
  // 19 homepage designs plus 4 product-page layouts.
  expect(screen.getAllByRole("radio")).toHaveLength(23);
  expect(
    screen.getByRole("radio", { name: "Transformation Board" }),
  ).toBeTruthy();
  const hrefs = [...document.querySelectorAll("a[href*='preview-theme=']")].map(
    (a) => a.getAttribute("href"),
  );
  expect(hrefs).toContain("/?preview-theme=transformation-board");
  expect(new Set(hrefs).size).toBe(hrefs.length);
});
