import { mkdir, writeFile, rename, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const repo = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const info = await (
  await fetch("https://huggingface.co/api/models/" + repo + "/revision/2c4055b")
).json();
if (!/^[a-f0-9]{40}$/.test(info.sha)) throw new Error("Missing model revision");
const dir = fileURLToPath(new URL("../.local/models/minilm/", import.meta.url));
await mkdir(path.join(dir, "onnx"), { recursive: true });
for (const name of [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx",
]) {
  const target = path.join(dir, name);
  if ((await stat(target).catch(() => null))?.size) continue;
  const response = await fetch(
    "https://huggingface.co/" + repo + "/resolve/" + info.sha + "/" + name,
  );
  if (!response.ok)
    throw new Error("Model download failed: " + response.status + " " + name);
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(target + ".part"),
  );
  await rename(target + ".part", target);
  console.log(name + " ready");
}
await writeFile(path.join(dir, "revision.txt"), info.sha);
