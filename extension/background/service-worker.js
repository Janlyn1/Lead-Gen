const RENDER_BACKEND_URL = "https://lead-gen-sgz6.onrender.com";

const DEFAULT_SETTINGS = {
  apiBaseUrl: RENDER_BACKEND_URL,
  minFollowers: 2000,
  maxFollowers: 20100,
  autoSkipOutOfRange: true,
  autoSave: false,
  compactMode: false,
  dailyGoal: 300
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const next = normalizeSettings({ ...DEFAULT_SETTINGS, ...current });
  await chrome.storage.sync.set(next);
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
  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, status: response.status, url, ...data };
    }
    return { ok: true, url, ...data };
  } catch (error) {
    return { ok: false, error: `Cannot reach backend (${new URL(url).origin}): ${error.message}`, url };
  }
}

async function getSettings() {
  const settings = normalizeSettings(await chrome.storage.sync.get(DEFAULT_SETTINGS));
  await chrome.storage.sync.set(settings);
  return settings;
}

function sanitizeSettings(settings) {
  const next = {};
  if (typeof settings.apiBaseUrl === "string") next.apiBaseUrl = settings.apiBaseUrl.replace(/\/+$/, "");
  if (Number.isFinite(Number(settings.minFollowers))) next.minFollowers = Number(settings.minFollowers);
  if (Number.isFinite(Number(settings.maxFollowers))) next.maxFollowers = Number(settings.maxFollowers);
  if (typeof settings.autoSkipOutOfRange === "boolean") next.autoSkipOutOfRange = settings.autoSkipOutOfRange;
  if (typeof settings.autoSave === "boolean") next.autoSave = settings.autoSave;
  if (typeof settings.compactMode === "boolean") next.compactMode = settings.compactMode;
  if (Number.isFinite(Number(settings.dailyGoal))) next.dailyGoal = Number(settings.dailyGoal);
  return normalizeSettings(next);
}

function normalizeSettings(settings) {
  const next = { ...DEFAULT_SETTINGS, ...settings };
  if (!next.apiBaseUrl || /^http:\/\/localhost(?::\d+)?$/i.test(next.apiBaseUrl)) {
    next.apiBaseUrl = RENDER_BACKEND_URL;
  }
  next.apiBaseUrl = String(next.apiBaseUrl).replace(/\/+$/, "");
  return next;
}
