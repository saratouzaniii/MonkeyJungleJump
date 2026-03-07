const DEFAULT_SETTINGS = {
  enableSlowLoadingOverlay: true,
  enableOfflineRedirect: true,
  loadingDelayMs: 2500
};

function sanitizeDelay(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.loadingDelayMs;
  return Math.max(500, Math.min(12000, Math.round(n)));
}

async function loadSettings() {
  const data = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  document.getElementById("enableSlowLoadingOverlay").checked = Boolean(data.enableSlowLoadingOverlay);
  document.getElementById("enableOfflineRedirect").checked = Boolean(data.enableOfflineRedirect);
  document.getElementById("loadingDelayMs").value = sanitizeDelay(data.loadingDelayMs);
}

async function saveSettings() {
  const payload = {
    enableSlowLoadingOverlay: document.getElementById("enableSlowLoadingOverlay").checked,
    enableOfflineRedirect: document.getElementById("enableOfflineRedirect").checked,
    loadingDelayMs: sanitizeDelay(document.getElementById("loadingDelayMs").value)
  };

  await chrome.storage.sync.set(payload);

  const status = document.getElementById("status");
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 1500);
}

document.getElementById("saveBtn").addEventListener("click", () => {
  void saveSettings();
});

void loadSettings();
