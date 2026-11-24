import postgres from "postgres";
import { createHash } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { checkLimits, clientIp } from "./rate-limit.server";
import type { TrialCommand, TrialResponse } from "./trial-feedback.functions";
const hash = (key: string) => createHash("sha256").update(key).digest("hex");
let connection: ReturnType<typeof postgres> | undefined;
export async function handleFeedback(
  data: TrialCommand,
): Promise<TrialResponse> {
  const req = getRequest();
  const origin = req.headers.get("sec-fetch-site");
  if (origin && !["same-origin", "none"].includes(origin)) return { ok: false };
  if (
    (await checkLimits([
      {
        bucket: "team-trial:" + data.action,
        subject: clientIp(req),
        limit: data.action === "share" ? 20 : 90,
        windowSeconds: 600,
      },
    ])) !== "ok"
  )
    return { ok: false };
  const url = process.env["POSTGRES_URL"];
  if (!url) return { ok: false };
  const sql = (connection ??= postgres(url, {
    prepare: false,
    max: 2,
    idle_timeout: 10,
    connect_timeout: 10,
  }));
  switch (data.action) {
    case "share": {
      const rows =
        await sql`insert into ea_trials.invitations(owner_hash,invite_hash,tool,goal) values(${hash(data.owner)},${hash(data.invite)},${data.tool},${data.goal}) on conflict(owner_hash) do update set goal=excluded.goal where not ea_trials.invitations.closed and ea_trials.invitations.invite_hash=excluded.invite_hash returning 1`;
      return { ok: rows.length === 1 };
    }
    case "view": {
      const [row] =
        await sql<{tool:string;goal:string}[]>`select tool,goal from ea_trials.invitations where not closed and invite_hash=${hash(data.invite)}`;
      return row ? { ok: true, tool: row.tool, goal: row.goal } : { ok: false };
    }
    case "reply": {
      const key = hash(data.invite);
      const rows =
        await sql`insert into ea_trials.responses(invite_hash,response_id,outcome,note) select invite_hash,${data.id},${data.outcome},${data.note} from ea_trials.invitations where not closed and invite_hash=${key} for share on conflict(invite_hash,response_id) do update set note=excluded.note,outcome=excluded.outcome returning 1`;
      return { ok: rows.length === 1 };
    }
    case "read": {
      const replies = await sql<
        { outcome: "yes" | "partial" | "no"; note: string }[]
      >`select outcome,note from ea_trials.responses join ea_trials.invitations using(invite_hash) where owner_hash=${hash(data.owner)} order by ea_trials.responses.created_at desc`;
      return { ok: true, replies: Array.from(replies) };
    }
    case "close":
      await sql`update ea_trials.invitations set closed=true where owner_hash=${hash(data.owner)}`;
      return { ok: true };
  }
}
