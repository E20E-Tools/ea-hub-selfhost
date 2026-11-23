import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { GUEST_CHAT_OWNER, loadAccountState } from "./assistant-storage";

/**
 * Resolves which stored owner may be read. getSession is only a local presence hint:
 * no error and no session means a true guest. When a session is present it must be
 * validated by getUser; any error or missing user (including AuthSessionMissingError,
 * which also covers a revoked session_not_found) is unknown, never guest.
 */
export async function currentAuthUser(): Promise<
  { kind: "account"; user: User } | { kind: "guest" } | null
> {
  try {
    const { data: local, error: localError } = await supabase.auth.getSession();
    if (localError) return null;
    if (!local.session) return { kind: "guest" };
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) return null;
    return { kind: "account", user: data.user };
  } catch {
    return null;
  }
}

export async function currentOwner(): Promise<
  { kind: "account"; id: string } | { kind: "guest" } | null
> {
  const auth = await currentAuthUser();
  if (!auth) return null;
  return auth.kind === "guest" ? auth : { kind: "account", id: auth.user.id };
}

function tokenFor(owner: string): string {
  try {
    return loadAccountState(window.localStorage, owner).session?.token ?? "";
  } catch {
    return "";
  }
}

/** Selects only the current owner's signed Archy session; the server verifies it again. */
export async function currentVisitorAccess(): Promise<string> {
  return (await currentViewer()).token;
}

/** Verified account id (server re-verifies the bearer) plus that owner's Archy pass, read together. */
export async function currentViewer(): Promise<{ token: string; accountId: string }> {
  const owner = await currentOwner();
  if (!owner) return { token: "", accountId: "" };
  if (owner.kind === "account") return { token: tokenFor(owner.id), accountId: owner.id };
  return { token: tokenFor(GUEST_CHAT_OWNER), accountId: "" };
}
