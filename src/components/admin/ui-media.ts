/** Image upload rules and signed previews for admin media fields. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AdminCopyKey } from "@/lib/admin-copy";
import { ASSET_BUCKET } from "@/lib/catalog";
/* ---------- Images ---------- */

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function imageProblem(file: File): AdminCopyKey | null {
  if (!IMAGE_TYPES.includes(file.type)) return "imageInvalid";
  if (file.size > MAX_IMAGE_BYTES) return "imageTooLarge";
  return null;
}

/** Signed preview URL for a stored asset path (or the URL itself when already absolute). */
export function useAssetUrl(raw: string): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    const value = (raw ?? "").trim();
    if (!value) {
      setUrl("");
      return;
    }
    if (/^https?:\/\//i.test(value)) {
      setUrl(value);
      return;
    }
    const path = value.startsWith(`${ASSET_BUCKET}/`)
      ? value.slice(ASSET_BUCKET.length + 1)
      : value.replace(/^\/+/, "");
    void supabase.storage
      .from(ASSET_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (alive && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [raw]);
  return url;
}
