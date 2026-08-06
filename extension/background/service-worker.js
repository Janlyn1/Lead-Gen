const DEFAULT_SETTINGS = {
  apiBaseUrl: "http://localhost:3000",
  minFollowers: 2000,
  maxFollowers: 20000,
  autoSave: false,
  compactMode: false,
  dailyGoal: 300
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set({ ...DEFAULT_SETTINGS, ...current });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});

async function handleMessage(message) {
  if (message.type === "GET_SETTINGS") {
    return { ok: true, settings: await getSettings() };
  }

  if (message.type === "SAVE_SETTINGS") {
    const settings = sanitizeSettings(message.settings || message.payload?.settings || {});
    await chrome.storage.sync.set(settings);
    return { ok: true, settings: await getSettings() };
  }

  if (message.type === "GET_STATUS") {
    const { apiBaseUrl } = await getSettings();
    const params = new URLSearchParams({
      url: message.payload?.tiktokUrl || "",
      username: message.payload?.username || ""
    });
    return requestJson(`${apiBaseUrl}/api/leads/status?${params.toString()}`);
  }

  if (message.type === "SAVE_LEAD") {
    const { apiBaseUrl } = await getSettings();
    return requestJson(`${apiBaseUrl}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.payload)
    });
  }

  if (message.type === "GET_STATS") {
    const { apiBaseUrl } = await getSettings();
    const [today, recent] = await Promise.all([
      requestJson(`${apiBaseUrl}/api/stats/today`),
      requestJson(`${apiBaseUrl}/api/recent`)
    ]);
    return {
      ok: true,
      savedToday: today.savedToday || 0,
      recentSaved: recent.recentSaved || []
    };
  }

  return { ok: false, error: "Unsupported message type" };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, ...data };
  }
  return { ok: true, ...data };
}

async function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

function sanitizeSettings(settings) {
  const next = {};
  if (typeof settings.apiBaseUrl === "string") next.apiBaseUrl = settings.apiBaseUrl.replace(/\/+$/, "");
  if (Number.isFinite(Number(settings.minFollowers))) next.minFollowers = Number(settings.minFollowers);
  if (Number.isFinite(Number(settings.maxFollowers))) next.maxFollowers = Number(settings.maxFollowers);
  if (typeof settings.autoSave === "boolean") next.autoSave = settings.autoSave;
  if (typeof settings.compactMode === "boolean") next.compactMode = settings.compactMode;
  if (Number.isFinite(Number(settings.dailyGoal))) next.dailyGoal = Number(settings.dailyGoal);
  return next;
}
