import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";

const EMPTY_RESULT = {
  email: "",
  instagram: "",
  facebook: "",
  youtube: "",
  location: "",
  category: []
};

export class GeminiService {
  constructor() {
    this.client = env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) : null;
  }

  isEnabled() {
    return Boolean(this.client);
  }

  async parseBio(bio) {
    if (!this.client || !bio?.trim()) return EMPTY_RESULT;

    const prompt = [
      "Extract creator lead details from this TikTok bio.",
      "Return only valid JSON with these keys:",
      "email, instagram, facebook, youtube, location, category.",
      "category must be an array using these values only: Beauty, Fashion, Lifestyle, Food, Travel, Fitness, Gaming, Tech, Business, Education, Parenting, Pets, Music, Entertainment, Comedy, Automotive.",
      "Use empty strings and an empty category array when unknown.",
      "",
      `Bio: ${bio}`
    ].join("\n");

    const response = await this.client.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt
    });

    return normalizeGeminiJson(response.text || "");
  }
}

function normalizeGeminiJson(text) {
  try {
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return {
      email: parsed.email || "",
      instagram: parsed.instagram || "",
      facebook: parsed.facebook || "",
      youtube: parsed.youtube || "",
      location: parsed.location || "",
      category: Array.isArray(parsed.category) ? parsed.category : []
    };
  } catch {
    return EMPTY_RESULT;
  }
}

export const geminiService = new GeminiService();

