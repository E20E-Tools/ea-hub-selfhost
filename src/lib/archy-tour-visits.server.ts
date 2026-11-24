import {
  gateSecrets,
  issueAccessToken,
  verifyAccessToken,
} from "./assistant-gate.server";
import {
  deriveSigningSecret,
  deriveSigningSecrets,
} from "./server-keys.server";

type Db =
  (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
const secret = () => deriveSigningSecret("archy-tour-visit-v1");

export async function issueTourVisitToken(id: string) {
  return (await issueAccessToken(await secret(), "", "", Date.now(), id)).token;
}
export async function verifyTourVisitToken(token: string) {
  // Current and previous roots, so tour links survive the APP_ENCRYPTION_KEY switch-over.
  const payload = await verifyAccessToken(
    await deriveSigningSecrets("archy-tour-visit-v1"),
    token,
  );
  return payload?.visitorId ?? null;
}

/** Called only after a real support receipt has been saved and read back. */
export async function recordTourSupport(
  db: Db,
  token: string,
  requestId: string,
) {
  try {
    const id = await verifyTourVisitToken(token);
    if (!id) return;
    const { error } = await db
      .from("archy_tour_visits")
      .update({
        support_request_id: requestId,
        support_submitted_at: new Date().toISOString(),
      })
      .eq("id", id)
      .not("completed_at", "is", null)
      .is("support_submitted_at", null);
    if (error) console.error("tour support record failed");
  } catch {
    // Analytics must never turn a saved support request into a failed submission.
    console.error("tour support record failed");
  }
}

export async function tourVisitorIdentity(access: string) {
  if (!access) return null;
  const payload = await verifyAccessToken(await gateSecrets(), access);
  return payload?.visitorId
    ? {
        visitor_id: payload.visitorId,
        visitor_name: payload.name,
        visitor_email: payload.email.trim().toLowerCase(),
      }
    : null;
}
