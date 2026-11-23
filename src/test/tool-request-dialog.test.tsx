import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sent: 0, forms: [] as FormData[] }));

vi.mock("@/lib/requests.functions", () => ({
  submitRequest: async ({ data }: { data: FormData }) => {
    h.sent += 1;
    h.forms.push(data);
    return {
      ok: true as const,
      id: "11111111-2222-3333-4444-555555555555",
      createdAt: "2026-11-17T12:00:00.000Z",
    };
  },
}));
vi.mock("@/lib/current-visitor-access", () => ({
  currentVisitorAccess: async () => "",
  currentAuthUser: async () => ({ kind: "guest" }),
}));
vi.mock("@/components/visit-tracker", () => ({ VisitTracker: () => null }));

import { LanguageProvider } from "@/lib/language";
import { ToolRequestDialog } from "@/components/tool-request-dialog";

const PRODUCT = { id: "apm-landscape", name: "APM & App Landscape" };

function open(onOpenChange = vi.fn()) {
  window.localStorage.setItem("e20e-language", "ar");
  return render(
    <LanguageProvider initialLanguage="ar">
      <ToolRequestDialog
        open
        product={PRODUCT}
        need="لا نرى خريطة تطبيقاتنا"
        onOpenChange={onOpenChange}
      />
    </LanguageProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  h.sent = 0;
  h.forms.length = 0;
});

describe("tool request window", () => {
  it("names the tool the visitor was shown", () => {
    open();
    expect(screen.getByText("طلب الأداة: APM & App Landscape")).toBeTruthy();
  });

  it("keeps an incomplete request from being sent", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "إرسال الطلب" }));
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(screen.getAllByText("اكتب اسمك الكامل.").length).toBeGreaterThan(0);
    expect(h.sent).toBe(0);
  });

  it("asks for phone and urgency only for a support request", () => {
    open();
    expect(document.querySelector('input[type="tel"]')).toBeNull();
    fireEvent.click(screen.getByText("طلب دعم فني"));
    expect(document.querySelector('input[type="tel"]')).toBeTruthy();
    expect(screen.getByText("درجة الاستعجال")).toBeTruthy();
  });

  it("carries the typed problem and the selected tool into the saved request", async () => {
    open();
    fireEvent.change(screen.getByLabelText("الاسم الكامل"), { target: { value: "Khaled QA" } });
    fireEvent.change(document.querySelector('input[type="email"]')!, {
      target: { value: "khaled.qa@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "إرسال الطلب" }));
    await waitFor(() => expect(h.sent).toBe(1));
    const form = h.forms[0]!;
    expect(form.get("productId")).toBe("apm-landscape");
    expect(form.get("type")).toBe("new");
    expect(form.get("need")).toBe("لا نرى خريطة تطبيقاتنا");
    await waitFor(() => expect(screen.getByText("وصلنا طلبك")).toBeTruthy());
    expect(screen.getByText("11111111-2222-3333-4444-555555555555")).toBeTruthy();
  });
});
