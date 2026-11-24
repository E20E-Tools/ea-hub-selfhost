/** Browser-safe chronological ordering for stored chat messages. */
export type OrderableMessage = {
  id: string;
  sender: string;
  created_at: string;
};

/** Microsecond-precision sort key; keeps distinct sub-millisecond timestamps distinct. */
export function messageTimeKey(value: string): bigint | null {
  const m =
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(
      value.trim(),
    );
  if (!m) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : BigInt(ms) * 1000n;
  }
  let zone = m[4] ?? "Z";
  if (/^[+-]\d{2}$/.test(zone)) zone += ":00";
  else if (/^[+-]\d{4}$/.test(zone))
    zone = `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const seconds = Date.parse(`${m[1]}T${m[2]}${zone}`);
  if (Number.isNaN(seconds)) return null;
  const micros = BigInt((m[3] ?? "").padEnd(6, "0").slice(0, 6));
  return BigInt(seconds) * 1000n + micros;
}

// Within one identical timestamp (batched insert), the question precedes its reply.
const SENDER_RANK: Record<string, number> = {
  visitor: 0,
  system: 1,
  ai: 2,
  admin: 2,
};

/** Dedupes by id and sorts oldest first; equal times put visitor before answers, then id. */
export function orderChatMessages<T extends OrderableMessage>(
  messages: readonly T[],
): T[] {
  const unique = new Map<string, T>();
  for (const message of messages) unique.set(message.id, message);
  return [...unique.values()]
    .map((message, index) => ({
      message,
      index,
      key: messageTimeKey(message.created_at),
    }))
    .sort((a, b) => {
      if (a.key !== null && b.key !== null && a.key !== b.key)
        return a.key < b.key ? -1 : 1;
      if ((a.key === null) !== (b.key === null)) return a.key === null ? 1 : -1;
      const rank =
        (SENDER_RANK[a.message.sender] ?? 1) -
        (SENDER_RANK[b.message.sender] ?? 1);
      if (rank) return rank;
      return a.message.id < b.message.id
        ? -1
        : a.message.id > b.message.id
          ? 1
          : a.index - b.index;
    })
    .map((entry) => entry.message);
}
