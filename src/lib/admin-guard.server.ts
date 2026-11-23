// Server-only: the single admin check used by every admin server function.

export type GuardContext = {
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "admin" },
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  userId: string;
  claims: unknown;
};

export async function requireAdmin(context: GuardContext): Promise<void> {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Error("هذه الصفحة مخصّصة للإدارة.");
}

export function actorEmail(claims: unknown): string {
  const email = (claims as { email?: unknown } | null)?.email;
  return typeof email === "string" ? email : "";
}
