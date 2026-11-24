import { describe, expect, it } from "vitest";
import {
  averageStars,
  cleanStars,
  commonQuestions,
  faqPromptBlock,
} from "@/lib/chat-feedback.shared";

describe("chat ratings and common questions", () => {
  it("accepts only whole stars from 1 to 5", () => {
    expect(cleanStars(1)).toBe(1);
    expect(cleanStars(5)).toBe(5);
    expect(cleanStars(0)).toBeNull();
    expect(cleanStars(6)).toBeNull();
    expect(cleanStars(3.5)).toBeNull();
    expect(cleanStars("4")).toBeNull();
  });
  it("averages to one decimal", () => {
    expect(averageStars([{ stars: 5 }, { stars: 4 }, { stars: 4 }])).toBe(4.3);
    expect(averageStars([])).toBeNull();
  });
  it("groups the same question written differently, most asked first", () => {
    const list = commonQuestions([
      { chat_id: "a", body: "What is Tech Radar?" },
      { chat_id: "b", body: "what is tech radar" },
      { chat_id: "c", body: "Pricing?" },
    ]);
    expect(list[0]).toMatchObject({ count: 2, chats: ["a", "b"] });
    expect(list[1]!.count).toBe(1);
  });
  it("gives the guide only approved answers, and nothing when there are none", () => {
    expect(faqPromptBlock([])).toBe("");
    expect(faqPromptBlock([{ question: "Q1", answer: "A1" }])).toContain(
      "ج: A1",
    );
  });
});
