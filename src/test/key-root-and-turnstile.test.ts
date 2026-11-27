// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveSigningSecrets,
  encryptSecret,
  openSecret,
  rootSecrets,
} from "@/lib/server-keys.server";
import {
  TURNSTILE_REGISTER_ACTION,
  verifyTurnstile,
} from "@/lib/turnstile.server";

afterEach(() => vi.unstubAllEnvs());

describe("retiring the service key as a signing/encryption root", () => {
  const setRoots = (dedicated: string, retire: string) => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-root");
    vi.stubEnv("APP_ENCRYPTION_KEY", dedicated);
    vi.stubEnv("APP_ENCRYPTION_RETIRE_LEGACY", retire);
  };

  it("keeps the service key as the previous root by default", () => {
    setRoots("dedicated-root", "");
    expect(rootSecrets()).toEqual(["dedicated-root", "service-root"]);
  });

  it.each(["true", "TRUE", " true "])(
    "drops it when APP_ENCRYPTION_RETIRE_LEGACY=%j",
    (flag) => {
      setRoots("dedicated-root", flag);
      expect(rootSecrets()).toEqual(["dedicated-root"]);
    },
  );

  it.each(["false", "1", "yes"])("ignores other values (%j)", (flag) => {
    setRoots("dedicated-root", flag);
    expect(rootSecrets()).toEqual(["dedicated-root", "service-root"]);
  });

  it("never retires the only root: without APP_ENCRYPTION_KEY the flag is ignored", () => {
    setRoots("", "true");
    expect(rootSecrets()).toEqual(["service-root"]);
  });

  it("after retiring, values and tokens from the service-key root no longer open", async () => {
    setRoots("", "");
    const legacyValue = await encryptSecret("provider-key");
    const [legacySigning] = await deriveSigningSecrets("assistant-gate-v1");

    setRoots("dedicated-root", "");
    expect(await openSecret(legacyValue)).toEqual({
      plain: "provider-key",
      rewrap: true,
    });
    expect(await deriveSigningSecrets("assistant-gate-v1")).toContain(
      legacySigning,
    );

    setRoots("dedicated-root", "true");
    expect((await openSecret(legacyValue)).plain).toBe("");
    expect(await deriveSigningSecrets("assistant-gate-v1")).not.toContain(
      legacySigning,
    );
  });
});

describe("Turnstile answer must match this site and the registration widget", () => {
  const config = { siteKey: "site", secretKey: "secret" };
  const answer = (body: Record<string, unknown>) =>
    (async () => Response.json(body)) as unknown as typeof fetch;
  const expected = {
    hostname: "www.e20e.tools",
    action: TURNSTILE_REGISTER_ACTION,
  };

  it("accepts a token solved on this host for the registration widget", async () => {
    expect(
      await verifyTurnstile(
        config,
        "tok",
        "192.0.2.1",
        answer({
          success: true,
          hostname: "WWW.E20E.TOOLS",
          action: TURNSTILE_REGISTER_ACTION,
        }),
        expected,
      ),
    ).toBe(true);
  });

  it.each([
    ["another host", { hostname: "attacker.example" }],
    ["a missing host", { hostname: undefined }],
    ["another widget action", { action: "newsletter" }],
    ["a missing action", { action: undefined }],
  ])("refuses %s", async (_label, change) => {
    const body = {
      success: true,
      hostname: "www.e20e.tools",
      action: TURNSTILE_REGISTER_ACTION,
      ...change,
    };
    expect(
      await verifyTurnstile(config, "tok", "192.0.2.1", answer(body), expected),
    ).toBe(false);
  });

  it("without an expectation keeps the previous success-only check", async () => {
    expect(
      await verifyTurnstile(config, "tok", "", answer({ success: true })),
    ).toBe(true);
  });
});
