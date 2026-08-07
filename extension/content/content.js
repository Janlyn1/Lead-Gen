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

const state = {
  settings: DEFAULT_SETTINGS,
  profile: null,
  profileKey: "",
  duplicate: false,
  savedToday: 0,
  recentSaved: [],
  statusText: "",
  statusKind: "",
  autoSavedUrls: new Set(),
  lastAutoSkippedKey: "",
  autoSkipTimer: null,
  reviewStatus: "",
  reviewKind: "",
  reviewProgress: null,
  rejectConfirming: false,
  reviewBusy: false,
  dragging: false,
  offsetX: 0,
  offsetY: 0
};

const host = document.createElement("div");
host.id = "tlcp-shadow-host";
document.documentElement.appendChild(host);
const root = host.attachShadow({ mode: "open" });

root.innerHTML = `
  <style>${overlayCss()}</style>
  <section class="panel" aria-label="TikTok Lead Collector">
    <header class="drag">
      <div>
        <strong>TikTok Lead Collector</strong>
        <span class="subtle js-mode">Manual</span>
      </div>
      <button class="icon js-toggle-compact" title="Compact mode" aria-label="Compact mode">-</button>
    </header>
    <main class="body">
      <div class="line"><span>Username</span><strong class="js-username">-</strong></div>
      <div class="line"><span>Followers</span><strong class="js-followers">-</strong></div>
      <div class="line"><span>Status</span><strong class="js-qualified">-</strong></div>
      <div class="bio js-bio"></div>
      <label class="note">
        <span>Notes</span>
        <textarea class="js-notes" maxlength="500" rows="2" placeholder="Optional"></textarea>
      </label>
      <div class="line goal"><span>Saved Today</span><strong><span class="js-saved-today">0</span>/<span class="js-daily-goal">300</span></strong></div>
      <button class="save js-save">SAVE</button>
      <div class="notice js-notice"></div>
      <details class="recent">
        <summary>Recently Saved</summary>
        <ol class="js-recent"></ol>
      </details>
      <section class="approval js-approval">
        <div class="approval-title">Approval Review</div>
        <div class="line"><span>Gmail</span><strong class="js-reviewer">-</strong></div>
        <div class="line"><span>Progress</span><strong class="js-review-progress">-</strong></div>
        <button class="review-next js-review-next">START / NEXT LINK</button>
        <div class="decision-row js-decision-row">
          <button class="approve js-approve">APPROVED</button>
          <button class="reject js-reject">REJECTED</button>
        </div>
        <div class="reject-confirm js-reject-confirm">
          <strong>Are you sure?</strong>
          <div>
            <button class="reject-yes js-reject-yes">YES</button>
            <button class="reject-no js-reject-no">NO</button>
          </div>
        </div>
        <div class="notice js-review-notice"></div>
      </section>
    </main>
  </section>
`;

const panel = root.querySelector(".panel");
const dragHandle = root.querySelector(".drag");
const saveButton = root.querySelector(".js-save");
const notesInput = root.querySelector(".js-notes");
const compactButton = root.querySelector(".js-toggle-compact");
const reviewNextButton = root.querySelector(".js-review-next");
const approveButton = root.querySelector(".js-approve");
const rejectButton = root.querySelector(".js-reject");
const rejectYesButton = root.querySelector(".js-reject-yes");
const rejectNoButton = root.querySelector(".js-reject-no");

init();

async function init() {
  state.settings = await getSettings();
  await refreshStats();
  bindEvents();
  detectAndRender();
  setInterval(detectAndRender, 1200);
  observeDom();
}

function bindEvents() {
  saveButton.addEventListener("click", () => saveCurrentLead());
  reviewNextButton.addEventListener("click", () => openNextReviewLink());
  approveButton.addEventListener("click", () => recordReviewDecision("APPROVED"));
  rejectButton.addEventListener("click", () => {
    state.rejectConfirming = true;
    renderApproval();
  });
  rejectYesButton.addEventListener("click", () => recordReviewDecision("REJECTED"));
  rejectNoButton.addEventListener("click", () => {
    state.rejectConfirming = false;
    state.reviewStatus = "Rejected cancelled";
    state.reviewKind = "muted";
    renderApproval();
  });
  compactButton.addEventListener("click", async () => {
    state.settings.compactMode = !state.settings.compactMode;
    await sendMessage("SAVE_SETTINGS", { settings: { compactMode: state.settings.compactMode } });
    render();
  });

  dragHandle.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    const rect = panel.getBoundingClientRect();
    state.offsetX = event.clientX - rect.left;
    state.offsetY = event.clientY - rect.top;
    dragHandle.setPointerCapture(event.pointerId);
  });

  dragHandle.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    panel.style.left = `${Math.max(8, event.clientX - state.offsetX)}px`;
    panel.style.top = `${Math.max(8, event.clientY - state.offsetY)}px`;
    panel.style.right = "auto";
  });

  dragHandle.addEventListener("pointerup", (event) => {
    state.dragging = false;
    dragHandle.releasePointerCapture(event.pointerId);
  });

  document.addEventListener("keydown", (event) => {
    if (event.target?.matches?.("input, textarea, [contenteditable='true']")) return;
    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveCurrentLead();
    }
    if (event.key.toLowerCase() === "x") {
      event.preventDefault();
      state.statusText = "Skipped";
      state.statusKind = "muted";
      renderNotice();
    }
  });

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "sync") return;
    state.settings = await getSettings();
    render();
    maybeAutoSave();
    maybeAutoSkipOutOfRange();
    renderApproval();
  });
}

function observeDom() {
  const observer = new MutationObserver(() => window.requestAnimationFrame(detectAndRender));
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
}

async function detectAndRender() {
  const nextProfile = detectProfile();
  if (!nextProfile) {
    state.profile = null;
    state.profileKey = "";
    state.duplicate = false;
    state.statusText = "";
    state.statusKind = "";
    render();
    return;
  }

  const nextProfileKey = `${nextProfile.tiktokUrl}:${nextProfile.videoId}:${nextProfile.followers}:${nextProfile.bio}`;
  const changed = state.profileKey !== nextProfileKey;
  const creatorChanged = !state.profile || state.profile.tiktokUrl !== nextProfile.tiktokUrl;
  const followerChanged = state.profile?.followers !== nextProfile.followers;
  state.profile = nextProfile;
  state.profileKey = nextProfileKey;

  if (changed) {
    state.statusText = "";
    state.statusKind = "";
    state.duplicate = false;
    clearAutoSkipTimer();
    if (creatorChanged) {
      checkDuplicate(nextProfile);
    }
  }

  render();
  if (creatorChanged || followerChanged) {
    maybeAutoSave();
    maybeAutoSkipOutOfRange();
  }
}

function detectProfile() {
  const match = location.pathname.match(/^\/@([^/?#]+)/);
  if (!match) return null;

  const username = match[1];
  const tiktokUrl = `https://www.tiktok.com/@${username}`;
  const videoId = location.pathname.match(/\/video\/(\d+)/)?.[1] || "";
  const fullName = findFullName(username);
  const followersText = findFollowersText(username);
  const followers = parseFollowers(followersText);
  const bio = findBioText(username);

  return {
    username,
    fullName,
    tiktokUrl,
    videoId,
    followers,
    followersKnown: Boolean(followersText),
    bio
  };
}

function findFullName(username) {
  const text = getTikTokPageText().replace(/\s+/g, " ");
  const usernamePattern = username
    .split(/[._-]+/)
    .filter(Boolean)
    .map(escapeRegex)
    .join("[\\s._-]+");
  const match = text.match(new RegExp(`([^\\n|]{2,80}?)\\s+@?${usernamePattern}\\s+\\d[\\d,]*(?:\\.\\d+)?\\s*[KMB]?\\s*Followers`, "i"));
  if (!match?.[1]) return username;
  return match[1].replace(/Creator|Comments|Related/gi, "").trim() || username;
}

function findFollowersText(username) {
  const exact = document.querySelector("[data-e2e='followers-count']");
  if (exact?.textContent?.trim()) return exact.textContent.trim();

  const visibleElementMatch = findVisibleFollowerElementText(username);
  if (visibleElementMatch) return visibleElementMatch;

  const pageText = getTikTokPageText();
  const visibleMatch = findVisibleFollowersForUsername(username, pageText);
  if (visibleMatch) return visibleMatch;

  const stateMatch = findFollowersInPageState(username);
  if (stateMatch) return stateMatch;

  const bodyMatch = bestFollowerCountFromText(pageText);
  if (bodyMatch) return bodyMatch;

  const candidates = [...document.querySelectorAll("strong, span, div")]
    .filter((node) => !host.contains(node) && isVisible(node))
    .map((node) => node.textContent?.trim() || "")
    .filter(Boolean);

  for (let index = 0; index < candidates.length; index += 1) {
    const inlineMatch = bestFollowerCountFromText(candidates[index]);
    if (inlineMatch) return inlineMatch;
    if (/^followers$/i.test(candidates[index + 1] || "")) return candidates[index];
  }

  return "";
}

function findVisibleFollowerElementText(username) {
  const normalizedUsername = normalizeToken(username);
  const usernameParts = String(username || "")
    .split(/[._-]+/)
    .map(normalizeToken)
    .filter(Boolean);
  const candidates = [...document.body.querySelectorAll("a, section, article, div, span, strong")]
    .filter((node) => !host.contains(node) && isVisible(node))
    .map((node) => ({
      node,
      rect: node.getBoundingClientRect(),
      text: String(node.innerText || node.textContent || "").replace(/\s+/g, " ").trim()
    }))
    .filter((item) => item.text.includes("Followers") && item.text.length <= 320)
    .map((item) => ({
      ...item,
      followers: bestFollowerCountFromText(item.text),
      normalizedText: normalizeToken(item.text)
    }))
    .filter((item) => item.followers);

  const usernameMatches = candidates
    .filter((item) => {
      if (item.normalizedText.includes(normalizedUsername)) return true;
      return usernameParts.length >= 2 && usernameParts.every((part) => item.normalizedText.includes(part.slice(0, 4)));
    })
    .sort(sortByCreatorPanelPosition);

  if (usernameMatches[0]) return usernameMatches[0].followers;

  const rightSideMatches = candidates
    .filter((item) => item.rect.left > window.innerWidth * 0.55)
    .sort(sortByCreatorPanelPosition);

  return rightSideMatches[0]?.followers || "";
}

function sortByCreatorPanelPosition(a, b) {
  return a.rect.top - b.rect.top || b.rect.left - a.rect.left || a.text.length - b.text.length;
}

function isVisible(node) {
  const rect = node.getBoundingClientRect();
  const style = window.getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function getTikTokPageText() {
  const previousDisplay = host.style.display;
  host.style.display = "none";
  const text = document.body?.innerText || "";
  host.style.display = previousDisplay;
  return text;
}

function findVisibleFollowersForUsername(username, pageText) {
  const normalizedText = String(pageText || "").replace(/\s+/g, " ");
  const usernamePattern = username
    .split(/[._-]+/)
    .filter(Boolean)
    .map(escapeRegex)
    .join("[\\s._-]+");
  const directPattern = new RegExp(`@?${usernamePattern}[\\s\\S]{0,140}?(\\d[\\d,]*(?:\\.\\d+)?\\s*[KMB]?)\\s*Followers\\b`, "i");
  const directMatch = normalizedText.match(directPattern);
  if (directMatch?.[1]) return directMatch[1];

  const usernameIndex = normalizedText.toLowerCase().indexOf(String(username || "").toLowerCase());
  if (usernameIndex === -1) return "";

  const nearbyText = normalizedText.slice(usernameIndex, usernameIndex + 180);
  return bestFollowerCountFromText(nearbyText);
}

function findFollowersInPageState(username) {
  const escapedUsername = escapeRegex(username);
  const patterns = [
    new RegExp(`"uniqueId"\\s*:\\s*"${escapedUsername}"[\\s\\S]{0,4000}?"followerCount"\\s*:\\s*(\\d+)`, "i"),
    new RegExp(`"id"\\s*:\\s*"${escapedUsername}"[\\s\\S]{0,4000}?"followerCount"\\s*:\\s*(\\d+)`, "i"),
    new RegExp(`"followerCount"\\s*:\\s*(\\d+)[\\s\\S]{0,4000}?"uniqueId"\\s*:\\s*"${escapedUsername}"`, "i")
  ];

  for (const script of document.scripts) {
    const text = script.textContent || "";
    if (!text.includes(username) || !text.includes("followerCount")) continue;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1];
    }
  }

  return "";
}

function bestFollowerCountFromText(text, options = {}) {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const matches = [...normalized.matchAll(/(\d[\d,]*(?:\.\d+)?\s*[KMB]?)\s*Followers\b/gi)];
  if (!matches.length) return "";

  const counts = matches.map((match) => match[1]);
  if (options.preferSmall) {
    return counts.sort((a, b) => parseFollowers(a) - parseFollowers(b))[0];
  }
  return counts[0];
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findBioText(username) {
  const direct = document.querySelector("[data-e2e='user-bio']");
  if (direct?.textContent?.trim()) return direct.textContent.trim();

  return "";
}

function parseFollowers(input) {
  const text = String(input || "").toLowerCase().replace(/,/g, "");
  const match = text.match(/(\d+(?:\.\d+)?)\s*([kmb])?/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const multiplier = { k: 1000, m: 1000000, b: 1000000000 }[match[2]] || 1;
  return Math.round(value * multiplier);
}

function isQualified() {
  if (!state.profile) return false;
  return state.profile.followers > state.settings.minFollowers && state.profile.followers < state.settings.maxFollowers;
}

async function checkDuplicate(profile) {
  const response = await sendMessage("GET_STATUS", { tiktokUrl: profile.tiktokUrl, username: profile.username });
  if (profile.tiktokUrl !== state.profile?.tiktokUrl) return;
  state.duplicate = Boolean(response.duplicate);
  if (state.duplicate) {
    state.statusText = "Already Saved";
    state.statusKind = "warn";
  }
  render();
}

async function saveCurrentLead() {
  if (!state.profile || !isQualified() || state.duplicate) return;

  saveButton.disabled = true;
  const payload = {
    ...state.profile,
    notes: notesInput.value.trim()
  };

  const response = await sendMessage("SAVE_LEAD", payload);
  if (response.ok || response.saved) {
    state.statusText = "Saved";
    state.statusKind = "success";
    state.duplicate = true;
    state.savedToday = response.savedToday || state.savedToday + 1;
    state.recentSaved = response.recentSaved || state.recentSaved;
    notesInput.value = "";
  } else if (response.duplicate || response.status === 409) {
    state.statusText = "Already Saved";
    state.statusKind = "warn";
    state.duplicate = true;
  } else {
    state.statusText = response.error || `Save failed${response.status ? ` (${response.status})` : ""}`;
    state.statusKind = "error";
  }
  render();
}

async function maybeAutoSave() {
  if (!state.settings.autoSave || !state.profile || !isQualified() || state.duplicate) return;
  if (state.autoSavedUrls.has(state.profile.tiktokUrl)) return;
  state.autoSavedUrls.add(state.profile.tiktokUrl);
  await saveCurrentLead();
}

function maybeAutoSkipOutOfRange() {
  if (state.settings.approvalMode) return;
  if (!state.settings.autoSkipOutOfRange || !state.profile || !state.profile.followersKnown) return;
  if (!isOutOfRange()) return;

  const key = `${state.profile.tiktokUrl}:${state.profile.videoId}:${state.profile.followers}`;
  if (state.lastAutoSkippedKey === key) return;

  state.lastAutoSkippedKey = key;
  state.statusText = `Auto skip: ${getOutOfRangeReason()}`;
  state.statusKind = "muted";
  renderNotice();

  clearAutoSkipTimer();
  state.autoSkipTimer = window.setTimeout(() => {
    if (!state.profile) return;
    const currentKey = `${state.profile.tiktokUrl}:${state.profile.videoId}:${state.profile.followers}`;
    if (currentKey !== key || !isOutOfRange()) return;
    goToNextVideo();
  }, 900);
}

function isOutOfRange() {
  if (!state.profile?.followersKnown) return false;
  return state.profile.followers <= state.settings.minFollowers || state.profile.followers >= state.settings.maxFollowers;
}

function getOutOfRangeReason() {
  if (!state.profile) return "not qualified";
  if (state.profile.followers <= state.settings.minFollowers) return `not above ${formatCount(state.settings.minFollowers)}`;
  if (state.profile.followers >= state.settings.maxFollowers) return `not below ${formatCount(state.settings.maxFollowers)}`;
  return "not qualified";
}

function clearAutoSkipTimer() {
  if (!state.autoSkipTimer) return;
  window.clearTimeout(state.autoSkipTimer);
  state.autoSkipTimer = null;
}

function goToNextVideo() {
  const nextButton = findNextVideoButton();
  if (nextButton) {
    nextButton.click();
    return;
  }

  document.dispatchEvent(new KeyboardEvent("keydown", {
    key: "ArrowDown",
    code: "ArrowDown",
    keyCode: 40,
    which: 40,
    bubbles: true,
    cancelable: true
  }));
  document.dispatchEvent(new KeyboardEvent("keyup", {
    key: "ArrowDown",
    code: "ArrowDown",
    keyCode: 40,
    which: 40,
    bubbles: true,
    cancelable: true
  }));
  window.dispatchEvent(new WheelEvent("wheel", { deltaY: 900, bubbles: true, cancelable: true }));
}

function findNextVideoButton() {
  const candidates = [...document.querySelectorAll("button, [role='button']")]
    .filter((node) => !host.contains(node) && isVisible(node))
    .map((node) => ({ node, rect: node.getBoundingClientRect(), label: getButtonLabel(node) }))
    .filter((item) => {
      if (/next|down|scroll/i.test(item.label)) return true;
      const centerX = item.rect.left + item.rect.width / 2;
      const centerY = item.rect.top + item.rect.height / 2;
      return item.rect.width >= 32 &&
        item.rect.width <= 76 &&
        item.rect.height >= 32 &&
        item.rect.height <= 76 &&
        centerX > window.innerWidth * 0.58 &&
        centerX < window.innerWidth * 0.84 &&
        centerY > window.innerHeight * 0.42 &&
        centerY < window.innerHeight * 0.68;
    })
    .sort((a, b) => {
      const aLabelScore = /next|down|scroll/i.test(a.label) ? 0 : 1;
      const bLabelScore = /next|down|scroll/i.test(b.label) ? 0 : 1;
      return aLabelScore - bLabelScore || b.rect.top - a.rect.top;
    });

  return candidates[0]?.node || null;
}

function getButtonLabel(node) {
  return [
    node.getAttribute("aria-label"),
    node.getAttribute("title"),
    node.textContent
  ].filter(Boolean).join(" ");
}

async function openNextReviewLink() {
  if (!hasApprovalSettings()) {
    state.reviewStatus = "Set Sheet URL, link column, and Gmail in extension settings.";
    state.reviewKind = "error";
    renderApproval();
    return;
  }

  setReviewBusy(true);
  state.reviewStatus = "Finding next link...";
  state.reviewKind = "muted";
  renderApproval();

  const response = await sendMessage("REVIEW_NEXT", approvalPayload());
  setReviewBusy(false);

  if (!response.ok) {
    state.reviewStatus = response.error || "Could not get next link.";
    state.reviewKind = "error";
    renderApproval();
    return;
  }

  state.reviewProgress = response;
  if (!response.item?.url) {
    state.reviewStatus = "No more links to review.";
    state.reviewKind = "success";
    renderApproval();
    return;
  }

  state.reviewStatus = `Opening row ${response.item.sourceRow}...`;
  state.reviewKind = "muted";
  renderApproval();
  location.assign(response.item.url);
}

async function recordReviewDecision(decision) {
  if (!hasApprovalSettings()) {
    state.reviewStatus = "Set approval settings first.";
    state.reviewKind = "error";
    renderApproval();
    return;
  }

  const url = currentReviewUrl();
  if (!url) {
    state.reviewStatus = "Open a TikTok link before approving or rejecting.";
    state.reviewKind = "error";
    renderApproval();
    return;
  }

  setReviewBusy(true);
  state.reviewStatus = `Saving ${decision.toLowerCase()}...`;
  state.reviewKind = "muted";
  renderApproval();

  const response = await sendMessage("REVIEW_DECISION", {
    ...approvalPayload(),
    url,
    decision,
    notes: notesInput.value.trim()
  });
  setReviewBusy(false);
  state.rejectConfirming = false;

  if (!response.ok) {
    state.reviewStatus = response.error || "Could not save review.";
    state.reviewKind = "error";
    renderApproval();
    return;
  }

  state.reviewProgress = response;
  notesInput.value = "";

  if (response.next?.url) {
    state.reviewStatus = `${decision} saved. Opening next...`;
    state.reviewKind = "success";
    renderApproval();
    location.assign(response.next.url);
    return;
  }

  state.reviewStatus = `${decision} saved. No more links.`;
  state.reviewKind = "success";
  renderApproval();
}

function approvalPayload() {
  return {
    spreadsheetUrl: state.settings.approvalSheetUrl,
    sourceSheetName: state.settings.approvalSourceSheet,
    linkColumn: state.settings.approvalLinkColumn,
    reviewerEmail: state.settings.reviewerEmail
  };
}

function hasApprovalSettings() {
  return Boolean(state.settings.approvalSheetUrl && state.settings.approvalLinkColumn && state.settings.reviewerEmail);
}

function currentReviewUrl() {
  if (/^\/@[^/?#]+/.test(location.pathname)) return location.href;
  return "";
}

function setReviewBusy(isBusy) {
  state.reviewBusy = isBusy;
}

async function refreshStats() {
  const response = await sendMessage("GET_STATS", {});
  if (response.ok) {
    state.savedToday = response.savedToday || 0;
    state.recentSaved = response.recentSaved || [];
  }
}

function render() {
  panel.classList.toggle("compact", Boolean(state.settings.compactMode));
  root.querySelector(".js-mode").textContent = state.settings.autoSave ? "Auto" : "Manual";
  root.querySelector(".js-daily-goal").textContent = state.settings.dailyGoal;
  root.querySelector(".js-saved-today").textContent = state.savedToday;

  if (!state.profile) {
    root.querySelector(".js-username").textContent = "-";
    root.querySelector(".js-followers").textContent = "-";
    root.querySelector(".js-qualified").textContent = "Open a profile";
    root.querySelector(".js-qualified").className = "js-qualified muted";
    root.querySelector(".js-bio").textContent = "";
    saveButton.disabled = true;
    renderRecent();
    renderNotice();
    renderApproval();
    return;
  }

  const qualified = isQualified();
  root.querySelector(".js-username").textContent = `@${state.profile.username}`;
  root.querySelector(".js-followers").textContent = formatCount(state.profile.followers);
  root.querySelector(".js-qualified").textContent = qualified ? "QUALIFIED" : "NOT QUALIFIED";
  root.querySelector(".js-qualified").className = `js-qualified ${qualified ? "good" : "bad"}`;
  root.querySelector(".js-bio").textContent = state.profile.bio || "";
  saveButton.disabled = !qualified || state.duplicate;
  renderRecent();
  renderNotice();
  renderApproval();
}

function renderApproval() {
  const approval = root.querySelector(".js-approval");
  approval.classList.toggle("hidden", !state.settings.approvalMode);
  if (!state.settings.approvalMode) return;

  root.querySelector(".js-reviewer").textContent = state.settings.reviewerEmail || "Set Gmail";
  root.querySelector(".js-review-progress").textContent = formatReviewProgress();

  const canDecide = Boolean(currentReviewUrl()) && hasApprovalSettings();
  approveButton.disabled = state.reviewBusy || !canDecide;
  rejectButton.disabled = state.reviewBusy || !canDecide;
  reviewNextButton.disabled = state.reviewBusy || !hasApprovalSettings();
  rejectYesButton.disabled = state.reviewBusy;
  rejectNoButton.disabled = state.reviewBusy;

  root.querySelector(".js-decision-row").classList.toggle("hidden", state.rejectConfirming);
  root.querySelector(".js-reject-confirm").classList.toggle("show", state.rejectConfirming);

  const notice = root.querySelector(".js-review-notice");
  notice.textContent = state.reviewStatus;
  notice.className = `notice js-review-notice ${state.reviewKind}`;
}

function formatReviewProgress() {
  if (!state.reviewProgress) return "-";
  const reviewed = state.reviewProgress.reviewed ?? 0;
  const total = state.reviewProgress.total ?? 0;
  return `${reviewed}/${total}`;
}

function renderNotice() {
  const notice = root.querySelector(".js-notice");
  const derived = getNoticeState();
  notice.textContent = derived.text;
  notice.className = `notice js-notice ${derived.kind}`;
}

function getNoticeState() {
  if (state.statusText) {
    return { text: state.statusText, kind: state.statusKind };
  }

  if (!state.profile) {
    return { text: "", kind: "" };
  }

  if (state.duplicate) {
    return { text: "Already Saved", kind: "warn" };
  }

  if (isQualified()) {
    return { text: "Ready to save", kind: "success" };
  }

  return { text: "Not qualified", kind: "error" };
}

function renderRecent() {
  const list = root.querySelector(".js-recent");
  list.innerHTML = "";
  for (const item of state.recentSaved.slice(0, 10)) {
    const li = document.createElement("li");
    li.textContent = item.username ? `@${item.username}` : item.tiktokUrl;
    list.appendChild(li);
  }
}

function formatCount(value) {
  if (!value) return "-";
  if (value >= 1000000) return `${trim(value / 1000000)}M`;
  if (value >= 1000) return `${trim(value / 1000)}K`;
  return String(value);
}

function trim(value) {
  return Number(value.toFixed(1)).toString();
}

async function getSettings() {
  const response = await sendMessage("GET_SETTINGS", {});
  return response.settings || DEFAULT_SETTINGS;
}

function sendMessage(type, payload) {
  return chrome.runtime.sendMessage({ type, payload }).catch((error) => ({ ok: false, error: error.message }));
}

function overlayCss() {
  return `
    :host { all: initial; color-scheme: dark; }
    .panel {
      position: fixed;
      top: 96px;
      right: 18px;
      width: 292px;
      z-index: 2147483647;
      background: #111318;
      color: #f6f7f9;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 8px;
      box-shadow: 0 18px 60px rgba(0,0,0,.38);
      font: 13px/1.4 Inter, system-ui, -apple-system, Segoe UI, sans-serif;
      overflow: hidden;
    }
    .drag {
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: move;
      padding: 10px 12px;
      background: #191c23;
      border-bottom: 1px solid rgba(255,255,255,.1);
      user-select: none;
    }
    strong { font-weight: 700; letter-spacing: 0; }
    .subtle { display:block; color:#9aa3af; font-size:11px; margin-top:2px; }
    .icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,.14);
      background: #222630;
      color: #f6f7f9;
      cursor: pointer;
    }
    .body { padding: 12px; }
    .line {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 8px;
    }
    .line span { color: #aeb6c2; }
    .line strong { text-align:right; overflow-wrap:anywhere; }
    .good { color: #4ade80; }
    .bad { color: #fb7185; }
    .muted { color: #aeb6c2; }
    .bio {
      max-height: 70px;
      overflow: auto;
      margin: 8px 0 10px;
      color: #d5dae1;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .note { display:block; margin-bottom:10px; color:#aeb6c2; }
    .note span { display:block; margin-bottom:4px; }
    textarea {
      width: 100%;
      box-sizing: border-box;
      resize: vertical;
      min-height: 48px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,.16);
      background: #0d0f14;
      color: #f6f7f9;
      padding: 8px;
      font: inherit;
    }
    .goal { padding-top: 2px; }
    .save {
      width: 100%;
      height: 38px;
      border: 0;
      border-radius: 6px;
      background: #18a058;
      color: white;
      font-weight: 800;
      letter-spacing: 0;
      cursor: pointer;
    }
    .save:disabled { background: #39404b; color: #8d96a3; cursor: not-allowed; }
    .notice { min-height: 18px; margin-top:8px; font-weight:700; }
    .notice.success { color:#4ade80; }
    .notice.warn { color:#fbbf24; }
    .notice.error { color:#fb7185; }
    .notice.muted { color:#aeb6c2; }
    .recent { margin-top:6px; color:#aeb6c2; }
    summary { cursor:pointer; }
    ol { margin:6px 0 0; padding-left:20px; color:#d5dae1; }
    li { margin:2px 0; overflow-wrap:anywhere; }
    .approval {
      margin-top: 10px;
      border-top: 1px solid rgba(255,255,255,.12);
      padding-top: 10px;
    }
    .approval.hidden, .hidden { display: none; }
    .approval-title {
      margin-bottom: 8px;
      color: #f6f7f9;
      font-weight: 800;
    }
    .review-next {
      width: 100%;
      height: 34px;
      border: 0;
      border-radius: 6px;
      background: #2563eb;
      color: white;
      font-weight: 800;
      cursor: pointer;
    }
    .decision-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 8px;
    }
    .approve, .reject, .reject-yes, .reject-no {
      height: 34px;
      border: 0;
      border-radius: 6px;
      color: white;
      font-weight: 800;
      cursor: pointer;
    }
    .approve { background: #18a058; }
    .reject, .reject-yes { background: #e11d48; }
    .reject-no { background: #39404b; }
    .reject-confirm {
      display: none;
      margin-top: 8px;
      border: 1px solid rgba(251,113,133,.32);
      border-radius: 6px;
      padding: 8px;
      background: rgba(251,113,133,.08);
    }
    .reject-confirm.show { display: block; }
    .reject-confirm > div {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 8px;
    }
    button:disabled {
      background: #39404b;
      color: #8d96a3;
      cursor: not-allowed;
    }
    .compact { width: 210px; }
    .compact .bio, .compact .note, .compact .goal, .compact .recent, .compact .notice, .compact .approval { display:none; }
    .compact .body { padding: 10px; }
    .compact .line { margin-bottom: 6px; }
  `;
}
