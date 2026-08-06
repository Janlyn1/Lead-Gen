import { parseBio, calculateLeadScore } from "../parsers/bioParser.js";
import { parseFollowers, isQualified } from "../parsers/followerParser.js";
import { geminiService } from "./gemini.service.js";
import { localStore } from "./localStore.service.js";
import { sheetsService } from "./sheets.service.js";
import { tiktokService } from "./tiktok.service.js";
import { usernameFromUrl } from "../utils/validators.js";

export class LeadProcessor {
  constructor() {
    this.running = false;
    this.timer = null;
  }

  start(intervalMs) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.processPending().catch((error) => console.error("Sheet worker failed:", error.message));
    }, intervalMs);
  }

  async processPending() {
    if (this.running) return { processed: 0 };
    this.running = true;

    try {
      await sheetsService.ensureStructure();
      const [extensionUrls, expandedUrls] = await Promise.all([
        sheetsService.getExtensionUrls(),
        sheetsService.getExpandedUrls()
      ]);
      const expandedSet = new Set(expandedUrls);
      let processed = 0;

      for (const url of extensionUrls) {
        if (!url || expandedSet.has(url) || (await localStore.isProcessed(url))) continue;
        await this.processUrl(url);
        processed += 1;
      }

      return { processed };
    } finally {
      this.running = false;
    }
  }

  async processUrl(tiktokUrl, snapshot = null) {
    const cached = snapshot || (await localStore.getCachedProfile(tiktokUrl));
    const fetched = cached || (await safeFetchProfile(tiktokUrl));
    const followers = parseFollowers(fetched.followers);
    const regexParsed = parseBio(fetched.bio || "");
    const aiParsed =
      regexParsed.confidence < 0.4 && geminiService.isEnabled()
        ? await safeGeminiParse(fetched.bio || "")
        : {};

    const parsed = {
      ...regexParsed,
      email: regexParsed.email || aiParsed.email || "",
      instagram: regexParsed.instagram || aiParsed.instagram || "",
      facebook: regexParsed.facebook || aiParsed.facebook || "",
      youtube: regexParsed.youtube || aiParsed.youtube || "",
      location: regexParsed.location || aiParsed.location || "",
      category: regexParsed.category?.length ? regexParsed.category : aiParsed.category || []
    };

    const followersQualified = isQualified(followers);
    const expandedLead = {
      username: fetched.username || usernameFromUrl(tiktokUrl),
      followers,
      email: parsed.email,
      instagram: parsed.instagram,
      facebook: parsed.facebook,
      youtube: parsed.youtube,
      location: parsed.location,
      category: parsed.category,
      leadScore: calculateLeadScore(parsed, followersQualified),
      tiktokUrl,
      notes: fetched.notes || ""
    };

    await sheetsService.appendExpandedLead(expandedLead);
    await localStore.markProcessed(tiktokUrl);
    return expandedLead;
  }
}

async function safeFetchProfile(tiktokUrl) {
  try {
    return await tiktokService.fetchProfile(tiktokUrl);
  } catch {
    return {
      tiktokUrl,
      username: usernameFromUrl(tiktokUrl),
      followers: 0,
      bio: ""
    };
  }
}

async function safeGeminiParse(bio) {
  try {
    return await geminiService.parseBio(bio);
  } catch (error) {
    console.warn("Gemini parser fallback failed:", error.message);
    return {};
  }
}

export const leadProcessor = new LeadProcessor();

