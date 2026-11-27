// EA-Hub self-host: prepares the database. Safe to run on every start (compose `migrate`
// service, Helm pre-install/pre-upgrade Job, or by hand):
//
//   node selfhost/scripts/migrate.mjs
//
// 1. waits for Postgres
// 2. selfhost/db/00-bootstrap.sql   (roles, auth/storage schemas — replaces the Supabase platform)
// 3. drizzle/migrations             (the upstream migrations, unchanged)
// 4. selfhost/db/90-post-migrate.sql (buckets, realtime triggers)
// 5. the app's login role (least privilege, password from APP_DB_PASSWORD)
// 6. the first admin account from ADMIN_EMAIL / ADMIN_PASSWORD (created once, never overwritten
//    unless ADMIN_RESET_PASSWORD=true)
//
// Connection strings and passwords are never printed.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { databaseUrl, ensureAdmin, hostOf, waitForDatabase } from "./lib.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const log = (msg) => console.log(`[migrate] ${msg}`);

let url;
try {
  url = databaseUrl({ admin: true });
} catch (error) {
  console.error(`[migrate] ${error.message}`);
  process.exit(2);
}

const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 10 });
const ident = (name) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`invalid role name: ${name}`);
  return `"${name}"`;
};

try {
  log(`waiting for database on ${hostOf(url)} …`);
  await waitForDatabase(sql, Number(process.env.DB_WAIT_SECONDS || 120));
  // One migrator at a time (Helm Job and a manual run, or several replicas).
  await sql`select pg_advisory_lock(727274001)`;

  log("bootstrap (roles, auth, storage) …");
  await sql.unsafe(await readFile(`${root}selfhost/db/00-bootstrap.sql`, "utf8"));

  log("upstream migrations …");
  await migrate(drizzle(sql), { migrationsFolder: `${root}drizzle/migrations` });
  const [{ count }] = await sql`select count(*)::int as count from drizzle.__drizzle_migrations`;
  log(`${count} migrations applied in total`);

  log("post-migrate (buckets, realtime) …");
  await sql.unsafe(await readFile(`${root}selfhost/db/90-post-migrate.sql`, "utf8"));

  const appUser = process.env.APP_DB_USER || "eahub_app";
  const appPassword = process.env.APP_DB_PASSWORD;
  const [{ current_user: owner }] = await sql`select current_user`;
  const [{ bypass }] =
    await sql`select rolbypassrls as bypass from pg_roles where rolname = 'service_role'`;
  if (!bypass) {
    // Owner mode (managed PostgreSQL without BYPASSRLS): the app must log in as the owner
    // of the tables, which RLS does not restrict. The owner needs the API roles to switch to.
    await sql.unsafe(`grant anon, authenticated, service_role to ${ident(owner)}`);
    log(
      `owner mode: this database does not allow BYPASSRLS (normal for managed PostgreSQL). ` +
        `Run the app with APP_DB_USER=${owner} and that account's password (see docs/en/deploy-cloud-containers.md).`,
    );
  } else if (appPassword && appUser !== owner) {
    const role = ident(appUser);
    const [exists] = await sql`select 1 from pg_roles where rolname = ${appUser}`;
    // The password goes in as a literal (ALTER ROLE does not take parameters); quote it safely.
    const literal = `'${String(appPassword).replace(/'/g, "''")}'`;
    await sql.unsafe(
      exists
        ? `alter role ${role} with login inherit bypassrls nosuperuser nocreatedb nocreaterole password ${literal}`
        : `create role ${role} with login inherit bypassrls nosuperuser nocreatedb nocreaterole password ${literal}`,
    );
    await sql.unsafe(`
      grant anon, authenticated, service_role to ${role};
      grant usage on schema public, auth, storage, extensions to ${role};
      grant all on all tables in schema auth to ${role};
      grant usage, select on all sequences in schema auth to ${role};
      grant all on all tables in schema storage to ${role};
      grant all on all tables in schema public to ${role};
      grant usage, select on all sequences in schema public to ${role};
      grant execute on all functions in schema public to ${role};
      grant connect on database ${ident((await sql`select current_database() as d`)[0].d)} to ${role};
    `);
    log(`app role ${appUser} ready`);
  }

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const action = await ensureAdmin(sql, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, {
      reset: process.env.ADMIN_RESET_PASSWORD === "true",
    });
    log(`admin account ${action}`);
  } else {
    const [{ n }] = await sql`select count(*)::int as n from public.user_roles where role = 'admin'`;
    if (n === 0) log("no admin yet — set ADMIN_EMAIL and ADMIN_PASSWORD and run again");
  }
  log("done");
} catch (error) {
  console.error(`[migrate] failed: ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
