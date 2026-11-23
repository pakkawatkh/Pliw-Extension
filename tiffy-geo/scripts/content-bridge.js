(() => {
  const MSG_SOURCE = "TIFFY_GEO_BRIDGE";
  const STORAGE_KEY = "tiffyGeoConfig";

  const DEFAULT_CONFIG = {
    enabled: false,
    lat: 13.7563,
    lng: 100.5018,
    accuracy: 15,
    jitter: true
  };

  function broadcastConfig(config) {
    const payload = Object.assign({}, DEFAULT_CONFIG, config || {});
    window.postMessage(
      {
        source: MSG_SOURCE,
        payload
      },
      "*"
    );
  }

  chrome.storage.local.get([STORAGE_KEY], (result) => {
    broadcastConfig(result[STORAGE_KEY]);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[STORAGE_KEY]) {
      broadcastConfig(changes[STORAGE_KEY].newValue);
    }
  });
})();
