// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  encodeSegment,
  objectUrl,
  signRequest,
  type S3Settings,
} from "../server/s3";
import { s3SettingsFromEnv, s3Store } from "../server/blobs";

const aws: S3Settings = {
  bucket: "examplebucket",
  region: "us-east-1",
  endpoint: "",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  forcePathStyle: false,
};

describe("S3 SigV4 signer", () => {
  it("matches the AWS documentation example (GET object with Range)", () => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
    const url = objectUrl(aws, "test.txt");
    expect(url.toString()).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt",
    );
    const headers = signRequest(
      aws,
      "GET",
      url,
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      { Range: "bytes=0-9" },
      new Date("2013-05-24T00:00:00Z"),
    );
    expect(headers["authorization"]).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, " +
        "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  it("builds path-style URLs for S3-compatible endpoints and encodes keys", () => {
    const url = objectUrl(
      { ...aws, endpoint: "http://minio:9000", forcePathStyle: true },
      "public-assets/a b/ü(1).png",
    );
    expect(url.toString()).toBe(
      "http://minio:9000/examplebucket/public-assets/a%20b/%C3%BC%281%29.png",
    );
    expect(encodeSegment("a*b!")).toBe("a%2Ab%21");
  });

  it("reads settings from the environment", () => {
    const s = s3SettingsFromEnv({
      S3_BUCKET: "uploads",
      S3_ENDPOINT: "https://minio.example.com/",
      S3_ACCESS_KEY_ID: "k",
      S3_SECRET_ACCESS_KEY: "s",
      S3_PREFIX: "/ea-hub/",
    });
    expect(s).toMatchObject({
      bucket: "uploads",
      endpoint: "https://minio.example.com",
      forcePathStyle: true,
      region: "us-east-1",
      prefix: "ea-hub",
    });
    expect(() => s3SettingsFromEnv({ S3_BUCKET: "x" })).toThrow(/ACCESS_KEY/);
  });
});

// Runs against a real S3-compatible server when SELFHOST_TEST_S3_ENDPOINT is set (CI: rclone serve s3).
const endpoint = process.env["SELFHOST_TEST_S3_ENDPOINT"];
describe.skipIf(!endpoint)("S3 blob store against a real server", () => {
  it("creates the bucket, then puts, reads, streams and deletes an object", async () => {
    const settings = s3SettingsFromEnv({
      S3_BUCKET: "ea-hub-test",
      S3_ENDPOINT: endpoint,
      S3_ACCESS_KEY_ID: process.env["SELFHOST_TEST_S3_ACCESS_KEY_ID"],
      S3_SECRET_ACCESS_KEY: process.env["SELFHOST_TEST_S3_SECRET_ACCESS_KEY"],
      S3_PREFIX: "ci",
    });
    const bucketUrl = new URL(`${settings.endpoint}/${settings.bucket}`);
    const created = await fetch(bucketUrl, {
      method: "PUT",
      headers: signRequest(
        settings,
        "PUT",
        bucketUrl,
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      ),
    });
    expect([200, 409]).toContain(created.status);

    const store = s3Store(settings);
    const data = Buffer.from("hello from the self-hosted EA-Hub ✓");
    await store.put("public-assets", "logos/a b.txt", data, "text/plain");
    expect(
      (await store.get("public-assets", "logos/a b.txt"))?.toString(),
    ).toBe(data.toString());
    const opened = await store.open("public-assets", "logos/a b.txt");
    expect(opened?.size).toBe(data.length);
    expect(await new Response(opened!.body).text()).toBe(data.toString());
    await store.remove("public-assets", "logos/a b.txt");
    expect(await store.get("public-assets", "logos/a b.txt")).toBeNull();
    expect(await store.open("public-assets", "missing.txt")).toBeNull();
  });
});
