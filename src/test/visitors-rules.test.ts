import { describe, expect, it } from "vitest";
import { summarizeVisitors } from "@/lib/visitors.shared";

describe("visitor customer records", () => {
  it("joins email case variants and counts support requests and chats separately", () => {
    const result = summarizeVisitors(
      [{ email: "Visitor@example.com", created_at: "2026-11-01" }],
      [{ email: "visitor@example.com", name: "Visitor", created_at: "2026-11-02" }],
      [
        {
          email: "VISITOR@example.com",
          name: "Visitor",
          request_type: "support",
          created_at: "2026-11-03",
        },
        {
          email: "visitor@example.com",
          name: "Visitor",
          request_type: "general",
          created_at: "2026-11-04",
        },
      ],
      [{ visitor_email: "visitor@example.com", visitor_name: "Visitor", created_at: "2026-11-05" }],
    );
    expect(result).toEqual([
      {
        email: "visitor@example.com",
        name: "Visitor",
        registeredAt: "2026-11-01",
        firstContactAt: "2026-11-01",
        requests: 2,
        supportRequests: 1,
        chats: 1,
        verified: false,
        openChatId: null,
        openChatStatus: null,
        openSupport: 0,
        lastPage: "",
      },
    ]);
  });
  it("does not invent account registration dates for visitors who only submit a request", () => {
    expect(
      summarizeVisitors(
        [],
        [],
        [
          {
            email: "contact@example.com",
            name: "Contact",
            request_type: "support",
            created_at: "2026-11-12",
          },
        ],
        [],
      )[0]?.registeredAt,
    ).toBeNull();
  });
});

describe("manual routing details", () => {
  it("flags verified accounts and picks the latest open chat, ignoring closed ones", async () => {
    const { summarizeVisitors } = await import("@/lib/visitors.shared");
    const [v] = summarizeVisitors(
      [{ email: "A@x.com", created_at: "2026-01-01", verified: true }],
      [],
      [],
      [
        {
          id: "c1",
          status: "ai",
          visitor_email: "a@x.com",
          visitor_name: "",
          created_at: "2026-02-01",
          last_message_at: "2026-02-01",
        },
        {
          id: "c2",
          status: "closed",
          visitor_email: "a@x.com",
          visitor_name: "",
          created_at: "2026-03-01",
          last_message_at: "2026-03-01",
        },
      ],
    );
    expect(v!.verified).toBe(true);
    expect(v!.openChatId).toBe("c1");
    expect(v!.chats).toBe(2);
  });
});

describe("support status and visit page", () => {
  it("counts only new and in-progress support requests as open, and keeps the latest chat page", () => {
    const [v] = summarizeVisitors(
      [],
      [],
      [
        {
          email: "a@x.com",
          name: "",
          request_type: "support",
          created_at: "2026-01-01",
          status: "in_progress",
        },
        {
          email: "a@x.com",
          name: "",
          request_type: "support",
          created_at: "2026-01-02",
          status: "resolved",
        },
      ],
      [
        {
          id: "c1",
          status: "closed",
          visitor_email: "a@x.com",
          visitor_name: "",
          created_at: "2026-01-01",
          last_message_at: "2026-01-01",
          start_page: "/old",
        },
        {
          id: "c2",
          status: "ai",
          visitor_email: "a@x.com",
          visitor_name: "",
          created_at: "2026-02-01",
          last_message_at: "2026-02-01",
          start_page: "/",
          last_page: "/product/radar",
        },
      ],
    );
    expect(v!.supportRequests).toBe(2);
    expect(v!.openSupport).toBe(1);
    expect(v!.lastPage).toBe("/product/radar");
  });
});
