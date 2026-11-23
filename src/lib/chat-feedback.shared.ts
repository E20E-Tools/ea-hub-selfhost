/** Chat ratings (1–5 stars) and admin-edited common answers: browser-safe rules. */
export const MIN_STARS = 1;
export const MAX_STARS = 5;
export const FAQ_PROMPT_LIMIT = 30;

export function cleanStars(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_STARS &&
    value <= MAX_STARS
    ? value
    : null;
}

export function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Same question written differently (case, punctuation, spacing) counts once. */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type CommonQuestion = { text: string; count: number; chats: string[] };

/** Most-asked visitor questions to the tool guide, most frequent first. */
export function commonQuestions(
  rows: { chat_id: string; body: string }[],
  limit = 20,
): CommonQuestion[] {
  const groups = new Map<string, CommonQuestion>();
  for (const row of rows) {
    const key = normalizeQuestion(row.body);
    if (key.length < 3) continue;
    const group = groups.get(key) ?? { text: row.body.trim(), count: 0, chats: [] };
    group.count += 1;
    if (!group.chats.includes(row.chat_id)) group.chats.push(row.chat_id);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function averageStars(rows: { stars: number }[]): number | null {
  if (!rows.length) return null;
  return Math.round((rows.reduce((s, r) => s + r.stars, 0) / rows.length) * 10) / 10;
}

/** Prompt block with the admin's approved answers; the guide should prefer them. */
export function faqPromptBlock(rows: { question: string; answer: string }[]): string {
  const lines = rows.slice(0, FAQ_PROMPT_LIMIT).map((r) => `س: ${r.question}\nج: ${r.answer}`);
  return lines.length
    ? `\nإجابات معتمدة من الإدارة (استخدمها حرفيًا تقريبًا عندما يسأل الزائر سؤالًا مشابهًا، وبلغة الرد المطلوبة):\n${lines.join("\n\n")}\n`
    : "";
}
