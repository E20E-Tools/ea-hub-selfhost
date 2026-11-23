import { createHash, randomBytes } from "node:crypto";
import { getCookie, setCookie } from "@tanstack/react-start/server";
export function contactOwner(create = false) {
  const secure = process.env["NODE_ENV"] === "production";
  const key = secure ? "__Host-e20e-contact" : "e20e-contact";
  let secret = getCookie(key);
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) {
    if (!create) return null;
    secret = randomBytes(32).toString("hex");
    setCookie(key, secret, {
      path: "/",
      secure,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 90 * 86400,
    });
  }
  const hex = createHash("sha256")
    .update("contact-owner:" + secret)
    .digest("hex");
  const id = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "4" + hex.slice(13, 16),
    "8" + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join("-");
  return { kind: "guest" as const, id, email: "" };
}
