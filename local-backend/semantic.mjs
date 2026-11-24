import { env, pipeline } from "@huggingface/transformers";
import { fileURLToPath } from "node:url";
env.allowRemoteModels = false;
env.localModelPath = fileURLToPath(
  new URL("../.local/models/", import.meta.url),
);
let extractor, cacheKey, indexPromise;
function model() {
  extractor ??= pipeline("feature-extraction", "minilm", {
    dtype: "q8",
    device: "cpu",
    session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
  }).catch((error) => {
    extractor = undefined;
    throw error;
  });
  return extractor;
}
async function encode(texts) {
  const run = await model();
  const tensor = await run(texts, {
    pooling: "mean",
    normalize: true,
    truncation: true,
  });
  return tensor.tolist();
}
export async function suggest(need, catalog, lang) {
  const ar = lang === "ar";
  const entries = catalog.filter((p) => !p.comingSoon);
  const text = entries.map((p) =>
    [p.name, p.label, p.description, p.labelEn, p.descriptionEn]
      .filter(Boolean)
      .join(". "),
  );
  const key = JSON.stringify(text);
  if (key !== cacheKey) {
    cacheKey = key;
    indexPromise = encode(text).catch((error) => {
      cacheKey = undefined;
      throw error;
    });
  }
  const [index, [query]] = await Promise.all([indexPromise, encode([need])]);
  const scores = entries
    .map((p, i) => ({
      p,
      score:
        need.trim().toLowerCase() === p.name.toLowerCase()
          ? 1
          : index[i].reduce((sum, x, j) => sum + x * query[j], 0),
    }))
    .sort((a, b) => b.score - a.score);
  const top = scores[0]?.score ?? 0;
  const best = scores
    .filter((r) => r.score >= Math.max(0.25, top - 0.085))
    .slice(0, 2);
  const picks = best.map(({ p }) => ({
    id: p.id,
    reason: ar ? p.description : p.descriptionEn || p.description,
  }));
  const links = best
    .map(
      ({ p }) => "[" + p.name + "](/product/" + encodeURIComponent(p.id) + ")",
    )
    .join(ar ? " و " : " and ");
  const summary = best.length
    ? (ar
        ? "وفق البحث الدلالي المحلي، الأقرب إلى احتياجك هو "
        : "Local semantic search found the closest match in ") +
      links +
      "."
    : ar
      ? "ما نوع القرار الذي تريد دعمه؟ صف الحاجة، مثل تقييم تقنية أو تتبّع تكاليف التطبيقات."
      : "What decision do you want to support? Describe a need, such as evaluating technology or tracking application costs.";
  return {
    summary,
    picks,
    modelId: (await model()).model.config._name_or_path,
  };
}
