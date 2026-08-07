const DEFAULT_SETTINGS = {
  apiBaseUrl: "https://lead-gen-sgz6.onrender.com",
  minFollowers: 2000,
  maxFollowers: 20100,
  autoSkipOutOfRange: true,
  autoSave: false,
  compactMode: false,
  dailyGoal: 300,
  approvalMode: false,
  approvalSheetUrl: "https://docs.google.com/spreadsheets/d/1ZU2ys_mtxpVZW-zke3QUJ4E7K0ESYS5hZzDqEf3CPC4/edit?gid=0#gid=0",
  approvalSourceSheet: "",
  approvalLinkColumn: "A",
  reviewerEmail: ""
};

const fields = {
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  minFollowers: document.querySelector("#minFollowers"),
  maxFollowers: document.querySelector("#maxFollowers"),
  dailyGoal: document.querySelector("#dailyGoal"),
  autoSkipOutOfRange: document.querySelector("#autoSkipOutOfRange"),
  autoSave: document.querySelector("#autoSave"),
  compactMode: document.querySelector("#compactMode"),
  approvalMode: document.querySelector("#approvalMode"),
  approvalSheetUrl: document.querySelector("#approvalSheetUrl"),
  approvalSourceSheet: document.querySelector("#approvalSourceSheet"),
  approvalLinkColumn: document.querySelector("#approvalLinkColumn"),
  reviewerEmail: document.querySelector("#reviewerEmail"),
  save: document.querySelector("#save"),
  status: document.querySelector("#status")
};

loadSettings();
fields.save.addEventListener("click", saveSettings);

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  fields.apiBaseUrl.value = settings.apiBaseUrl;
  fields.minFollowers.value = settings.minFollowers;
  fields.maxFollowers.value = settings.maxFollowers;
  fields.dailyGoal.value = settings.dailyGoal;
  fields.autoSkipOutOfRange.checked = settings.autoSkipOutOfRange;
  fields.autoSave.checked = settings.autoSave;
  fields.compactMode.checked = settings.compactMode;
  fields.approvalMode.checked = settings.approvalMode;
  fields.approvalSheetUrl.value = settings.approvalSheetUrl;
  fields.approvalSourceSheet.value = settings.approvalSourceSheet;
  fields.approvalLinkColumn.value = settings.approvalLinkColumn;
  fields.reviewerEmail.value = settings.reviewerEmail;
}

async function saveSettings() {
  const settings = {
    apiBaseUrl: fields.apiBaseUrl.value.replace(/\/+$/, ""),
    minFollowers: Number(fields.minFollowers.value),
    maxFollowers: Number(fields.maxFollowers.value),
    dailyGoal: Number(fields.dailyGoal.value),
    autoSkipOutOfRange: fields.autoSkipOutOfRange.checked,
    autoSave: fields.autoSave.checked,
    compactMode: fields.compactMode.checked,
    approvalMode: fields.approvalMode.checked,
    approvalSheetUrl: fields.approvalSheetUrl.value.trim(),
    approvalSourceSheet: fields.approvalSourceSheet.value.trim(),
    approvalLinkColumn: fields.approvalLinkColumn.value.trim() || "A",
    reviewerEmail: fields.reviewerEmail.value.trim().toLowerCase()
  };

  if (!settings.apiBaseUrl || settings.minFollowers > settings.maxFollowers) {
    fields.status.textContent = "Check URL and follower range.";
    fields.status.style.color = "#fb7185";
    return;
  }

  if (settings.approvalMode && (!settings.approvalSheetUrl || !settings.approvalLinkColumn || !settings.reviewerEmail)) {
    fields.status.textContent = "Approval Mode needs Sheet URL, link column, and Gmail.";
    fields.status.style.color = "#fb7185";
    return;
  }

  await chrome.storage.sync.set(settings);
  fields.status.textContent = "Saved.";
  fields.status.style.color = "#4ade80";
}
