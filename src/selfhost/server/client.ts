import { fromTable, rpcCall } from "../supabase-js/builder";
import type { QuerySpec } from "../supabase-js/spec";
import { selfhostConfig } from "./config";
import { ANON, SERVICE, type RequestAuth } from "./db";
import { executeSpec } from "./execute";
import * as auth from "./auth";
import { StorageBucket } from "./storage";
import { safeEqual } from "./crypto";

type Options = {
  global?: { headers?: Record<string, string>; fetch?: unknown };
  auth?: unknown;
  db?: { schema?: string };
};

function bearerOf(options: Options | undefined): string | undefined {
  const headers = options?.global?.headers ?? {};
  const value = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === "authorization",
  )?.[1];
  const m = value ? /^Bearer\s+(\S+)$/i.exec(value) : null;
  return m?.[1];
}

/**
 * Server-side stand-in for supabase-js `createClient`, talking straight to Postgres.
 * - the service key (SUPABASE_SERVICE_ROLE_KEY, derived internally) → role service_role
 * - any other key → anon, or authenticated when a valid user bearer token is attached
 */
export function createServerClient(
  _url: string,
  key: string,
  options?: Options,
) {
  const isService = safeEqual(String(key ?? ""), selfhostConfig().serviceKey);
  const bearer = bearerOf(options);
  const schema = options?.db?.schema ?? "public";
  let resolved: Promise<RequestAuth> | undefined;
  const role = (): Promise<RequestAuth> => {
    if (!resolved) {
      resolved = (async () => {
        if (bearer && bearer !== key) {
          const claims = await auth.verifiedClaims(bearer);
          if (claims) return { role: "authenticated", claims } as RequestAuth;
          if (!isService) return ANON;
        }
        return isService ? SERVICE : ANON;
      })();
    }
    return resolved;
  };
  const exec = async (spec: QuerySpec) => executeSpec(spec, await role());

  const requireService = () => {
    if (!isService) throw new Error("auth.admin requires the service key");
  };

  return {
    from: (table: string) => fromTable(exec, table, schema),
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
      opts?: { head?: boolean; count?: "exact" },
    ) => rpcCall(exec, fn, args, opts, schema),
    schema: (name: string) => ({
      from: (table: string) => fromTable(exec, table, name),
      rpc: (fn: string, args?: Record<string, unknown>) =>
        rpcCall(exec, fn, args, {}, name),
    }),
    storage: {
      from: (bucket: string) => {
        const lazy = async () => new StorageBucket(bucket, await role());
        return {
          upload: async (
            path: string,
            body: unknown,
            o?: { contentType?: string; upsert?: boolean },
          ) => (await lazy()).upload(path, body, o),
          update: async (
            path: string,
            body: unknown,
            o?: { contentType?: string },
          ) => (await lazy()).upload(path, body, { ...o, upsert: true }),
          download: async (path: string) => (await lazy()).download(path),
          remove: async (paths: string[]) => (await lazy()).remove(paths),
          list: async (
            prefix?: string,
            o?: { limit?: number; offset?: number; search?: string },
          ) => (await lazy()).list(prefix, o),
          createSignedUrl: async (
            path: string,
            expiresIn: number,
            o?: { download?: boolean | string | undefined },
          ) => (await lazy()).createSignedUrl(path, expiresIn, o),
          createSignedUrls: async (paths: string[], expiresIn: number) =>
            (await lazy()).createSignedUrls(paths, expiresIn),
          getPublicUrl: (path: string) =>
            new StorageBucket(bucket, ANON).getPublicUrl(path),
        };
      },
    },
    auth: {
      getClaims: async (token?: string) => {
        const t = token ?? bearer;
        const claims = t ? await auth.verifiedClaims(t) : null;
        return claims
          ? {
              data: { claims, header: { alg: "HS256" }, signature: "" },
              error: null,
            }
          : {
              data: null,
              error: {
                message: "Invalid JWT",
                code: "bad_jwt",
                status: 401,
                name: "AuthApiError",
              },
            };
      },
      getUser: async (token?: string) => {
        const t = token ?? bearer;
        if (!t)
          return {
            data: { user: null },
            error: {
              message: "Auth session missing!",
              code: "session_not_found",
              status: 400,
              name: "AuthSessionMissingError",
            },
          };
        const { user, error } = await auth.userFromToken(t);
        return { data: { user }, error };
      },
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async (credentials: {
        email: string;
        password: string;
      }) => {
        const r = await auth.signInWithPassword(
          credentials.email,
          credentials.password,
          "server",
        );
        return { data: { session: r.session, user: r.user }, error: r.error };
      },
      signOut: async (_opts?: unknown) => ({ error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
      admin: {
        getUserById: async (id: string) => (
          requireService(),
          auth.adminGetUserById(id)
        ),
        updateUserById: async (
          id: string,
          attrs: Parameters<typeof auth.adminUpdateUserById>[1],
        ) => (requireService(), auth.adminUpdateUserById(id, attrs)),
        listUsers: async (params: { page?: number; perPage?: number } = {}) => (
          requireService(),
          auth.adminListUsers(params.page, params.perPage)
        ),
        createUser: async (
          attrs: Parameters<typeof auth.adminCreateUser>[0],
        ) => (requireService(), auth.adminCreateUser(attrs)),
        deleteUser: async (id: string) => (
          requireService(),
          auth.adminDeleteUser(id)
        ),
      },
    },
    channel: () => {
      throw new Error(
        "Realtime channels are browser-only in the self-hosted build",
      );
    },
    removeChannel: async () => "ok",
    removeAllChannels: async () => [],
  };
}
