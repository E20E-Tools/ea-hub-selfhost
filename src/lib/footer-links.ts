import { z } from "zod";

export const footerLinksSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(80),
      url: z
        .string()
        .trim()
        .max(500)
        .refine((value) => {
          try {
            const url = new URL(value);
            return url.protocol === "https:" && !url.username && !url.password;
          } catch {
            return false;
          }
        }),
    }),
  )
  .max(20)
  .refine((links) => new Set(links.map((link) => link.name)).size === links.length);
export type FooterLink = z.infer<typeof footerLinksSchema>[number];
export function readFooterLinks(value: unknown): FooterLink[] {
  const result = footerLinksSchema.safeParse(value);
  return result.success ? result.data : [];
}
export function linkedFooterParts(
  text: string,
  links: FooterLink[],
): { text: string; url?: string }[] {
  const parts: { text: string; url?: string }[] = [];
  let offset = 0;
  while (offset < text.length) {
    const match = links
      .map((link) => ({ link, index: text.indexOf(link.name, offset) }))
      .filter((entry) => entry.index >= 0)
      .sort((a, b) => a.index - b.index || b.link.name.length - a.link.name.length)[0];
    if (!match) {
      parts.push({ text: text.slice(offset) });
      break;
    }
    if (match.index > offset) parts.push({ text: text.slice(offset, match.index) });
    parts.push({ text: match.link.name, url: match.link.url });
    offset = match.index + match.link.name.length;
  }
  return parts;
}
