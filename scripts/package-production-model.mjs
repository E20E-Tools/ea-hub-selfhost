import {
  cp,
  mkdir,
  readdir,
  readFile,
  writeFile,
  copyFile,
  stat,
} from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";

const output = resolve(".vercel/output/functions");
async function findFunctions(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map((e) =>
          e.name.endsWith(".func")
            ? join(dir, e.name)
            : findFunctions(join(dir, e.name)),
        ),
    )
  ).flat();
}
const targets = await findFunctions(output);
if (!targets.length) throw Error("Nitro server function missing");
execFileSync(
  "npm",
  [
    "ci",
    "--prefix",
    "local-backend",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ],
  { stdio: "inherit" },
);
await import("./prepare-model.mjs");
const modules = resolve("local-backend/node_modules");
for (const fn of targets) {
  const meta = JSON.parse(await readFile(join(fn, ".vc-config.json"), "utf8"));
  if (!String(meta.runtime).startsWith("nodejs")) continue;
  const dest = join(fn, "semantic");
  await mkdir(dest, { recursive: true });
  await cp(".local/models/minilm", join(dest, "models/minilm"), {
    recursive: true,
  });
  await copyFile(
    join(modules, "@huggingface/transformers/dist/transformers.node.min.mjs"),
    join(dest, "transformers.mjs"),
  );
  await copyFile(
    join(modules, "@huggingface/transformers/LICENSE"),
    join(dest, "TRANSFORMERS-LICENSE"),
  );
  const source = await readFile("local-backend/semantic.mjs", "utf8");
  await writeFile(
    join(dest, "semantic.mjs"),
    source
      .replace('"@huggingface/transformers"', '"./transformers.mjs"')
      .replace("../.local/models/", "./models/"),
  );
  for (const name of [
    "onnxruntime-common",
    "onnxruntime-node",
    "sharp",
    "semver",
    "detect-libc",
    "@img/colour",
    "@img/sharp-linux-x64",
    "@img/sharp-libvips-linux-x64",
  ]) {
    const from = join(modules, name),
      to = join(dest, "node_modules", name);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to, {
      recursive: true,
      filter: (file) => {
        const rel = file.slice(from.length + 1);
        if (name === "onnxruntime-node" && rel.startsWith("bin/"))
          return (
            [
              "bin/napi-v3",
              "bin/napi-v3/linux",
              "bin/napi-v3/linux/x64",
            ].includes(rel) ||
            /^bin\/napi-v3\/linux\/x64\/(onnxruntime_binding.node|libonnxruntime.so.1|libonnxruntime_providers_shared.so)$/.test(
              rel,
            )
          );
        return !rel.endsWith(".map");
      },
    });
  }
  // The distributed .so.1 link must resolve inside the deployed function.
  const lib = join(
    dest,
    "node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime.so.1",
  );
  try {
    await stat(lib);
  } catch {
    await copyFile(
      join(
        modules,
        "onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime.so.1.21.0",
      ),
      join(dirname(lib), "libonnxruntime.so.1.21.0"),
    );
  }
  const runtime = await import(join(dest, "semantic.mjs"));
  const test = await runtime.suggest(
    "technology radar",
    [
      {
        id: "radar",
        name: "Technology Radar",
        description: "Assess technology for adoption",
      },
    ],
    "en",
  );
  if (test.picks[0]?.id !== "radar")
    throw Error("Packaged semantic runtime failed verification");
  console.log("Verified semantic model in", fn);
}
