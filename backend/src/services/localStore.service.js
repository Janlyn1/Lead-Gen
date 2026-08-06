import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = new URL("../../data", import.meta.url);
const STORE_PATH = new URL("../../data/store.json", import.meta.url);

const defaultState = {
  processedUrls: [],
  profileCache: {},
  savedEvents: [],
  recentSaved: []
};

export class LocalStore {
  constructor(fileUrl = STORE_PATH) {
    this.fileUrl = fileUrl;
    this.state = structuredClone(defaultState);
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      const raw = await fs.readFile(this.fileUrl, "utf8");
      this.state = { ...structuredClone(defaultState), ...JSON.parse(raw) };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.save();
    }
    this.loaded = true;
  }

  async save() {
    const filePath = fileURLToPath(this.fileUrl);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(this.state, null, 2));
  }

  async cacheProfile(url, profile) {
    await this.load();
    this.state.profileCache[url] = {
      ...profile,
      cachedAt: new Date().toISOString()
    };
    await this.save();
  }

  async getCachedProfile(url) {
    await this.load();
    return this.state.profileCache[url] || null;
  }

  async markProcessed(url) {
    await this.load();
    if (!this.state.processedUrls.includes(url)) {
      this.state.processedUrls.push(url);
      await this.save();
    }
  }

  async isProcessed(url) {
    await this.load();
    return this.state.processedUrls.includes(url);
  }

  async recordSaved(lead) {
    await this.load();
    const event = {
      tiktokUrl: lead.tiktokUrl,
      username: lead.username || "",
      savedAt: new Date().toISOString()
    };
    this.state.savedEvents.push(event);
    this.state.recentSaved = [event, ...this.state.recentSaved.filter((item) => item.tiktokUrl !== event.tiktokUrl)].slice(0, 10);
    await this.save();
    return event;
  }

  async countSavedToday() {
    await this.load();
    const today = new Date().toISOString().slice(0, 10);
    return this.state.savedEvents.filter((event) => event.savedAt.startsWith(today)).length;
  }

  async getRecentSaved() {
    await this.load();
    return this.state.recentSaved.slice(0, 10);
  }
}

export const localStore = new LocalStore();
