import { z } from "zod";

export const tiktokUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host === "tiktok.com" || host.endsWith(".tiktok.com");
  }, "URL must be a TikTok URL");

export const saveLeadSchema = z.object({
  tiktokUrl: tiktokUrlSchema,
  username: z.string().trim().max(80).optional().default(""),
  fullName: z.string().trim().max(120).optional().default(""),
  followers: z.union([z.number(), z.string()]).optional().default(""),
  bio: z.string().max(2000).optional().default(""),
  notes: z.string().max(500).optional().default("")
});

export function normalizeTikTokUrl(value) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  url.protocol = "https:";
  url.hostname = "www.tiktok.com";
  return url.toString().replace(/\/$/, "");
}

export function usernameFromUrl(value) {
  try {
    const pathname = new URL(value).pathname;
    const match = pathname.match(/\/@([^/?#]+)/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}
