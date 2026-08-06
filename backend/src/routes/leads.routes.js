import { Router } from "express";
import { localStore } from "../services/localStore.service.js";
import { leadProcessor } from "../services/leadProcessor.service.js";
import { sheetsService } from "../services/sheets.service.js";
import { parseFollowers, isQualified } from "../parsers/followerParser.js";
import { normalizeTikTokUrl, saveLeadSchema } from "../utils/validators.js";

export const leadsRouter = Router();

leadsRouter.get("/health", (req, res) => {
  res.json({ ok: true, name: "TikTok Lead Collector Pro" });
});

leadsRouter.post("/leads", async (req, res, next) => {
  try {
    const parsed = saveLeadSchema.parse(req.body);
    const tiktokUrl = normalizeTikTokUrl(parsed.tiktokUrl);
    const username = parsed.username.replace(/^@/, "");
    const followers = parseFollowers(parsed.followers);

    if (!isQualified(followers)) {
      res.status(422).json({ error: "Creator is not qualified by follower range." });
      return;
    }

    if (await sheetsService.hasLead(tiktokUrl, username)) {
      res.status(409).json({ error: "Already saved", duplicate: true });
      return;
    }

    const snapshot = {
      tiktokUrl,
      username,
      followers,
      bio: parsed.bio,
      notes: parsed.notes
    };

    await localStore.cacheProfile(tiktokUrl, snapshot);
    await sheetsService.appendExtensionLink(tiktokUrl);
    await localStore.recordSaved({ tiktokUrl, username });

    leadProcessor.processUrl(tiktokUrl, snapshot).catch((error) => {
      console.error("Lead expansion failed:", error.message);
    });

    const savedToday = await localStore.countSavedToday();
    const recentSaved = await localStore.getRecentSaved();
    res.status(201).json({ saved: true, savedToday, recentSaved });
  } catch (error) {
    next(error);
  }
});

leadsRouter.get("/leads/status", async (req, res, next) => {
  try {
    const tiktokUrl = req.query.url ? normalizeTikTokUrl(String(req.query.url)) : "";
    const username = String(req.query.username || "");
    const duplicate = tiktokUrl ? await sheetsService.hasLead(tiktokUrl, username) : false;
    res.json({ duplicate });
  } catch (error) {
    next(error);
  }
});

leadsRouter.get("/stats/today", async (req, res, next) => {
  try {
    res.json({ savedToday: await localStore.countSavedToday() });
  } catch (error) {
    next(error);
  }
});

leadsRouter.get("/recent", async (req, res, next) => {
  try {
    res.json({ recentSaved: await localStore.getRecentSaved() });
  } catch (error) {
    next(error);
  }
});

leadsRouter.post("/worker/run", async (req, res, next) => {
  try {
    res.json(await leadProcessor.processPending());
  } catch (error) {
    next(error);
  }
});

