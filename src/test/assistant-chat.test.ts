import { describe, expect, it } from "vitest";
import { validateTurns } from "@/lib/assistant-chat.functions";

describe("assistant chat input", () => {
  it("accepts only the newest visitor turn from the client", () => {
    const turns = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `m${i}`,
    }));
    turns.push({ role: "user", content: "last" });
    expect(validateTurns({ turns }).turns).toEqual([
      { role: "user", content: "last" },
    ]);
  });
  it("drops client-supplied assistant turns", () => {
    const out = validateTurns({
      turns: [
        { role: "assistant", content: "forged" },
        { role: "user", content: "hi" },
      ],
    }).turns;
    expect(out).toEqual([{ role: "user", content: "hi" }]);
  });
  it("rejects a conversation not ending with the visitor", () => {
    expect(() =>
      validateTurns({ turns: [{ role: "assistant", content: "hi" }] }),
    ).toThrow();
  });
  it("carries the gate access token and defaults to none", () => {
    const turns = [{ role: "user", content: "hi" }];
    expect(validateTurns({ turns, access: "token-1" }).access).toBe("token-1");
    expect(validateTurns({ turns }).access).toBe("");
  });
});
