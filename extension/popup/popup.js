const DEFAULT_SETTINGS = {
  apiBaseUrl: "https://lead-gen-sgz6.onrender.com",
  minFollowers: 2000,
  maxFollowers: 20000,
  autoSkipOutOfRange: true,
  autoSave: false,
  compactMode: false,
  dailyGoal: 300
};

const fields = {
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  minFollowers: document.querySelector("#minFollowers"),
  maxFollowers: document.querySelector("#maxFollowers"),
  dailyGoal: document.querySelector("#dailyGoal"),
  autoSkipOutOfRange: document.querySelector("#autoSkipOutOfRange"),
  autoSave: document.querySelector("#autoSave"),
  compactMode: document.querySelector("#compactMode"),
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
}

async function saveSettings() {
  const settings = {
    apiBaseUrl: fields.apiBaseUrl.value.replace(/\/+$/, ""),
    minFollowers: Number(fields.minFollowers.value),
    maxFollowers: Number(fields.maxFollowers.value),
    dailyGoal: Number(fields.dailyGoal.value),
    autoSkipOutOfRange: fields.autoSkipOutOfRange.checked,
    autoSave: fields.autoSave.checked,
    compactMode: fields.compactMode.checked
  };

  if (!settings.apiBaseUrl || settings.minFollowers > settings.maxFollowers) {
    fields.status.textContent = "Check URL and follower range.";
    fields.status.style.color = "#fb7185";
    return;
  }

  await chrome.storage.sync.set(settings);
  fields.status.textContent = "Saved.";
  fields.status.style.color = "#4ade80";
}
