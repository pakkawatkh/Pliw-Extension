(() => {
  const STORAGE_KEY = "tiffyGeoConfig";
  const FAVS_KEY = "tiffyGeoFavorites";

  const BUILTIN_PRESETS = [
    { name: "Bangkok", lat: 13.7563, lng: 100.5018 },
    { name: "Tokyo", lat: 35.6762, lng: 139.6503 },
    { name: "Singapore", lat: 1.3521, lng: 103.8198 },
    { name: "London", lat: 51.5074, lng: -0.1278 },
    { name: "New York", lat: 40.7128, lng: -74.006 }
  ];

  // Storage adapter (supports Chrome Extension storage + localStorage fallback for standalone testing)
  const storage = {
    get(keys, cb) {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(keys, cb);
      } else {
        const out = {};
        keys.forEach((k) => {
          try {
            out[k] = JSON.parse(localStorage.getItem(k));
          } catch (_) {}
        });
        cb(out);
      }
    },
    set(obj) {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(obj);
      } else {
        Object.entries(obj).forEach(([k, v]) => {
          localStorage.setItem(k, JSON.stringify(v));
        });
      }
    }
  };

  // State
  let config = {
    enabled: false,
    lat: 13.7563,
    lng: 100.5018,
    accuracy: 15,
    jitter: true,
    label: "Bangkok"
  };
  let favorites = [];

  // Map View State (Web Mercator)
  let viewLat = config.lat;
  let viewLng = config.lng;
  let zoom = 12;

  // DOM
  const toggleEnabled = document.getElementById("toggle-enabled");
  const statusPill = document.getElementById("status-pill");
  const searchForm = document.getElementById("search-form");
  const searchInput = document.getElementById("search-input");
  const searchFeedback = document.getElementById("search-feedback");
  const mapViewport = document.getElementById("map-viewport");
  const mapTiles = document.getElementById("map-tiles");
  const mapPin = document.getElementById("map-pin");
  const latInput = document.getElementById("lat-input");
  const lngInput = document.getElementById("lng-input");
  const accuracyInput = document.getElementById("accuracy-input");
  const jitterToggle = document.getElementById("jitter-toggle");
  const saveFavBtn = document.getElementById("save-fav-btn");
  const nudgeStep = document.getElementById("nudge-step");
  const presetChips = document.getElementById("preset-chips");

  // --- Web Mercator Projection Helpers ---
  function latLngToWorldPx(lat, lng, z) {
    const scale = 256 * Math.pow(2, z);
    const x = ((lng + 180) / 360) * scale;
    const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const sinLat = Math.sin((clampedLat * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
    return { x, y };
  }

  function worldPxToLatLng(x, y, z) {
    const scale = 256 * Math.pow(2, z);
    const lng = (x / scale) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / scale;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return {
      lat: Math.max(-85.0511, Math.min(85.0511, lat)),
      lng: ((lng + 540) % 360) - 180
    };
  }

  // --- Render Interactive Tile Map (Persistent DOM Cache, Zero Flicker) ---
  const activeTiles = new Map();

  function renderMap() {
    const rect = mapViewport.getBoundingClientRect();
    const w = rect.width || 352;
    const h = rect.height || 196;

    const centerPx = latLngToWorldPx(viewLat, viewLng, zoom);
    const topLeftX = centerPx.x - w / 2;
    const topLeftY = centerPx.y - h / 2;

    // 1-tile buffer around viewport for seamless dragging
    const minTileX = Math.floor(topLeftX / 256) - 1;
    const maxTileX = Math.floor((topLeftX + w) / 256) + 1;
    const minTileY = Math.floor(topLeftY / 256) - 1;
    const maxTileY = Math.floor((topLeftY + h) / 256) + 1;
    const maxTiles = Math.pow(2, zoom);

    const neededKeys = new Set();

    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        if (ty < 0 || ty >= maxTiles) continue;
        const wrappedX = ((tx % maxTiles) + maxTiles) % maxTiles;
        const key = `${zoom}/${tx}/${ty}`;
        neededKeys.add(key);

        let img = activeTiles.get(key);
        if (!img) {
          img = document.createElement("img");
          img.className = "map-tile";
          img.decoding = "async";
          img.src = `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png`;
          img.alt = "";
          mapTiles.appendChild(img);
          activeTiles.set(key, img);
        }

        const px = Math.round(tx * 256 - topLeftX);
        const py = Math.round(ty * 256 - topLeftY);
        img.style.transform = `translate3d(${px}px, ${py}px, 0)`;
      }
    }

    // Prune tiles outside viewport buffer or from previous zoom level
    for (const [key, img] of activeTiles.entries()) {
      if (!neededKeys.has(key)) {
        img.remove();
        activeTiles.delete(key);
      }
    }

    // Position pin
    const pinPx = latLngToWorldPx(config.lat, config.lng, zoom);
    const pinScreenX = pinPx.x - topLeftX;
    const pinScreenY = pinPx.y - topLeftY;
    mapPin.style.left = `${pinScreenX}px`;
    mapPin.style.top = `${pinScreenY}px`;
  }

  // --- Sync UI & Persist ---
  function saveConfig() {
    storage.set({ [STORAGE_KEY]: config });
  }

  function updateUI(recenter = false) {
    toggleEnabled.checked = Boolean(config.enabled);
    statusPill.textContent = config.enabled ? "Spoofing Active" : "Real Location";
    statusPill.classList.toggle("is-active", Boolean(config.enabled));

    latInput.value = Number(config.lat).toFixed(6);
    lngInput.value = Number(config.lng).toFixed(6);
    accuracyInput.value = config.accuracy;
    jitterToggle.checked = Boolean(config.jitter);

    if (recenter) {
      viewLat = config.lat;
      viewLng = config.lng;
    }
    renderMap();
  }

  function setCoordinates(lat, lng, label = "", recenter = false) {
    config.lat = Math.max(-85.05, Math.min(85.05, Number(lat)));
    config.lng = Math.max(-180, Math.min(180, Number(lng)));
    if (label) config.label = label;
    saveConfig();
    updateUI(recenter);
  }

  // --- Map Interactions (Drag to Pan / Click to Pin / Wheel to Zoom) ---
  let isDragging = false;
  let moved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let startCenterPx = null;

  mapViewport.addEventListener("pointerdown", (e) => {
    isDragging = true;
    moved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startCenterPx = latLngToWorldPx(viewLat, viewLng, zoom);
    mapViewport.setPointerCapture(e.pointerId);
  });

  mapViewport.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.hypot(dx, dy) > 4) moved = true;
    if (moved) {
      const next = worldPxToLatLng(startCenterPx.x - dx, startCenterPx.y - dy, zoom);
      viewLat = next.lat;
      viewLng = next.lng;
      renderMap();
    }
  });

  mapViewport.addEventListener("pointerup", (e) => {
    if (!isDragging) return;
    isDragging = false;
    if (!moved) {
      const rect = mapViewport.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const centerPx = latLngToWorldPx(viewLat, viewLng, zoom);
      const worldX = centerPx.x - rect.width / 2 + clickX;
      const worldY = centerPx.y - rect.height / 2 + clickY;
      const ll = worldPxToLatLng(worldX, worldY, zoom);
      setCoordinates(ll.lat, ll.lng, "Pinned Location", false);
    }
  });

  mapViewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    const nextZoom = Math.max(2, Math.min(18, zoom + (e.deltaY < 0 ? 1 : -1)));
    if (nextZoom !== zoom) {
      zoom = nextZoom;
      renderMap();
    }
  }, { passive: false });

  document.getElementById("zoom-in").addEventListener("click", () => {
    zoom = Math.min(18, zoom + 1);
    renderMap();
  });

  document.getElementById("zoom-out").addEventListener("click", () => {
    zoom = Math.max(2, zoom - 1);
    renderMap();
  });

  document.getElementById("center-pin").addEventListener("click", () => {
    viewLat = config.lat;
    viewLng = config.lng;
    renderMap();
  });

  // --- Controls ---
  toggleEnabled.addEventListener("change", () => {
    config.enabled = toggleEnabled.checked;
    saveConfig();
    updateUI(false);
  });

  function onManualCoordChange() {
    const lat = parseFloat(latInput.value);
    const lng = parseFloat(lngInput.value);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      setCoordinates(lat, lng, "Custom", true);
    }
  }
  latInput.addEventListener("change", onManualCoordChange);
  lngInput.addEventListener("change", onManualCoordChange);

  accuracyInput.addEventListener("change", () => {
    config.accuracy = Math.max(1, parseInt(accuracyInput.value, 10) || 15);
    saveConfig();
  });

  jitterToggle.addEventListener("change", () => {
    config.jitter = jitterToggle.checked;
    saveConfig();
  });

  // --- Search Place or Direct "lat, lng" ---
  searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;

    searchFeedback.className = "search-feedback";

    // Check direct coordinate paste: "13.7563, 100.5018"
    const coordMatch = q.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        zoom = Math.max(zoom, 13);
        setCoordinates(lat, lng, q, true);
        searchFeedback.textContent = `Moved to ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        return;
      }
    }

    searchFeedback.textContent = "Searching...";
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const hit = data[0];
        zoom = 13;
        setCoordinates(parseFloat(hit.lat), parseFloat(hit.lon), hit.display_name.split(",")[0], true);
        searchFeedback.textContent = `Pinned: ${hit.display_name.split(",").slice(0, 2).join(", ")}`;
      } else {
        searchFeedback.className = "search-feedback error";
        searchFeedback.textContent = "Place not found. Try another query or paste lat, lng.";
      }
    } catch (_) {
      searchFeedback.className = "search-feedback error";
      searchFeedback.textContent = "Search unavailable offline. Paste lat, lng or click map.";
    }
  });

  // --- Live Nudge Movement ---
  document.querySelectorAll(".nudge-pad button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const meters = Number(nudgeStep.value) || 100;
      const dLat = meters / 111320;
      const dLng = meters / (111320 * Math.cos((config.lat * Math.PI) / 180) || 1);
      const dir = btn.dataset.dir;
      let nextLat = config.lat;
      let nextLng = config.lng;
      if (dir === "N") nextLat += dLat;
      if (dir === "S") nextLat -= dLat;
      if (dir === "E") nextLng += dLng;
      if (dir === "W") nextLng -= dLng;
      setCoordinates(nextLat, nextLng, "", true);
    });
  });

  // --- Presets & Favorites ---
  function renderChips() {
    presetChips.innerHTML = "";
    const all = [
      ...BUILTIN_PRESETS.map((p) => ({ ...p, custom: false })),
      ...favorites.map((f, idx) => ({ ...f, custom: true, idx }))
    ];

    all.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = item.custom ? `★ ${item.name}` : item.name;
      chip.addEventListener("click", () => {
        zoom = 12;
        setCoordinates(item.lat, item.lng, item.name, true);
      });

      if (item.custom) {
        const del = document.createElement("span");
        del.className = "chip-del";
        del.textContent = "×";
        del.title = "Remove favorite";
        del.addEventListener("click", (ev) => {
          ev.stopPropagation();
          favorites.splice(item.idx, 1);
          storage.set({ [FAVS_KEY]: favorites });
          renderChips();
        });
        chip.appendChild(del);
      }

      presetChips.appendChild(chip);
    });
  }

  saveFavBtn.addEventListener("click", () => {
    const defaultName = config.label || `${config.lat.toFixed(3)}, ${config.lng.toFixed(3)}`;
    const name = prompt("Name this favorite location:", defaultName);
    if (!name || !name.trim()) return;
    favorites.push({
      name: name.trim().slice(0, 24),
      lat: config.lat,
      lng: config.lng
    });
    storage.set({ [FAVS_KEY]: favorites });
    renderChips();
  });

  // --- Initialize ---
  storage.get([STORAGE_KEY, FAVS_KEY], (res) => {
    if (res[STORAGE_KEY]) {
      config = Object.assign(config, res[STORAGE_KEY]);
    }
    if (Array.isArray(res[FAVS_KEY])) {
      favorites = res[FAVS_KEY];
    }
    renderChips();
    updateUI(true);
  });
})();
