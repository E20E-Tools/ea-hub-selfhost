// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const req = vi.hoisted(() => ({ referer: "" }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({
    url: "https://www.e20e.tools/_serverFn/x",
    headers: new Headers(req.referer ? { referer: req.referer } : {}),
  }),
}));

import { visitPage } from "@/lib/live-chat.server";

describe("chat start page stays on this site", () => {
  it("collapses leading slashes so the admin link cannot point to another host", async () => {
    req.referer = "https://www.e20e.tools//evil.example/path?x=1";
    expect(await visitPage()).toBe("/evil.example/path?x=1");
  });
  it("keeps ordinary paths and ignores other sites", async () => {
    req.referer = "https://www.e20e.tools/request?type=support";
    expect(await visitPage()).toBe("/request?type=support");
    req.referer = "https://other.example/request";
    expect(await visitPage()).toBe("");
  });
});
