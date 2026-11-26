import { describe, expect, it } from "vitest";
import {
  buildSources,
  contextBlock,
  cosine,
  normalizeQuery,
  rankDocuments,
  type IndexedDocument,
  type ProductSourceRow,
} from "@/lib/semantic.shared";

const product = (over: Partial<ProductSourceRow> = {}): ProductSourceRow => ({
  id: "radar",
  name: "Tech Radar",
  label: "تقييم التقنيات",
  label_en: "Technology assessment",
  description: "قيّم التقنيات قبل اعتمادها",
  description_en: "Assess technology before adoption",
  features: ["حلقات", "قرارات"],
  features_en: ["Rings", "Decisions"],
  whats_new: "",
  whats_new_en: "",
  version: "2.1",
  ...over,
});

const doc = (
  id: string,
  embedding: number[],
  over: Partial<IndexedDocument> = {},
): IndexedDocument => ({
  id,
  kind: "product",
  language: "ar",
  title: id,
  body: "body " + id,
  url: "/product/" + id,
  embedding,
  ...over,
});

describe("semantic sources", () => {
  it("indexes each product in both languages with stable ids and its page", () => {
    const sources = buildSources([product()], []);
    expect(sources.map((s) => s.id)).toEqual([
      "product:radar:ar",
      "product:radar:en",
    ]);
    expect(sources[1]?.body).toContain("Assess technology before adoption");
    expect(sources.every((s) => s.url === "/product/radar")).toBe(true);
  });

  it("adds release notes only when there are some, linked to the releases page", () => {
    const sources = buildSources(
      [product({ whats_new: "لوحة جديدة", whats_new_en: "" })],
      [],
    );
    const releases = sources.filter((s) => s.kind === "release");
    // English falls back to the Arabic notes rather than dropping them.
    expect(releases.map((s) => s.id)).toEqual([
      "release:radar:ar",
      "release:radar:en",
    ]);
    expect(releases[0]).toMatchObject({
      title: "Tech Radar 2.1",
      url: "/releases/radar",
    });
  });

  it("detects the language of approved answers and skips empty ones", () => {
    const sources = buildSources(
      [],
      [
        { id: "1", question: "كيف أطلب أداة؟", answer: "من صفحة الطلبات" },
        { id: "2", question: "How do I ask?", answer: "Use /request" },
        { id: "3", question: " ", answer: "x" },
      ],
    );
    expect(sources.map((s) => [s.id, s.language])).toEqual([
      ["faq:1", "ar"],
      ["faq:2", "en"],
    ]);
  });

  it("encodes product ids in links", () => {
    const [first] = buildSources([product({ id: "a b" })], []);
    expect(first?.url).toBe("/product/a%20b");
  });
});

describe("ranking", () => {
  it("computes cosine similarity and guards mismatched vectors", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1], [1, 0])).toBe(0);
  });

  it("orders by score, drops weak matches and keeps one hit per page", () => {
    const hits = rankDocuments(
      [1, 0],
      [
        doc("weak", [0.1, 1]),
        doc("best", [1, 0]),
        doc("good", [1, 0.6]),
        doc("best-en", [1, 0], { language: "en", url: "/product/best" }),
      ],
      { language: "ar", limit: 5 },
    );
    expect(hits.map((h) => h.title)).toEqual(["best", "good"]);
  });

  it("falls back to the other language when the visitor's has no match", () => {
    const hits = rankDocuments(
      [1, 0],
      [doc("only-en", [1, 0], { language: "en" })],
      { language: "ar", limit: 3 },
    );
    expect(hits.map((h) => h.title)).toEqual(["only-en"]);
  });

  it("filters by kind and respects the limit", () => {
    const docs = [
      doc("a", [1, 0], { kind: "faq" }),
      doc("b", [1, 0.1], { kind: "release", url: "/releases/b" }),
      doc("c", [1, 0.2]),
    ];
    expect(
      rankDocuments([1, 0], docs, {
        language: "ar",
        limit: 5,
        kinds: ["release"],
      }).map((h) => h.title),
    ).toEqual(["b"]);
    expect(
      rankDocuments([1, 0], docs, { language: "ar", limit: 1 }),
    ).toHaveLength(1);
  });
});

describe("prompt context and queries", () => {
  it("is empty without hits and lists passages otherwise", () => {
    expect(contextBlock([], "ar")).toBe("");
    const block = contextBlock(
      [{ kind: "faq", title: "Q", url: "/", snippet: "A", score: 0.9 }],
      "en",
    );
    expect(block).toContain("1. [faq] Q: A");
    expect(block).not.toContain("(/)");
  });

  it("normalizes queries and rejects very short ones", () => {
    expect(normalizeQuery("  ab ")).toBeNull();
    expect(normalizeQuery(42)).toBeNull();
    expect(normalizeQuery("  إدارة   التطبيقات ")).toBe("إدارة التطبيقات");
    expect(normalizeQuery("x".repeat(500))?.length).toBe(200);
  });
});
