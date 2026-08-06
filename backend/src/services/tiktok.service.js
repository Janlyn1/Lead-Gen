import { env } from "../config/env.js";
import { parseFollowers } from "../parsers/followerParser.js";
import { usernameFromUrl } from "../utils/validators.js";

export class TikTokService {
  async fetchProfile(tiktokUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.TIKTOK_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(tiktokUrl, {
        signal: controller.signal,
        headers: {
          "accept-language": "en-US,en;q=0.9",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
        }
      });

      if (!response.ok) throw new Error(`TikTok returned ${response.status}`);
      const html = await response.text();
      return parseTikTokHtml(html, tiktokUrl);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function parseTikTokHtml(html, tiktokUrl) {
  const username = usernameFromUrl(tiktokUrl);
  const userStatsMatch = html.match(/"followerCount"\s*:\s*(\d+)/i);
  const followers = userStatsMatch ? Number(userStatsMatch[1]) : parseFollowers(findMeta(html, "followers"));

  const bio =
    decodeHtml(findJsonString(html, "signature") || findJsonString(html, "bio") || findMeta(html, "description"));

  return {
    username,
    followers,
    bio,
    tiktokUrl
  };
}

function findJsonString(html, key) {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i");
  const match = html.match(pattern);
  if (!match) return "";
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

function findMeta(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+property=["']og:${name}["'][^>]+content=["']([^"']+)["']`, "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

export const tiktokService = new TikTokService();

