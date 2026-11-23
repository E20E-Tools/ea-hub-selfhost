// @vitest-environment node
import { describe, expect, it } from "vitest";
import { aiBaseUrlProblem, isOfficialGroq } from "@/lib/ai-settings.shared";
import { resolveAiKey } from "@/lib/recommend.server";
import {
  decryptSecret,
  deriveSigningSecret,
  encryptSecret,
  isEncrypted,
} from "@/lib/server-keys.server";

describe("AI base URL rule", () => {
  it("accepts public https providers", () => {
    expect(aiBaseUrlProblem("https://api.groq.com/openai/v1")).toBeNull();
    expect(aiBaseUrlProblem("https://openrouter.ai/api/v1")).toBeNull();
  });
  it.each([
    "http://api.groq.com/openai/v1",
    "https://localhost/v1",
    "https://127.0.0.1/v1",
    "https://10.0.0.5/v1",
    "https://172.16.0.1/v1",
    "https://192.168.1.1/v1",
    "https://169.254.169.254/latest",
    "https://[::1]/v1",
    "https://8.8.8.8/v1",
  ])("rejects %s", (url) => expect(aiBaseUrlProblem(url)).not.toBeNull());
});

describe("server Groq key only goes to api.groq.com", () => {
  it("uses the env key for the official host", () => {
    expect(resolveAiKey("https://api.groq.com/openai/v1", "", "env-key")).toBe("env-key");
  });
  it("never sends the env key to a custom host", () => {
    expect(resolveAiKey("https://evil.example.com/v1", "", "env-key")).toBe("");
    expect(isOfficialGroq("https://api.groq.com.evil.com/v1")).toBe(false);
  });
  it("uses a saved key for a custom host", () => {
    expect(resolveAiKey("https://openrouter.ai/api/v1", "saved", "env-key")).toBe("saved");
  });
});

describe("secrets at rest", () => {
  const root = "test-root-secret";
  it("encrypts and decrypts, never storing the plain value", async () => {
    const stored = await encryptSecret("smtp-pass", root);
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("smtp-pass");
    expect(await decryptSecret(stored, root)).toBe("smtp-pass");
    expect(await decryptSecret(stored, "other-root")).toBe("");
  });
  it("gate signing key differs from the raw service key", async () => {
    const key = await deriveSigningSecret("assistant-gate-v1", root);
    expect(key).not.toBe(root);
    expect(key).not.toBe(await deriveSigningSecret("settings-encryption-v1", root));
  });
});
