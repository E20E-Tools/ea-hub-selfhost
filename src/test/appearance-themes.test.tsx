import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { defaultSettings, type Catalog } from "@/lib/catalog";
import { DESIGN_THEMES, type DesignThemeId } from "@/lib/design-themes";

const transport = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/lib/admin.functions", () => ({ saveAppearanceSettings: transport.save }));
vi.mock("@/components/ui/slider", () => ({ Slider: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { AppearanceSettings } from "@/components/admin/settings-appearance";

afterEach(() => {
  cleanup();
  transport.save.mockReset();
});

const newIds: DesignThemeId[] = ["circuit-core", "transformation-board"];
it.each(newIds)(
  "%s previews, discards, saves through the appearance transport, and reloads",
  async (theme) => {
    let stored = structuredClone(defaultSettings);
    stored.designTheme = { theme: "classic", animations: false, intensity: "low" };
    const original = structuredClone(stored);
    transport.save.mockImplementation(async ({ data }) => {
      stored = { ...stored, ...data };
      return { ok: true };
    });
    const mount = () =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <AppearanceSettings catalog={{ settings: stored, products: [] } satisfies Catalog} />
        </QueryClientProvider>,
      );
    const view = mount();
    const meta = DESIGN_THEMES.find((item) => item.id === theme);
    if (!meta) throw new Error("missing theme");
    fireEvent.click(screen.getByRole("radio", { name: meta.name.en }));
    expect(document.documentElement.dataset["designTheme"]).toBe(theme);
    expect(transport.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(document.documentElement.dataset["designTheme"]).toBe("classic");
    fireEvent.click(screen.getByRole("radio", { name: meta.name.en }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(transport.save).toHaveBeenCalledTimes(1));
    expect(stored.designTheme).toEqual({ theme, animations: false, intensity: "low" });
    expect(stored.colors).toEqual(original.colors);
    expect(stored.headingFont).toBe(original.headingFont);
    view.unmount();
    mount();
    expect(screen.getByRole("radio", { name: meta.name.en }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(document.documentElement.dataset["designTheme"]).toBe(theme);
  },
);

it("failed saves keep the draft without replacing the saved theme", async () => {
  transport.save.mockResolvedValue({ ok: false, message: "errSaveAppearance" });
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <AppearanceSettings catalog={{ settings: defaultSettings, products: [] }} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Circuit Core" }));
  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
  await waitFor(() => expect(transport.save).toHaveBeenCalled());
  expect(document.documentElement.dataset["designTheme"]).toBe("circuit-core");
  view.unmount();
  expect(document.documentElement.dataset["designTheme"]).toBe("classic");
});

it("lists Classic plus nine experience themes, each previewing its own homepage", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppearanceSettings
        catalog={{ settings: structuredClone(defaultSettings), products: [] } satisfies Catalog}
      />
    </QueryClientProvider>,
  );
  // 19 homepage designs plus 4 product-page layouts.
  expect(screen.getAllByRole("radio")).toHaveLength(23);
  expect(screen.getByRole("radio", { name: "Transformation Board" })).toBeTruthy();
  const hrefs = [...document.querySelectorAll("a[href*='preview-theme=']")].map((a) =>
    a.getAttribute("href"),
  );
  expect(hrefs).toContain("/?preview-theme=transformation-board");
  expect(new Set(hrefs).size).toBe(hrefs.length);
});
