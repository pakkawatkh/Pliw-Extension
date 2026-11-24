const STORAGE_KEY = "pliwGeoConfig";

const DEFAULT_CONFIG = {
  enabled: false,
  lat: 13.7563,
  lng: 100.5018,
  accuracy: 15,
  jitter: true,
  label: "Bangkok, Thailand"
};

function updateBadge(enabled) {
  if (enabled) {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
    chrome.action.setBadgeTextColor({ color: "#ffffff" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    if (!res[STORAGE_KEY]) {
      chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_CONFIG });
      updateBadge(false);
    } else {
      updateBadge(Boolean(res[STORAGE_KEY].enabled));
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    updateBadge(Boolean(res[STORAGE_KEY] && res[STORAGE_KEY].enabled));
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEY]) {
    const next = changes[STORAGE_KEY].newValue || {};
    updateBadge(Boolean(next.enabled));
  }
});
