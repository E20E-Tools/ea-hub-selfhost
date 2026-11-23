import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { deriveApiKeys } from "tinbase";
import { createClient } from "@supabase/supabase-js";

const key = await readFile(
  new URL("../.local/signing-key", import.meta.url),
  "utf8",
);
const { serviceRoleKey } = await deriveApiKeys(key);
const client = createClient("http://127.0.0.1:54365", serviceRoleKey, {
  auth: { persistSession: false },
});
const file = new URL("../.local/admin.json", import.meta.url);
const email = "owner@ea-hub.test";
try {
  await writeFile(
    file,
    JSON.stringify(
      { email, password: randomBytes(24).toString("base64url") },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
const credentials = JSON.parse(await readFile(file, "utf8"));
const { data, error } = await client.auth.admin.createUser({
  ...credentials,
  email_confirm: true,
});
let id = data.user?.id;
if (!id) {
  const session = await client.auth.signInWithPassword(credentials);
  if (!session.data.user) throw error ?? session.error;
  id = session.data.user.id;
}
const admin = createClient("http://127.0.0.1:54365", serviceRoleKey, {
  auth: { persistSession: false },
});
const role = await admin
  .from("user_roles")
  .upsert({ user_id: id, role: "admin" }, { onConflict: "user_id,role" });
if (role.error) throw role.error;
console.log(
  "Local administrator ready. The credentials are in .local/admin.json.",
);
