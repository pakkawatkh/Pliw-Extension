(() => {
  if (window.__PLIW_GEO_INJECTED__) return;
  window.__PLIW_GEO_INJECTED__ = true;

  const MSG_SOURCE = "PLIW_GEO_BRIDGE";

  const state = {
    initialized: false,
    enabled: false,
    lat: 13.7563,
    lng: 100.5018,
    accuracy: 15,
    jitter: true
  };

  const pendingCalls = [];
  const watchers = new Map();
  let nextWatchId = 900001;

  const originalGeo = navigator.geolocation;
  const origGetCurrent = originalGeo ? originalGeo.getCurrentPosition.bind(originalGeo) : null;
  const origWatchPos = originalGeo ? originalGeo.watchPosition.bind(originalGeo) : null;
  const origClearWatch = originalGeo ? originalGeo.clearWatch.bind(originalGeo) : null;

  function buildSpoofedPosition() {
    let lat = Number(state.lat) || 0;
    let lng = Number(state.lng) || 0;

    if (state.jitter) {
      // Realistic ~2-4 meter GPS micro-drift
      const latOffset = (Math.random() - 0.5) * 0.00004;
      const lngOffset = (Math.random() - 0.5) * 0.00004;
      lat += latOffset;
      lng += lngOffset;
    }

    const coords = {
      latitude: lat,
      longitude: lng,
      accuracy: Math.max(1, Number(state.accuracy) || 15),
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null
    };

    return {
      coords,
      timestamp: Date.now()
    };
  }

  function dispatchWatchers() {
    if (!state.enabled) return;
    watchers.forEach((entry) => {
      if (typeof entry.success === "function") {
        try {
          entry.success(buildSpoofedPosition());
        } catch (_) {}
      }
    });
  }

  function flushPendingCalls() {
    while (pendingCalls.length > 0) {
      const call = pendingCalls.shift();
      if (call.type === "get") {
        executeGetCurrent(call.success, call.error, call.options);
      } else if (call.type === "watch") {
        executeWatch(call.watchId, call.success, call.error, call.options);
      }
    }
  }

  function executeGetCurrent(success, error, options) {
    if (state.enabled) {
      if (typeof success === "function") {
        setTimeout(() => success(buildSpoofedPosition()), 12);
      }
      return;
    }
    if (origGetCurrent) {
      origGetCurrent(success, error, options);
    }
  }

  function executeWatch(watchId, success, error, options) {
    const entry = watchers.get(watchId);
    if (!entry) return;

    if (state.enabled) {
      if (typeof success === "function") {
        setTimeout(() => {
          if (watchers.has(watchId)) {
            success(buildSpoofedPosition());
          }
        }, 12);
      }
      return;
    }

    if (origWatchPos) {
      entry.nativeId = origWatchPos(success, error, options);
    }
  }

  // Fallback timeout so early calls never hang if bridge is delayed
  setTimeout(() => {
    if (!state.initialized) {
      state.initialized = true;
      flushPendingCalls();
    }
  }, 160);

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== MSG_SOURCE) {
      return;
    }

    const cfg = event.data.payload;
    if (!cfg) return;

    const wasInitialized = state.initialized;
    const prevEnabled = state.enabled;
    const coordsChanged = state.lat !== cfg.lat || state.lng !== cfg.lng;

    state.initialized = true;
    state.enabled = Boolean(cfg.enabled);
    if (typeof cfg.lat === "number" && !Number.isNaN(cfg.lat)) state.lat = cfg.lat;
    if (typeof cfg.lng === "number" && !Number.isNaN(cfg.lng)) state.lng = cfg.lng;
    if (typeof cfg.accuracy === "number" && !Number.isNaN(cfg.accuracy)) state.accuracy = cfg.accuracy;
    if (typeof cfg.jitter === "boolean") state.jitter = cfg.jitter;

    if (!wasInitialized) {
      flushPendingCalls();
    } else if (state.enabled && (coordsChanged || !prevEnabled)) {
      dispatchWatchers();
    }
  });

  if (originalGeo) {
    const spoofedGetCurrent = function getCurrentPosition(success, error, options) {
      if (!state.initialized) {
        pendingCalls.push({ type: "get", success, error, options });
        return;
      }
      executeGetCurrent(success, error, options);
    };

    const spoofedWatchPosition = function watchPosition(success, error, options) {
      const watchId = nextWatchId++;
      watchers.set(watchId, { success, error, options, nativeId: null });

      if (!state.initialized) {
        pendingCalls.push({ type: "watch", watchId, success, error, options });
        return watchId;
      }
      executeWatch(watchId, success, error, options);
      return watchId;
    };

    const spoofedClearWatch = function clearWatch(id) {
      const entry = watchers.get(id);
      if (entry) {
        if (entry.nativeId !== null && origClearWatch) {
          origClearWatch(entry.nativeId);
        }
        watchers.delete(id);
      } else if (origClearWatch) {
        origClearWatch(id);
      }
    };

    try {
      Object.defineProperty(originalGeo, "getCurrentPosition", {
        value: spoofedGetCurrent,
        configurable: true
      });
      Object.defineProperty(originalGeo, "watchPosition", {
        value: spoofedWatchPosition,
        configurable: true
      });
      Object.defineProperty(originalGeo, "clearWatch", {
        value: spoofedClearWatch,
        configurable: true
      });
    } catch (_) {
      originalGeo.getCurrentPosition = spoofedGetCurrent;
      originalGeo.watchPosition = spoofedWatchPosition;
      originalGeo.clearWatch = spoofedClearWatch;
    }
  }

  // Override Permissions API so sites see geolocation as granted when spoofing is active
  if (navigator.permissions && typeof navigator.permissions.query === "function") {
    const origPermQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function query(desc) {
      if (desc && desc.name === "geolocation" && state.enabled) {
        return Promise.resolve({
          name: "geolocation",
          state: "granted",
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() { return false; }
        });
      }
      return origPermQuery(desc);
    };
  }
})();
