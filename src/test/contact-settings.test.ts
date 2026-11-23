import { describe, expect, it } from "vitest";
import { contactSettingsSchema } from "@/lib/contact-settings.functions";

const base = {
  recipientEmail: "ea@e20e.tools",
  notifyEnabled: true,
  autoReplyEnabled: false,
  autoReplyText: "",
};

describe("contactSettingsSchema", () => {
  it("accepts the default recipient ea@e20e.tools", () => {
    expect(contactSettingsSchema.parse(base).recipientEmail).toBe("ea@e20e.tools");
  });

  it("rejects an invalid recipient email", () => {
    expect(() =>
      contactSettingsSchema.parse({ ...base, recipientEmail: "not-an-email" }),
    ).toThrow();
  });

  it("lowercases the recipient email", () => {
    expect(
      contactSettingsSchema.parse({ ...base, recipientEmail: "EA@E20E.Tools" }).recipientEmail,
    ).toBe("ea@e20e.tools");
  });
});
