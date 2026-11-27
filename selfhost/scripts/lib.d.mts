// Types for lib.mjs (plain Node helpers shared by the self-host scripts).
import type { Sql } from "postgres";

export function databaseUrl(options?: { admin?: boolean }): string;
export function hostOf(url: string): string;
export function hashPassword(password: string): Promise<string>;
export function passwordMatches(password: string, stored: string | null | undefined): Promise<boolean>;
export function validEmail(email: string): boolean;
export function ensureAdmin(
  sql: Sql,
  email: string,
  password: string,
  options?: { reset?: boolean },
): Promise<"created" | "kept" | "password reset">;
export function waitForDatabase(sql: Sql, seconds?: number): Promise<void>;
