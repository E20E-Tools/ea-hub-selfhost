import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createBackend, deriveApiKeys } from "tinbase";
import { serve, loadSupabaseProject, FsStorageDriver } from "tinbase/node";
import { createClient } from "@supabase/supabase-js";

const root = fileURLToPath(new URL("../", import.meta.url));
const local = path.join(root, ".local");
const backendProject = path.join(root, "local-backend");
const origin = "http://127.0.0.1:4175";
const api = "http://127.0.0.1:54365";
const mode = process.argv[2] ?? "serve";
if (!["serve", "dev", "build"].includes(mode))
  throw new Error("Unknown local run mode");
await mkdir(local, { recursive: true });
const secretFile = path.join(local, "signing-key");
try {
  await writeFile(secretFile, randomBytes(48).toString("hex"), {
    flag: "wx",
    mode: 0o600,
  });
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
const secret = await readFile(secretFile, "utf8");
const { anonKey, serviceRoleKey } = await deriveApiKeys(secret);
const env = {
  ...process.env,
  EA_LOCAL_DESIGN_LAB: path.join(root, "design-lab.html"),
  EA_LOCAL_SEMANTIC: pathToFileURL(path.join(backendProject, "semantic.mjs"))
    .href,
  SUPABASE_URL: api,
  VITE_SUPABASE_URL: api,
  SUPABASE_PUBLISHABLE_KEY: anonKey,
  VITE_SUPABASE_PUBLISHABLE_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  HOST: "127.0.0.1",
  PORT: "4175",
};
delete env.VERCEL;
let server, backend;
const realtimeSockets = new Set();
if (mode !== "build") {
  // A second launch must not open the same Postgres files.
  const lock = createServer((socket) => socket.end());
  await new Promise((resolve, reject) => {
    lock.once("error", (error) =>
      reject(
        new Error("EA-Hub is already running or its local lock port is busy.", {
          cause: error,
        }),
      ),
    );
    lock.listen(54364, "127.0.0.1", resolve);
  });
  lock.unref();
  const project = await loadSupabaseProject(backendProject);
  const storageDriver = new FsStorageDriver(path.join(local, "objects"));
  // Local image uploads are capped at 5 MB. Buffered reads close the file before
  // returning it, including when a browser cancels its image request mid-response.
  storageDriver.getStream = undefined;
  backend = await createBackend({
    ...project,
    host: "127.0.0.1",
    apiExternalUrl: api,
    siteUrl: origin,
    jwtSecret: secret,
    dataDir: path.join(local, "postgres"),
    storageDriver,
  });
  if (backend.db.migrationFailure)
    throw Error(JSON.stringify(backend.db.migrationFailure));
  server = await serve(backend, { host: "127.0.0.1", port: 54365 });
  // HTTP shutdown leaves upgraded realtime connections open.
  server.server.on("upgrade", (_request, socket) => {
    realtimeSockets.add(socket);
    socket.once("close", () => realtimeSockets.delete(socket));
  });
  const client = createClient(api, backend.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error) throw error;
  for (const id of ["library-assets", "request-attachments"]) {
    const options = {
      public: false,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      fileSizeLimit: id === "request-attachments" ? 3145728 : 5242880,
    };
    const existing = buckets.find((b) => b.id === id);
    if (
      !existing ||
      Number(existing.file_size_limit) !== options.fileSizeLimit
    ) {
      const result = existing
        ? await client.storage.updateBucket(id, options)
        : await client.storage.createBucket(id, options);
      if (result.error) throw result.error;
    }
  }
  const media = path.join(backendProject, "media", "library-assets");
  const folders = await readdir(media).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const folder of folders) {
    const bucket = client.storage.from("library-assets");
    const listing = await bucket.list(folder);
    if (listing.error) throw listing.error;
    for (const file of await readdir(path.join(media, folder))) {
      if (listing.data.some((object) => object.name === file)) continue;
      const result = await bucket.upload(
        folder + "/" + file,
        await readFile(path.join(media, folder, file)),
        { contentType: file.endsWith(".png") ? "image/png" : "image/jpeg" },
      );
      if (result.error) throw result.error;
    }
  }
}
const args =
  mode === "serve"
    ? [".output/server/index.mjs"]
    : ["node_modules/vite/bin/vite.js", mode];
const child = spawn(process.execPath, args, {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
});
for (const sig of ["SIGINT", "SIGTERM"]) process.once(sig, () => child.kill());
child.once("exit", async (code) => {
  for (const socket of realtimeSockets) socket.destroy();
  await server?.close();
  await backend?.close();
  process.exit(code ?? 0);
});
