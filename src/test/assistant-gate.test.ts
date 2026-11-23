// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  issueAccessToken,
  issueChallenge,
  verifyAccessToken,
  verifyChallenge,
} from "@/lib/assistant-gate.server";
import { validateRegistration } from "@/lib/assistant-chat.functions";

const SECRET = "test-gate-secret";
const NOW = 1_800_000_000_000;

describe("assistant human verification challenge", () => {
  it("accepts the correct answer to its own question", async () => {
    const challenge = await issueChallenge(SECRET, NOW);
    expect(challenge.a + challenge.b).toBeGreaterThan(1);
    expect(
      await verifyChallenge(SECRET, challenge.token, String(challenge.a + challenge.b), NOW),
    ).toBe(true);
  });
  it("rejects a wrong answer", async () => {
    const challenge = await issueChallenge(SECRET, NOW);
    expect(
      await verifyChallenge(SECRET, challenge.token, String(challenge.a + challenge.b + 1), NOW),
    ).toBe(false);
  });
  it("rejects a tampered or expired challenge", async () => {
    const challenge = await issueChallenge(SECRET, NOW);
    expect(
      await verifyChallenge(
        SECRET,
        challenge.token.slice(0, -2) + "xx",
        String(challenge.a + challenge.b),
        NOW,
      ),
    ).toBe(false);
    expect(
      await verifyChallenge(
        SECRET,
        challenge.token,
        String(challenge.a + challenge.b),
        NOW + 11 * 60 * 1000,
      ),
    ).toBe(false);
  });
  it("rejects a challenge signed with another key", async () => {
    const challenge = await issueChallenge("other-secret", NOW);
    expect(
      await verifyChallenge(SECRET, challenge.token, String(challenge.a + challenge.b), NOW),
    ).toBe(false);
  });
});

describe("assistant access token", () => {
  it("round-trips name and email within 24 hours", async () => {
    const { token, exp } = await issueAccessToken(SECRET, "Khaled", "k@example.com", NOW);
    expect(exp).toBe(NOW + 24 * 60 * 60 * 1000);
    expect(await verifyAccessToken(SECRET, token, NOW + 60_000)).toMatchObject({
      name: "Khaled",
      email: "k@example.com",
    });
  });
  it("rejects expired, tampered and challenge tokens", async () => {
    const { token } = await issueAccessToken(SECRET, "Khaled", "k@example.com", NOW);
    expect(await verifyAccessToken(SECRET, token, NOW + 25 * 60 * 60 * 1000)).toBeNull();
    expect(await verifyAccessToken(SECRET, token.slice(0, -2) + "xx", NOW)).toBeNull();
    const challenge = await issueChallenge(SECRET, NOW);
    expect(await verifyAccessToken(SECRET, challenge.token, NOW)).toBeNull();
  });
});

describe("assistant registration input", () => {
  const valid = {
    name: "Khaled",
    email: "K@Example.com ",
    question: "Which tool fits EA?",
    token: "t",
    answer: "7",
    website: "",
    language: "en",
  };
  it("accepts a complete registration and normalizes the email", () => {
    expect(validateRegistration(valid)).toMatchObject({
      name: "Khaled",
      email: "k@example.com",
      language: "en",
    });
  });
  it("rejects a one-letter name or bad email, but allows both to be left empty", () => {
    expect(() => validateRegistration({ ...valid, name: "K" })).toThrow();
    expect(() => validateRegistration({ ...valid, email: "not-an-email" })).toThrow();
    expect(validateRegistration({ ...valid, name: " ", email: "" })).toMatchObject({
      name: "",
      email: "",
    });
  });
  it("accepts name, email and arithmetic answer without a first question or confirmation", () => {
    const { question, ...input } = valid;
    expect(validateRegistration(input)).toMatchObject({
      name: "Khaled",
      email: "k@example.com",
      question: "",
    });
  });
  it("rejects a missing verification answer", async () => {
    // The form shape allows Turnstile mode (no answer); the server still refuses the math check.
    const parsed = validateRegistration({ ...valid, answer: "" });
    expect(await verifyChallenge(SECRET, parsed.token, parsed.answer, NOW)).toBe(false);
    expect(() => validateRegistration({ ...valid, answer: "abc" })).toThrow();
  });
});

describe("challenge confidentiality", () => {
  it("does not reveal the answer when the token body is decoded", async () => {
    const challenge = await issueChallenge(SECRET, NOW);
    const body = challenge.token.slice(0, challenge.token.lastIndexOf("."));
    const decoded = atob(
      body.replaceAll("-", "+").replaceAll("_", "/") + "==".slice(0, (4 - (body.length % 4)) % 4),
    );
    expect(decoded).not.toContain("answer");
    expect(JSON.parse(decoded)).not.toHaveProperty("answer");
  });
});
