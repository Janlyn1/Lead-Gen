import { google } from "googleapis";
import { env, hasAppsScriptCredentials, hasGoogleCredentials } from "../config/env.js";

const EXTENSION_LINK_SHEET = "Extension Link";
const EXPAND_LINK_SHEET = "Expand Link";
const EXISTING_SHEET = "Existing";
const EXTENSION_HEADERS = ["TikTok URL"];
const EXPAND_HEADERS = [
  "Full Name",
  "TikTok Profile Link",
  "Follower Count",
  "Content Category",
  "Location",
  "Business | Contact Email",
  "Sourcer",
  "Date",
  "Notes"
];

export class SheetsService {
  constructor() {
    this.client = null;
  }

  async getClient() {
    if (hasAppsScriptCredentials) {
      const error = new Error("Google client is not used when APPS_SCRIPT_WEB_APP_URL is configured.");
      error.statusCode = 500;
      throw error;
    }

    if (!hasGoogleCredentials) {
      const error = new Error("Google Sheets credentials are not configured. Set APPS_SCRIPT_WEB_APP_URL or service account credentials.");
      error.statusCode = 503;
      throw error;
    }

    if (this.client) return this.client;

    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      credentials:
        env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY
          ? {
              client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
              private_key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
            }
          : undefined
    });

    this.client = google.sheets({ version: "v4", auth });
    return this.client;
  }

  async ensureStructure() {
    if (hasAppsScriptCredentials) {
      await this.requestAppsScript("ensureStructure");
      return;
    }

    const sheets = await this.getClient();
    const metadata = await sheets.spreadsheets.get({ spreadsheetId: env.SPREADSHEET_ID });
    const existingTitles = new Set(metadata.data.sheets.map((sheet) => sheet.properties.title));

    const addSheetRequests = [EXTENSION_LINK_SHEET, EXPAND_LINK_SHEET, EXISTING_SHEET]
      .filter((title) => !existingTitles.has(title))
      .map((title) => ({ addSheet: { properties: { title } } }));

    if (addSheetRequests.length) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: env.SPREADSHEET_ID,
        requestBody: { requests: addSheetRequests }
      });
    }

    await this.ensureHeaders(EXTENSION_LINK_SHEET, EXTENSION_HEADERS);
    await this.ensureHeaders(EXPAND_LINK_SHEET, EXPAND_HEADERS);
    await this.ensureHeaders(EXISTING_SHEET, EXPAND_HEADERS);
  }

  async ensureHeaders(sheetName, headers) {
    const sheets = await this.getClient();
    const range = `'${sheetName}'!A1:${columnLetter(headers.length)}1`;
    const current = await sheets.spreadsheets.values.get({
      spreadsheetId: env.SPREADSHEET_ID,
      range
    });

    const firstRow = current.data.values?.[0] || [];
    if (headers.every((header, index) => firstRow[index] === header)) return;

    await sheets.spreadsheets.values.update({
      spreadsheetId: env.SPREADSHEET_ID,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [headers] }
    });
  }

  async appendExtensionLink(tiktokUrl) {
    if (hasAppsScriptCredentials) {
      await this.requestAppsScript("appendExtensionLink", { tiktokUrl });
      return;
    }

    const sheets = await this.getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: env.SPREADSHEET_ID,
      range: `'${EXTENSION_LINK_SHEET}'!A:A`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [[tiktokUrl]] }
    });
  }

  async appendExpandedLead(lead) {
    if (hasAppsScriptCredentials) {
      await this.requestAppsScript("appendExpandedLead", { lead });
      return;
    }

    const sheets = await this.getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: env.SPREADSHEET_ID,
      range: `'${EXPAND_LINK_SHEET}'!A:I`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            lead.fullName || lead.username || "",
            lead.tiktokUrl,
            lead.followers || "",
            Array.isArray(lead.category) ? lead.category.join(", ") : lead.category || "",
            lead.location || "",
            lead.email || "",
            lead.sourcer || "",
            lead.date || new Date().toISOString().slice(0, 10),
            lead.notes || ""
          ]
        ]
      }
    });
  }

  async getExtensionUrls() {
    if (hasAppsScriptCredentials) {
      const response = await this.requestAppsScript("getExtensionUrls");
      return response.urls || [];
    }

    const rows = await this.getValues(`'${EXTENSION_LINK_SHEET}'!A2:A`);
    return rows.map((row) => row[0]).filter(Boolean);
  }

  async getExpandedRows() {
    if (hasAppsScriptCredentials) {
      const response = await this.requestAppsScript("getExpandedRows");
      return response.rows || [];
    }

    return this.getValues(`'${EXPAND_LINK_SHEET}'!A2:I`);
  }

  async getExistingRows() {
    if (hasAppsScriptCredentials) {
      const response = await this.requestAppsScript("getExistingRows");
      return response.rows || [];
    }

    return this.getValues(`'${EXISTING_SHEET}'!A2:J`);
  }

  async getExpandedUrls() {
    const rows = await this.getExpandedRows();
    return rows.map((row) => row[1] || row[8]).filter(Boolean);
  }

  async hasLead(tiktokUrl, username = "") {
    if (hasAppsScriptCredentials) {
      const response = await this.requestAppsScript("hasLead", { tiktokUrl, username });
      return Boolean(response.duplicate);
    }

    const [extensionUrls, expandedRows, existingRows] = await Promise.all([
      this.getExtensionUrls(),
      this.getExpandedRows(),
      this.getExistingRows()
    ]);
    const normalizedUsername = normalizeIdentity(username);

    if (extensionUrls.some((url) => normalizeTikTokUrlLoose(url) === normalizeTikTokUrlLoose(tiktokUrl))) return true;

    return [...expandedRows, ...existingRows].some((row) => {
      const rowName = normalizeIdentity(row[0] || "");
      const rowUrl = findTikTokUrlInRow(row) || row[1] || row[8] || "";
      const rowUrlUsername = normalizeIdentity(usernameFromTikTokUrl(rowUrl));
      return rowUrl === tiktokUrl ||
        normalizeTikTokUrlLoose(rowUrl) === normalizeTikTokUrlLoose(tiktokUrl) ||
        (normalizedUsername && (rowName === normalizedUsername || rowUrlUsername === normalizedUsername));
    });
  }

  async getReviewNext(settings) {
    if (!hasAppsScriptCredentials) {
      const error = new Error("Approval review requires APPS_SCRIPT_WEB_APP_URL.");
      error.statusCode = 503;
      throw error;
    }

    return this.requestAppsScript("getReviewNext", normalizeReviewSettings(settings));
  }

  async recordReviewDecision(input) {
    if (!hasAppsScriptCredentials) {
      const error = new Error("Approval review requires APPS_SCRIPT_WEB_APP_URL.");
      error.statusCode = 503;
      throw error;
    }

    return this.requestAppsScript("recordReviewDecision", {
      ...normalizeReviewSettings(input),
      url: input.url,
      decision: input.decision,
      sourceRow: input.sourceRow,
      notes: input.notes
    });
  }

  async getValues(range) {
    const sheets = await this.getClient();
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: env.SPREADSHEET_ID,
        range
      });
      return response.data.values || [];
    } catch (error) {
      if (error.code === 400) return [];
      throw error;
    }
  }

  async requestAppsScript(action, payload = {}) {
    if (!env.APPS_SCRIPT_SECRET) {
      const error = new Error("APPS_SCRIPT_SECRET is required when APPS_SCRIPT_WEB_APP_URL is configured.");
      error.statusCode = 503;
      throw error;
    }

    const response = await fetch(env.APPS_SCRIPT_WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        secret: env.APPS_SCRIPT_SECRET,
        ...payload
      })
    });

    const text = await response.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      const error = new Error(`Apps Script returned non-JSON response: ${text.slice(0, 120)}`);
      error.statusCode = 502;
      throw error;
    }

    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || `Apps Script request failed with ${response.status}`);
      error.statusCode = response.ok ? 502 : response.status;
      throw error;
    }

    return data;
  }
}

function columnLetter(index) {
  let dividend = index;
  let name = "";
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return name;
}

export const sheetsService = new SheetsService();

function normalizeTikTokUrlLoose(value) {
  return String(value || "")
    .trim()
    .split(/[?#]/)[0]
    .replace(/\/$/, "")
    .replace(/^http:\/\//, "https://")
    .replace("https://tiktok.com/", "https://www.tiktok.com/");
}

function usernameFromTikTokUrl(value) {
  const match = String(value || "").match(/\/@([^/?#]+)/);
  return match ? match[1] : "";
}

function normalizeIdentity(value) {
  return String(value || "").replace(/^@/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findTikTokUrlInRow(row) {
  return row
    .map((cell) => String(cell || "").trim())
    .find((cell) => /^https?:\/\/(?:www\.)?tiktok\.com\/@[^/?#\s]+/i.test(cell)) || "";
}

function normalizeReviewSettings(settings = {}) {
  return {
    spreadsheetUrl: String(settings.spreadsheetUrl || settings.sheetUrl || "").trim(),
    sourceSheetName: String(settings.sourceSheetName || "").trim(),
    linkColumn: String(settings.linkColumn || "A").trim(),
    reviewerEmail: String(settings.reviewerEmail || "").trim().toLowerCase()
  };
}
