const DEFAULT_SETTINGS = {
  enableSlowLoadingOverlay: true,
  enableOfflineRedirect: true,
  loadingDelayMs: 2500
};

const loadingTimers = new Map();

function shouldHandleUrl(url) {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

function sanitizeDelay(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.loadingDelayMs;
  return Math.max(500, Math.min(12000, Math.round(n)));
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    enableSlowLoadingOverlay: Boolean(stored.enableSlowLoadingOverlay),
    enableOfflineRedirect: Boolean(stored.enableOfflineRedirect),
    loadingDelayMs: sanitizeDelay(stored.loadingDelayMs)
  };
}

async function ensureDefaults() {
  const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set({
    enableSlowLoadingOverlay: current.enableSlowLoadingOverlay,
    enableOfflineRedirect: current.enableOfflineRedirect,
    loadingDelayMs: sanitizeDelay(current.loadingDelayMs)
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureDefaults();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureDefaults();
});

chrome.action.onClicked.addListener(() => {
  const gameUrl = chrome.runtime.getURL("game.html");
  chrome.tabs.create({ url: gameUrl });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!shouldHandleUrl(tab?.url)) return;

  if (changeInfo.status === "loading") {
    const timer = loadingTimers.get(tabId);
    if (timer) clearTimeout(timer);

    void getSettings().then((settings) => {
      if (!settings.enableSlowLoadingOverlay) return;

      const newTimer = setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { type: "SHOW_RUNNER_OVERLAY", reason: "slow-loading" }, () => {
          void chrome.runtime.lastError;
        });
        loadingTimers.delete(tabId);
      }, settings.loadingDelayMs);

      loadingTimers.set(tabId, newTimer);
    });
  }

  if (changeInfo.status === "complete") {
    const timer = loadingTimers.get(tabId);
    if (timer) {
      clearTimeout(timer);
      loadingTimers.delete(tabId);
    }

    chrome.tabs.sendMessage(tabId, { type: "HIDE_RUNNER_OVERLAY", reason: "loaded" }, () => {
      void chrome.runtime.lastError;
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const timer = loadingTimers.get(tabId);
  if (!timer) return;
  clearTimeout(timer);
  loadingTimers.delete(tabId);
});

chrome.webNavigation.onErrorOccurred.addListener((details) => {
  if (details.frameId !== 0) return;

  const networkError = [
    "net::ERR_INTERNET_DISCONNECTED",
    "net::ERR_NAME_NOT_RESOLVED",
    "net::ERR_CONNECTION_TIMED_OUT",
    "net::ERR_CONNECTION_RESET",
    "net::ERR_NETWORK_CHANGED"
  ].includes(details.error);

  if (!networkError) return;

  void getSettings().then((settings) => {
    if (!settings.enableOfflineRedirect) return;

    const gameUrl = chrome.runtime.getURL("game.html") + "?mode=offline";
    chrome.tabs.update(details.tabId, { url: gameUrl }, () => {
      void chrome.runtime.lastError;
    });
  });
}, { url: [{ schemes: ["http", "https"] }] });
