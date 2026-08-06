import { google } from "googleapis";
import { env, hasGoogleCredentials } from "../config/env.js";

const EXTENSION_LINK_SHEET = "Extension Link";
const EXPAND_LINK_SHEET = "Expand Link";
const EXTENSION_HEADERS = ["TikTok URL"];
const EXPAND_HEADERS = [
  "Username",
  "Followers",
  "Email",
  "Instagram",
  "Facebook",
  "YouTube",
  "Location",
  "Category",
  "TikTok URL",
  "Notes"
];

export class SheetsService {
  constructor() {
    this.client = null;
  }

  async getClient() {
    if (!hasGoogleCredentials) {
      const error = new Error("Google Sheets credentials are not configured.");
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
    const sheets = await this.getClient();
    const metadata = await sheets.spreadsheets.get({ spreadsheetId: env.SPREADSHEET_ID });
    const existingTitles = new Set(metadata.data.sheets.map((sheet) => sheet.properties.title));

    const addSheetRequests = [EXTENSION_LINK_SHEET, EXPAND_LINK_SHEET]
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
    const sheets = await this.getClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: env.SPREADSHEET_ID,
      range: `'${EXPAND_LINK_SHEET}'!A:J`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            lead.username || "",
            lead.followers || "",
            lead.email || "",
            lead.instagram || "",
            lead.facebook || "",
            lead.youtube || "",
            lead.location || "",
            Array.isArray(lead.category) ? lead.category.join(", ") : lead.category || "",
            lead.tiktokUrl,
            lead.notes || ""
          ]
        ]
      }
    });
  }

  async getExtensionUrls() {
    const rows = await this.getValues(`'${EXTENSION_LINK_SHEET}'!A2:A`);
    return rows.map((row) => row[0]).filter(Boolean);
  }

  async getExpandedRows() {
    return this.getValues(`'${EXPAND_LINK_SHEET}'!A2:J`);
  }

  async getExpandedUrls() {
    const rows = await this.getExpandedRows();
    return rows.map((row) => row[8]).filter(Boolean);
  }

  async hasLead(tiktokUrl, username = "") {
    const [extensionUrls, expandedRows] = await Promise.all([this.getExtensionUrls(), this.getExpandedRows()]);
    const normalizedUsername = String(username || "").replace(/^@/, "").toLowerCase();

    if (extensionUrls.includes(tiktokUrl)) return true;

    return expandedRows.some((row) => {
      const rowUsername = String(row[0] || "").replace(/^@/, "").toLowerCase();
      return row[8] === tiktokUrl || (normalizedUsername && rowUsername === normalizedUsername);
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

