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

function doGet() {
  return json_({
    ok: true,
    name: "TikTok Lead Collector Apps Script",
    message: "Use POST requests from the backend for sheet operations.",
    cleanup: "Run cleanExpandLinkTrash() once if Expand Link has name-only trash rows."
  });
}

function resetLeadSheets() {
  resetSheet_(EXPAND_LINK_SHEET, EXPAND_HEADERS);
  resetSheet_(EXISTING_SHEET, EXPAND_HEADERS);
}

function resetExpandLinkSheet() {
  resetSheet_(EXPAND_LINK_SHEET, EXPAND_HEADERS);
}

function resetExistingSheet() {
  resetSheet_(EXISTING_SHEET, EXPAND_HEADERS);
}

function cleanExpandLinkTrash() {
  ensureStructure_();
  cleanupExpandLinkTrash_();
  return "Expand Link cleaned.";
}

function doPost(e) {
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || "{}");
    assertSecret_(payload.secret);
    const action = payload.action;

    if (action === "ensureStructure") {
      ensureStructure_();
      return json_({ ok: true });
    }

    if (action === "appendExtensionLink") {
      ensureStructure_();
      getSheet_(EXTENSION_LINK_SHEET).appendRow([payload.tiktokUrl || ""]);
      return json_({ ok: true });
    }

    if (action === "appendExpandedLead") {
      ensureStructure_();
      const lead = payload.lead || {};
      getSheet_(EXPAND_LINK_SHEET).appendRow([
        lead.fullName || lead.username || "",
        lead.tiktokUrl || "",
        lead.followers || "",
        Array.isArray(lead.category) ? lead.category.join(", ") : lead.category || "",
        lead.location || "",
        lead.email || "",
        lead.sourcer || "",
        lead.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
        lead.notes || ""
      ]);
      return json_({ ok: true });
    }

    if (action === "getExtensionUrls") {
      ensureStructure_();
      const rows = getRows_(EXTENSION_LINK_SHEET, 1);
      return json_({ ok: true, urls: rows.map(function(row) { return row[0]; }).filter(Boolean) });
    }

    if (action === "getExpandedRows") {
      ensureStructure_();
      return json_({ ok: true, rows: getRows_(EXPAND_LINK_SHEET, 9) });
    }

    if (action === "getExistingRows") {
      ensureStructure_();
      return json_({ ok: true, rows: getRows_(EXISTING_SHEET, 10) });
    }

    if (action === "hasLead") {
      ensureStructure_();
      return json_({ ok: true, duplicate: hasLead_(payload.tiktokUrl || "", payload.username || "") });
    }

    throw new Error("Unsupported action: " + action);
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

function ensureStructure_() {
  ensureSheet_(EXTENSION_LINK_SHEET, EXTENSION_HEADERS);
  ensureSheet_(EXPAND_LINK_SHEET, EXPAND_HEADERS);
  ensureSheet_(EXISTING_SHEET, EXPAND_HEADERS);
  cleanupExpandLinkTrash_();
}

function ensureSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const current = headerRange.getValues()[0];
  const matches = headers.every(function(header, index) {
    return current[index] === header;
  });

  if (!matches) {
    headerRange.setValues([headers]);
    sheet.setFrozenRows(1);
  }

  if (name === EXPAND_LINK_SHEET || name === EXTENSION_LINK_SHEET) {
    trimExtraColumns_(sheet, headers.length);
  }
}

function resetSheet_(name, headers) {
  const ss = getSpreadsheet_();
  const existing = ss.getSheetByName(name);
  if (existing) {
    existing.setName(name + " Backup " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss"));
  }

  const sheet = ss.insertSheet(name);
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(1);
  sheet.clear({ contentsOnly: false });
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);

  const extraColumns = sheet.getMaxColumns() - headers.length;
  if (extraColumns > 0) {
    sheet.deleteColumns(headers.length + 1, extraColumns);
  }

  const extraRows = sheet.getMaxRows() - 200;
  if (extraRows > 0) {
    sheet.deleteRows(201, extraRows);
  }
}

function getRows_(sheetName, width) {
  const sheet = getSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const columnCount = Math.min(width, sheet.getMaxColumns());
  return sheet.getRange(2, 1, lastRow - 1, columnCount).getValues();
}

function hasLead_(tiktokUrl, username) {
  const normalizedUsername = normalizeIdentity_(username);
  const extensionUrls = getRows_(EXTENSION_LINK_SHEET, 1).map(function(row) { return row[0]; });
  if (extensionUrls.some(function(url) {
    return normalizeTikTokUrl_(url) === normalizeTikTokUrl_(tiktokUrl);
  })) return true;

  const rows = getRows_(EXPAND_LINK_SHEET, 10).concat(getRows_(EXISTING_SHEET, 10));
  return rows.some(function(row) {
    const rowName = normalizeIdentity_(row[0] || "");
    const rowUrl = findTikTokUrlInRow_(row) || row[1] || row[8] || "";
    const rowUrlUsername = normalizeIdentity_(usernameFromTikTokUrl_(rowUrl));
    return rowUrl === tiktokUrl ||
      normalizeTikTokUrl_(rowUrl) === normalizeTikTokUrl_(tiktokUrl) ||
      (normalizedUsername && (rowName === normalizedUsername || rowUrlUsername === normalizedUsername));
  });
}

function cleanupExpandLinkTrash_() {
  const sheet = getSheet_(EXPAND_LINK_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return;

  const width = Math.min(Math.max(sheet.getLastColumn(), EXPAND_HEADERS.length), sheet.getMaxColumns());
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();

  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    const nonEmpty = row.filter(function(cell) { return String(cell || "").trim(); });
    const hasTikTokUrl = Boolean(findTikTokUrlInRow_(row));
    const hasProfileLink = Boolean(row[1] && String(row[1]).indexOf("tiktok.com/@") !== -1);
    const looksLikeNameOnlyTrash = !hasTikTokUrl && !hasProfileLink && nonEmpty.length > 0 && nonEmpty.length <= 2;

    if (looksLikeNameOnlyTrash) {
      sheet.deleteRow(index + 2);
    }
  }
}

function trimExtraColumns_(sheet, width) {
  const extraColumns = sheet.getMaxColumns() - width;
  if (extraColumns > 0) {
    sheet.deleteColumns(width + 1, extraColumns);
  }
}

function findTikTokUrlInRow_(row) {
  const match = row.map(function(cell) { return String(cell || "").trim(); }).filter(Boolean).find(function(cell) {
    return /https?:\/\/(?:www\.)?tiktok\.com\/@[^/?#\s]+/i.test(cell);
  });
  return match || "";
}

function normalizeTikTokUrl_(value) {
  return String(value || "").trim().replace(/\/$/, "").replace(/^http:\/\//, "https://").replace("https://tiktok.com/", "https://www.tiktok.com/");
}

function usernameFromTikTokUrl_(value) {
  const match = String(value || "").match(/\/@([^/?#]+)/);
  return match ? match[1] : "";
}

function normalizeIdentity_(value) {
  return String(value || "").replace(/^@/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getSheet_(name) {
  return getSpreadsheet_().getSheetByName(name);
}

function getSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  return spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
}

function assertSecret_(actual) {
  const expected = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
  if (!expected) throw new Error("WEBHOOK_SECRET script property is not set.");
  if (actual !== expected) throw new Error("Invalid webhook secret.");
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
