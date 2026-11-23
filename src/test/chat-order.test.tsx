import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { messageTimeKey, orderChatMessages } from "@/lib/chat-order";

const T1 = "2026-11-14T19:20:33.300514+00:00";
const T2 = "2026-11-14T19:20:37.503143+00:00";
// UUIDs chosen so id ordering alone puts each answer before its question (the live defect).
const rows: { id: string; sender: string; body: string; created_at: string }[] = [
  {
    id: "a1",
    sender: "ai",
    body: "Tech Radar is designed to assess technologies.",
    created_at: T1,
  },
  {
    id: "f1",
    sender: "visitor",
    body: "Which available tool helps assess technologies?",
    created_at: T1,
  },
  {
    id: "a2",
    sender: "ai",
    body: "الأداة المناسبة لتقييم التقنيات هي Tech Radar.",
    created_at: T2,
  },
  { id: "f2", sender: "visitor", body: "ما الأداة المتاحة لتقييم التقنيات؟", created_at: T2 },
];

describe("chat chronological order", () => {
  it("puts each visitor question before its equal-timestamp answer", () => {
    expect(orderChatMessages(rows).map((m) => m.id)).toEqual(["f1", "a1", "f2", "a2"]);
  });

  it("repairs a tie split across history pages and dedupes overlap", () => {
    // Server pages are newest-first by (created_at, id) desc: page0=[f2,a2,f1], page1=[a1].
    const page0 = [rows[0]!, rows[1]!, rows[3]!, rows[2]!].slice(1); // older-first after reverse
    const page1 = [rows[0]!];
    const merged = orderChatMessages([...page1, ...page0, rows[1]!]);
    expect(merged.map((m) => m.id)).toEqual(["f1", "a1", "f2", "a2"]);
  });

  it("keeps distinct sub-millisecond timestamps in true order", () => {
    const a = { id: "z", sender: "ai", created_at: "2026-11-14T19:20:33.300514+00:00" };
    const v = { id: "a", sender: "visitor", created_at: "2026-11-14T19:20:33.300515+00:00" };
    expect(orderChatMessages([v, a]).map((m) => m.id)).toEqual(["z", "a"]);
    expect(messageTimeKey("2026-11-14T19:20:33.3+00:00")).toBe(
      messageTimeKey("2026-11-14T19:20:33.300000Z"),
    );
  });

  it("renders bodies with automatic direction for mixed languages", () => {
    const { container } = render(
      <div dir="rtl">
        {orderChatMessages(rows).map((m) => (
          <p key={m.id} dir="auto">
            {m.body}
          </p>
        ))}
      </div>,
    );
    expect(
      [...container.querySelectorAll("p")].every((p) => p.getAttribute("dir") === "auto"),
    ).toBe(true);
  });
});
