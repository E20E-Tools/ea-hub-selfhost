// @vitest-environment node
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  decryptDir,
  decryptFile,
  encryptDir,
  encryptFile,
  keygen,
} from "../../../selfhost/scripts/backup-crypt.mjs";

const tmp = () => mkdtemp(path.join(tmpdir(), "eahub-crypt-"));

describe("backup encryption", () => {
  it("round-trips files of several sizes (multi-chunk and empty)", async () => {
    const dir = await tmp();
    const { publicKey, privateKey } = keygen();
    for (const size of [0, 10, 1024 * 1024, 2_500_000]) {
      const data = randomBytes(size);
      const plain = path.join(dir, `p${size}`);
      await writeFile(plain, data);
      await encryptFile(plain, `${plain}.enc`, publicKey);
      const enc = await readFile(`${plain}.enc`);
      expect(enc.subarray(0, 8).toString()).toBe("EAHUBBK1");
      if (size > 0) expect(enc.includes(data.subarray(0, 64))).toBe(false);
      await decryptFile(`${plain}.enc`, `${plain}.out`, privateKey);
      expect(Buffer.compare(await readFile(`${plain}.out`), data)).toBe(0);
    }
  });

  it("refuses a wrong key, a modified file and a truncated file", async () => {
    const dir = await tmp();
    const a = keygen();
    const b = keygen();
    const plain = path.join(dir, "db.dump");
    await writeFile(plain, randomBytes(2_200_000));
    await encryptFile(plain, `${plain}.enc`, a.publicKey);
    await expect(
      decryptFile(`${plain}.enc`, `${plain}.x`, b.privateKey),
    ).rejects.toThrow(/wrong key|modified/);

    const enc = await readFile(`${plain}.enc`);
    const flipped = Buffer.from(enc);
    flipped[200] = flipped[200]! ^ 1;
    await writeFile(`${plain}.flip`, flipped);
    await expect(
      decryptFile(`${plain}.flip`, `${plain}.y`, a.privateKey),
    ).rejects.toThrow(/wrong key|modified/);

    // Drop the whole last chunk: the "last" marker on the previous chunk no longer matches.
    const firstLen = enc.readUInt32BE(44);
    await writeFile(`${plain}.cut`, enc.subarray(0, 44 + 4 + firstLen));
    await expect(
      decryptFile(`${plain}.cut`, `${plain}.z`, a.privateKey),
    ).rejects.toThrow(/wrong key|modified|truncated|missing/);
  });

  it("encrypts finished backup folders only and decrypts them for restore", async () => {
    const root = await tmp();
    const { publicKey, privateKey } = keygen();
    const done = path.join(root, "2026-11-28_0100");
    const partial = path.join(root, "2026-11-28_0200.partial");
    await mkdir(done);
    await mkdir(partial);
    await writeFile(path.join(done, "database.dump"), "DUMP");
    await writeFile(path.join(done, "storage.tar.gz"), "FILES");
    await writeFile(path.join(partial, "database.dump"), "IN PROGRESS");
    expect(await encryptDir(root, publicKey)).toBe(2);
    expect((await readdir(done)).sort()).toEqual([
      "database.dump.enc",
      "storage.tar.gz.enc",
    ]);
    expect(await readdir(partial)).toEqual(["database.dump"]);
    expect(await encryptDir(root, publicKey)).toBe(0); // idempotent
    expect(await decryptDir(done, privateKey)).toBe(2);
    expect(await readFile(path.join(done, "database.dump"), "utf8")).toBe(
      "DUMP",
    );
  });
});
