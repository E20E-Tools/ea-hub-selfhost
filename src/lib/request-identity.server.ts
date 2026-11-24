export type RequestIdentity = {
  kind: "account" | "guest";
  id: string;
  email: string;
} | null;

/** A present bearer must verify; guests never become owners from a typed email. */
export async function verifiedRequestAccount(): Promise<{
  id: string;
  email: string;
} | null> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const header = getRequest().headers.get("authorization");
  if (!header) return null;
  if (!header.startsWith("Bearer ")) throw new Error("rqErrRejected");
  const token = header.slice(7).trim();
  if (!token) throw new Error("rqErrRejected");
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.id) throw new Error("rqErrRejected");
  return {
    id: data.user.id,
    email: data.user.email?.trim().toLowerCase() ?? "",
  };
}

export async function resolveRequestIdentity(
  access: string,
): Promise<RequestIdentity> {
  const account = await verifiedRequestAccount();
  if (account) return { kind: "account", ...account };
  if (!access) return null;
  const { verifyVisitor } = await import("./live-chat.server");
  const visitor = await verifyVisitor({ supabase: null, userId: "" }, access);
  if (!visitor) throw new Error("rqErrRejected");
  return {
    kind: "guest",
    id: visitor.id,
    email: visitor.email.trim().toLowerCase(),
  };
}
