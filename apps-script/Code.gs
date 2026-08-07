const EXTENSION_LINK_SHEET = "Extension Link";
const EXPAND_LINK_SHEET = "Expand Link";
const EXISTING_SHEET = "Existing";
const ADMIN_SHEET = "Admin";
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
const ADMIN_HEADERS = ["Google Account", "Sheet Name", "Created At", "Last Active At"];
const REVIEW_HEADERS = ["TikTok URL", "Decision", "Reviewed At", "Source Row", "Google Account", "Notes"];

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

    if (action === "getReviewNext") {
      return json_(getReviewNext_(payload));
    }

    if (action === "recordReviewDecision") {
      return json_(recordReviewDecision_(payload));
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
  ensureSheet_(ADMIN_SHEET, ADMIN_HEADERS);
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

function getReviewNext_(payload) {
  const context = getReviewContext_(payload);
  const rows = getReviewSourceRows_(context.sourceSheet, context.linkColumn);
  const reviewed = getReviewedUrls_(context.reviewerSheet);
  const next = rows.find(function(item) {
    return item.url && !reviewed[normalizeTikTokUrl_(item.url)];
  });

  touchAdminAccount_(context.spreadsheet, context.reviewerEmail, context.reviewerSheetName);

  return {
    ok: true,
    item: next || null,
    total: rows.length,
    reviewed: Object.keys(reviewed).length,
    remaining: Math.max(0, rows.length - Object.keys(reviewed).length),
    reviewerSheet: context.reviewerSheetName
  };
}

function recordReviewDecision_(payload) {
  const context = getReviewContext_(payload);
  const decision = String(payload.decision || "").toUpperCase();
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    throw new Error("Decision must be APPROVED or REJECTED.");
  }

  const url = String(payload.url || "").trim();
  if (!url) throw new Error("Review URL is required.");

  upsertReviewRow_(context.reviewerSheet, {
    url: url,
    decision: decision,
    reviewedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
    sourceRow: payload.sourceRow || "",
    reviewerEmail: context.reviewerEmail,
    notes: payload.notes || ""
  });

  touchAdminAccount_(context.spreadsheet, context.reviewerEmail, context.reviewerSheetName);
  const next = getReviewNext_(payload);
  return {
    ok: true,
    saved: true,
    decision: decision,
    next: next.item,
    total: next.total,
    reviewed: next.reviewed,
    remaining: next.remaining,
    reviewerSheet: context.reviewerSheetName
  };
}

function getReviewContext_(payload) {
  const spreadsheetId = parseSpreadsheetId_(payload.spreadsheetUrl || payload.sheetUrl || "");
  const reviewerEmail = String(payload.reviewerEmail || "").trim().toLowerCase();
  if (!spreadsheetId) throw new Error("Approval Google Sheet URL is required.");
  if (!reviewerEmail) throw new Error("Google account email is required.");

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sourceSheet = getSourceSheet_(spreadsheet, payload.sourceSheetName || "", payload.spreadsheetUrl || payload.sheetUrl || "");
  const reviewerSheetName = safeSheetName_(reviewerEmail);
  const reviewerSheet = ensureSheetInSpreadsheet_(spreadsheet, reviewerSheetName, REVIEW_HEADERS);
  ensureSheetInSpreadsheet_(spreadsheet, ADMIN_SHEET, ADMIN_HEADERS);

  return {
    spreadsheet: spreadsheet,
    sourceSheet: sourceSheet,
    linkColumn: String(payload.linkColumn || "D").trim(),
    reviewerEmail: reviewerEmail,
    reviewerSheetName: reviewerSheetName,
    reviewerSheet: reviewerSheet
  };
}

function getSourceSheet_(spreadsheet, sourceSheetName, spreadsheetUrl) {
  if (sourceSheetName) {
    const named = spreadsheet.getSheetByName(sourceSheetName);
    if (!named) throw new Error("Source sheet tab not found: " + sourceSheetName);
    return named;
  }

  const gid = String(spreadsheetUrl || "").match(/[?#&]gid=(\d+)/);
  if (gid) {
    const byGid = spreadsheet.getSheets().find(function(sheet) {
      return String(sheet.getSheetId()) === gid[1];
    });
    if (byGid) return byGid;
  }

  return spreadsheet.getSheets().find(function(sheet) {
    return sheet.getName() !== ADMIN_SHEET && !isReviewSheet_(sheet);
  }) || spreadsheet.getSheets()[0];
}

function getReviewSourceRows_(sheet, linkColumn) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const columnIndex = resolveColumnIndex_(sheet, linkColumn);
  const values = sheet.getRange(2, columnIndex, lastRow - 1, 1).getValues();
  return values.map(function(row, index) {
    return {
      url: String(row[0] || "").trim(),
      sourceRow: index + 2
    };
  }).filter(function(item) {
    return item.url;
  });
}

function resolveColumnIndex_(sheet, linkColumn) {
  const value = String(linkColumn || "D").trim();
  if (/^\d+$/.test(value)) return Number(value);
  if (/^[A-Za-z]+$/.test(value)) return columnNameToIndex_(value);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const normalized = value.toLowerCase();
  const index = headers.findIndex(function(header) {
    return String(header || "").trim().toLowerCase() === normalized;
  });
  if (index === -1) throw new Error("Link column not found: " + value);
  return index + 1;
}

function getReviewedUrls_(sheet) {
  const reviewed = {};
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return reviewed;
  const rows = sheet.getRange(2, 1, lastRow - 1, REVIEW_HEADERS.length).getValues();
  rows.forEach(function(row) {
    if (row[0]) reviewed[normalizeTikTokUrl_(row[0])] = true;
  });
  return reviewed;
}

function upsertReviewRow_(sheet, record) {
  const normalizedUrl = normalizeTikTokUrl_(record.url);
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const urls = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let index = 0; index < urls.length; index++) {
      if (normalizeTikTokUrl_(urls[index][0]) === normalizedUrl) {
        sheet.getRange(index + 2, 1, 1, REVIEW_HEADERS.length).setValues([reviewRow_(record)]);
        return;
      }
    }
  }
  sheet.appendRow(reviewRow_(record));
}

function reviewRow_(record) {
  return [record.url, record.decision, record.reviewedAt, record.sourceRow, record.reviewerEmail, record.notes];
}

function touchAdminAccount_(spreadsheet, email, sheetName) {
  const sheet = ensureSheetInSpreadsheet_(spreadsheet, ADMIN_SHEET, ADMIN_HEADERS);
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, ADMIN_HEADERS.length).getValues();
    for (let index = 0; index < rows.length; index++) {
      if (String(rows[index][0] || "").trim().toLowerCase() === email) {
        sheet.getRange(index + 2, 1, 1, ADMIN_HEADERS.length).setValues([[email, sheetName, rows[index][2] || now, now]]);
        return;
      }
    }
  }
  sheet.appendRow([email, sheetName, now, now]);
}

function ensureSheetInSpreadsheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const current = headerRange.getValues()[0];
  const matches = headers.every(function(header, index) {
    return current[index] === header;
  });
  if (!matches) {
    headerRange.setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
  return sheet;
}

function parseSpreadsheetId_(value) {
  const text = String(value || "").trim();
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(text) ? text : "";
}

function safeSheetName_(value) {
  return String(value || "reviewer").replace(/[\\/?*\[\]:]/g, "-").slice(0, 100);
}

function isReviewSheet_(sheet) {
  const name = sheet.getName();
  if (name === EXTENSION_LINK_SHEET || name === EXPAND_LINK_SHEET || name === EXISTING_SHEET) return true;
  const headers = sheet.getRange(1, 1, 1, Math.min(REVIEW_HEADERS.length, sheet.getMaxColumns())).getValues()[0];
  return REVIEW_HEADERS.every(function(header, index) {
    return headers[index] === header;
  });
}

function columnNameToIndex_(name) {
  return String(name || "D").toUpperCase().split("").reduce(function(total, char) {
    return total * 26 + char.charCodeAt(0) - 64;
  }, 0);
}

function normalizeTikTokUrl_(value) {
  return String(value || "")
    .trim()
    .split(/[?#]/)[0]
    .replace(/\/$/, "")
    .replace(/^http:\/\//, "https://")
    .replace("https://tiktok.com/", "https://www.tiktok.com/");
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
