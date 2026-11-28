// Browser test of the admin console sign-in: password, and single sign-on through a real
// Keycloak. Run by CI (job "browser-e2e") against the docker compose stack:
//   E2E_BASE_URL=http://localhost:8080 node selfhost/e2e/admin-sso.e2e.mjs
import { chromium } from "playwright-core";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "e2e-admin-password";
const SIGN_OUT = /^(Sign out|تسجيل الخروج)$/;
const NOT_ADMIN = /This account isn't an admin|هذا الحساب ليس حساب إدارة/;
const SSO_BUTTON = /organisation account/i;

const browser = await chromium.launch();
let failed = false;

async function step(name, fn) {
  const context = await browser.newContext({ locale: "en-US" });
  const page = await context.newPage();
  try {
    await fn(page);
    console.log(`ok   ${name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${name}\n     ${error.message.split("\n")[0]}`);
    await page
      .screenshot({
        path: `e2e-${name.replace(/\W+/g, "-")}.png`,
        fullPage: true,
      })
      .catch(() => {});
  } finally {
    await context.close();
  }
}

async function adminConsoleShown(page) {
  await page
    .getByRole("button", { name: SIGN_OUT })
    .first()
    .waitFor({ timeout: 30_000 });
  if (await page.getByText(NOT_ADMIN).count())
    throw new Error("signed in, but not as an admin");
}

async function keycloakLogin(page, user, password) {
  await page.getByRole("button", { name: SSO_BUTTON }).click();
  await page.waitForURL(/\/realms\/ea-hub\/protocol\/openid-connect\/auth/, {
    timeout: 30_000,
  });
  await page.fill("#username", user);
  await page.fill("#password", password);
  await page.click("#kc-login");
}

await step("password sign-in reaches the admin console", async (page) => {
  await page.goto(`${BASE}/admin`);
  await page.fill("#admin-email", ADMIN_EMAIL);
  await page.fill("#admin-password", ADMIN_PASSWORD);
  await page.getByRole("button", { name: /^(Sign in|دخول)$/ }).click();
  await adminConsoleShown(page);
});

await step("SSO button is shown on the sign-in page", async (page) => {
  await page.goto(`${BASE}/admin`);
  await page
    .getByRole("button", { name: SSO_BUTTON })
    .waitFor({ timeout: 30_000 });
});

await step("SSO: a member of ea-admins becomes an admin", async (page) => {
  await page.goto(`${BASE}/admin`);
  await keycloakLogin(page, "alice", "ci-alice-password");
  await page.waitForURL(`${BASE}/admin**`, { timeout: 30_000 });
  await adminConsoleShown(page);
  if (page.url().includes("access_token"))
    throw new Error("tokens left in the address bar");
});

await step(
  "SSO: a staff member without an account is refused",
  async (page) => {
    await page.goto(`${BASE}/admin`);
    await keycloakLogin(page, "bob", "ci-bob-password");
    await page.waitForURL(/sso_error|\/admin/, { timeout: 30_000 });
    await page
      .getByText(/no access to EA-Hub yet|لا يملك صلاحية/)
      .waitFor({ timeout: 30_000 });
  },
);

await step(
  "SSO: an e-mail outside the allowed domains is refused",
  async (page) => {
    await page.goto(`${BASE}/admin`);
    await keycloakLogin(page, "eve", "ci-eve-password");
    await page
      .getByText(/no access to EA-Hub yet|لا يملك صلاحية/)
      .waitFor({ timeout: 30_000 });
    if (await page.getByRole("button", { name: SIGN_OUT }).count())
      throw new Error("an outsider got a session");
  },
);

await browser.close();
if (failed) process.exit(1);
console.log("all browser checks passed");
