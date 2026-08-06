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

function doGet() {
  return json_({
    ok: true,
    name: "TikTok Lead Collector Apps Script",
    message: "Use POST requests from the backend for sheet operations."
  });
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
        lead.username || "",
        lead.followers || "",
        lead.email || "",
        lead.instagram || "",
        lead.facebook || "",
        lead.youtube || "",
        lead.location || "",
        Array.isArray(lead.category) ? lead.category.join(", ") : lead.category || "",
        lead.tiktokUrl || "",
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
      return json_({ ok: true, rows: getRows_(EXPAND_LINK_SHEET, 10) });
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
}

function getRows_(sheetName, width) {
  const sheet = getSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, width).getValues();
}

function hasLead_(tiktokUrl, username) {
  const normalizedUsername = String(username || "").replace(/^@/, "").toLowerCase();
  const extensionUrls = getRows_(EXTENSION_LINK_SHEET, 1).map(function(row) { return row[0]; });
  if (extensionUrls.indexOf(tiktokUrl) !== -1) return true;

  return getRows_(EXPAND_LINK_SHEET, 10).some(function(row) {
    const rowUsername = String(row[0] || "").replace(/^@/, "").toLowerCase();
    return row[8] === tiktokUrl || (normalizedUsername && rowUsername === normalizedUsername);
  });
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
