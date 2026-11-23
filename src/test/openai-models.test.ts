import { describe, expect, it } from "vitest";
import { pickOpenAiChatModels } from "@/lib/ai-settings.shared";
describe("pickOpenAiChatModels", () => {
  it("keeps chat models and drops audio, image and embedding models", () => {
    const out = pickOpenAiChatModels([
      "gpt-5",
      "gpt-4o-mini",
      "whisper-1",
      "text-embedding-3-small",
      "gpt-image-1",
      "gpt-4o-mini-tts",
      "o3",
      "dall-e-3",
    ]);
    expect(out).toEqual(["o3", "gpt-5", "gpt-4o-mini"]);
  });
});
