// scripts/background.js - Service Worker Coordinator & Canvas Stitcher

// 1. IndexedDB storage helper for large stitched screenshots
const DB_NAME = 'PliwCaptureScrollDB';
const DB_VERSION = 1;
const STORE_NAME = 'screenshots';
const PREVIEW_TAB_KEY_PREFIX = 'preview_tab_';
const MAX_CANVAS_DIMENSION = 24000;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveScreenshot(id, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ id, ...data, timestamp: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteScreenshot(id) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {}
}

async function cleanupOldScreenshots() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (!cursor.value.timestamp || cursor.value.timestamp < oneHourAgo) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch (err) {}
}

// Track preview tab ID -> capture ID in chrome.storage.session so it survives MV3 Service Worker restarts
const previewTabFallbackMap = new Map();

async function registerPreviewTab(tabId, captureId) {
  previewTabFallbackMap.set(tabId, captureId);
  try {
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.set({ [`${PREVIEW_TAB_KEY_PREFIX}${tabId}`]: captureId });
    }
  } catch (err) {}
}

async function popPreviewTabCaptureId(tabId) {
  let captureId = previewTabFallbackMap.get(tabId) || null;
  previewTabFallbackMap.delete(tabId);
  try {
    if (chrome.storage && chrome.storage.session) {
      const key = `${PREVIEW_TAB_KEY_PREFIX}${tabId}`;
      const res = await chrome.storage.session.get(key);
      if (res && res[key]) {
        captureId = res[key];
      }
      await chrome.storage.session.remove(key);
    }
  } catch (err) {}
  return captureId;
}

chrome.tabs.onRemoved.addListener((tabId) => {
  popPreviewTabCaptureId(tabId)
    .then((captureId) => {
      if (captureId) {
        return deleteScreenshot(captureId);
      }
    })
    .catch(() => {});
});

// Run garbage cleanup on extension start
cleanupOldScreenshots();

function isRestrictedUrl(url) {
  if (!url) return true;
  const restrictedPrefixes = [
    'chrome://',
    'brave://',
    'edge://',
    'chrome-extension://',
    'devtools://',
    'about:',
    'view-source:',
    'https://chromewebstore.google.com',
    'https://chrome.google.com/webstore'
  ];
  return restrictedPrefixes.some((prefix) => url.startsWith(prefix));
}

// 2. Rate-limiting helper to strictly respect Chromium's MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota
let lastCaptureTimestamp = 0;
const MIN_CAPTURE_INTERVAL_MS = 650; // Chromium limit is 2 calls/sec (500ms). 650ms guarantees 100% safety.

async function safeCaptureVisibleTab(windowId = null, retries = 4) {
  const now = Date.now();
  const elapsed = now - lastCaptureTimestamp;
  if (elapsed < MIN_CAPTURE_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_CAPTURE_INTERVAL_MS - elapsed));
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      lastCaptureTimestamp = Date.now();
      return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    } catch (err) {
      const isQuotaError = err.message && (
        err.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND') ||
        err.message.includes('quota')
      );
      if (isQuotaError && attempt < retries) {
        console.warn(`[Pliw Scroll] Quota hit, backing off (attempt ${attempt + 1}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, 800 + (attempt * 300)));
      } else {
        throw err;
      }
    }
  }
}

// Ensure target tab is still active in its window before capturing its pixels
async function getVerifiedCaptureWindowId(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab) {
    throw new Error('Target tab was closed during capture.');
  }
  if (!tab.active) {
    throw new Error('Capture stopped because you switched to another tab.');
  }
  return tab.windowId;
}

// 3. Capture state flags for preventing overlap and handling stop/cancel
let isCapturing = false;
let shouldStopEarly = false;
let shouldCancel = false;

// 4. Ensure content script is injected in active tab without side effects
async function ensureContentScript(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
    if (res && res.success) return true;
  } catch (err) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['scripts/content.js']
    });
    await new Promise(r => setTimeout(r, 100));
  }
  return true;
}

// 5. Full-page capture & canvas stitching engine
async function performFullPageCapture(tabId) {
  if (isCapturing) {
    chrome.runtime.sendMessage({
      action: 'CAPTURE_ERROR',
      error: 'A capture is already in progress.'
    }).catch(() => {});
    return;
  }

  isCapturing = true;
  shouldStopEarly = false;
  shouldCancel = false;
  let injected = false;

  try {
    const initialTab = await chrome.tabs.get(tabId);
    if (!initialTab || isRestrictedUrl(initialTab.url)) {
      throw new Error('Chromium security prevents capturing internal or restricted browser pages.');
    }

    await ensureContentScript(tabId);
    injected = true;

    // Get metrics from tab
    const metrics = await chrome.tabs.sendMessage(tabId, { action: 'INIT_CAPTURE_METRICS' });
    if (!metrics || !metrics.success) {
      throw new Error('Unable to read page dimensions.');
    }

    const { viewportWidth, viewportHeight, dpr, title } = metrics;
    let scrollHeight = metrics.scrollHeight;
    const maxSteps = Math.min(60, Math.max(1, Math.ceil(scrollHeight / viewportHeight) + 5));

    const sliceDrawInstructions = [];
    let canvasDrawnHeight = 0;
    let currentActualY = 0;

    const initialTotalSteps = Math.max(1, Math.ceil(scrollHeight / viewportHeight));
    chrome.runtime.sendMessage({
      action: 'CAPTURE_PROGRESS',
      step: 0,
      totalSteps: initialTotalSteps,
      status: `Starting capture (1/${initialTotalSteps})...`
    }).catch(() => {});

    // --- STEP 0: Slice 0 (Initial top of the page with natural headers & sidebars) ---
    const step0Res = await chrome.tabs.sendMessage(tabId, {
      action: 'SCROLL_TO_POSITION',
      y: 0,
      stepIndex: 0
    });

    await chrome.tabs.sendMessage(tabId, { action: 'HIDE_BANNER' }).catch(() => {});
    const step0WindowId = await getVerifiedCaptureWindowId(tabId);
    const firstDataUrl = await safeCaptureVisibleTab(step0WindowId);
    await chrome.tabs.sendMessage(tabId, { action: 'SHOW_BANNER' }).catch(() => {});

    sliceDrawInstructions.push({
      dataUrl: firstDataUrl,
      sourceY: 0,
      sourceHeight: viewportHeight,
      destY: 0,
      destHeight: viewportHeight
    });
    canvasDrawnHeight = viewportHeight;
    currentActualY = (step0Res && typeof step0Res.actualY === 'number') ? step0Res.actualY : 0;
    if (step0Res && step0Res.scrollHeight) {
      scrollHeight = step0Res.scrollHeight;
    }

    chrome.runtime.sendMessage({
      action: 'CAPTURE_PROGRESS',
      step: 1,
      totalSteps: Math.max(1, Math.ceil(scrollHeight / viewportHeight)),
      status: `Captured section 1...`
    }).catch(() => {});

    // --- SUBSEQUENT STEPS: Delta-scroll through remaining content ---
    let step = 1;
    while (step < maxSteps) {
      if (shouldCancel) {
        throw new Error('Capture cancelled by user.');
      }
      if (shouldStopEarly) {
        console.log('[Pliw Scroll] Stop early requested by user at step', step);
        break;
      }

      if (canvasDrawnHeight >= scrollHeight) {
        break;
      }

      let targetY = currentActualY + viewportHeight;
      if (targetY + viewportHeight > scrollHeight) {
        targetY = Math.max(0, scrollHeight - viewportHeight);
      }

      if (targetY <= currentActualY) {
        break;
      }

      await chrome.tabs.sendMessage(tabId, {
        action: 'UPDATE_FLOATING_BANNER',
        step: step + 1,
        totalSteps: Math.max(step + 1, Math.ceil(scrollHeight / viewportHeight))
      }).catch(() => {});

      const scrollRes = await chrome.tabs.sendMessage(tabId, {
        action: 'SCROLL_TO_POSITION',
        y: targetY,
        stepIndex: step
      });

      const newActualY = (scrollRes && typeof scrollRes.actualY === 'number')
        ? scrollRes.actualY
        : targetY;

      if (scrollRes && scrollRes.scrollHeight && scrollRes.scrollHeight > scrollHeight) {
        scrollHeight = scrollRes.scrollHeight;
      }

      const deltaY = newActualY - currentActualY;
      if (deltaY <= 0) {
        break;
      }

      // Capture visible tab from the verified target window
      await chrome.tabs.sendMessage(tabId, { action: 'HIDE_BANNER' }).catch(() => {});
      const stepWindowId = await getVerifiedCaptureWindowId(tabId);
      const sliceDataUrl = await safeCaptureVisibleTab(stepWindowId);
      await chrome.tabs.sendMessage(tabId, { action: 'SHOW_BANNER' }).catch(() => {});

      const sourceY = Math.max(0, viewportHeight - deltaY);
      const sourceHeight = Math.min(deltaY, viewportHeight);

      sliceDrawInstructions.push({
        dataUrl: sliceDataUrl,
        sourceY,
        sourceHeight,
        destY: canvasDrawnHeight,
        destHeight: sourceHeight
      });

      canvasDrawnHeight += sourceHeight;
      currentActualY = newActualY;

      chrome.runtime.sendMessage({
        action: 'CAPTURE_PROGRESS',
        step: step + 1,
        totalSteps: Math.max(step + 1, Math.ceil(scrollHeight / viewportHeight)),
        status: `Captured section ${step + 1}...`
      }).catch(() => {});

      if (newActualY + viewportHeight >= scrollHeight) {
        break;
      }

      step++;
    }

    if (shouldCancel) {
      throw new Error('Capture cancelled by user.');
    }

    // --- RENDER SEAMLESS HIGH-DPI CANVAS ---
    // Inspect first slice bitmap to get exact physical pixel dimensions (avoids 1-2px zoom/DPR rounding drift)
    const firstBlob = await (await fetch(sliceDrawInstructions[0].dataUrl)).blob();
    const firstBitmap = await createImageBitmap(firstBlob);
    const actualBitmapWidth = firstBitmap.width;
    const actualBitmapHeight = firstBitmap.height;
    const scaleY = actualBitmapHeight / viewportHeight;

    const rawPhysicalWidth = actualBitmapWidth;
    const rawPhysicalHeight = Math.round(canvasDrawnHeight * scaleY);

    // Guard Chromium canvas dimension ceiling so ultra-long Retina pages never render blank or crash
    const outputScale = Math.min(
      1,
      MAX_CANVAS_DIMENSION / rawPhysicalWidth,
      MAX_CANVAS_DIMENSION / rawPhysicalHeight
    );
    const physicalWidth = Math.max(1, Math.round(rawPhysicalWidth * outputScale));
    const physicalHeight = Math.max(1, Math.round(rawPhysicalHeight * outputScale));

    const canvas = new OffscreenCanvas(physicalWidth, physicalHeight);
    const ctx = canvas.getContext('2d');
    if (outputScale < 1) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }

    for (let i = 0; i < sliceDrawInstructions.length; i++) {
      const inst = sliceDrawInstructions[i];
      const bitmap = i === 0
        ? firstBitmap
        : await createImageBitmap(await (await fetch(inst.dataUrl)).blob());

      try {
        const sX = 0;
        const sY = Math.min(bitmap.height, Math.round(inst.sourceY * scaleY));
        const sW = bitmap.width;
        const sH = Math.min(bitmap.height - sY, Math.round(inst.sourceHeight * scaleY));

        const dX = 0;
        const dY = Math.round(inst.destY * scaleY * outputScale);
        const dW = physicalWidth;
        const dH = Math.round(inst.destHeight * scaleY * outputScale);

        if (sH > 0 && dH > 0) {
          ctx.drawImage(bitmap, sX, sY, sW, sH, dX, dY, dW, dH);
        }
      } finally {
        bitmap.close();
      }
    }

    // Convert stitched canvas to Blob & DataURL
    const finalBlob = await canvas.convertToBlob({ type: 'image/png' });
    const finalDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Failed to encode screenshot.'));
      reader.readAsDataURL(finalBlob);
    });

    // Save to IndexedDB
    const captureId = `capture_${Date.now()}`;
    await saveScreenshot(captureId, {
      dataUrl: finalDataUrl,
      width: physicalWidth,
      height: physicalHeight,
      dpr,
      downscaled: outputScale < 1,
      title: title || 'Full Page Screenshot',
      type: 'full-page'
    });

    chrome.runtime.sendMessage({ action: 'CAPTURE_COMPLETE' }).catch(() => {});

    const previewUrl = chrome.runtime.getURL(`preview/preview.html?id=${captureId}`);
    const previewTab = await chrome.tabs.create({ url: previewUrl });
    if (previewTab && previewTab.id) {
      await registerPreviewTab(previewTab.id, captureId);
    }

  } catch (err) {
    console.error('Full page capture stopped/failed:', err);
    if (err.message && err.message.includes('cancelled')) {
      chrome.runtime.sendMessage({ action: 'CAPTURE_CANCELLED' }).catch(() => {});
    } else {
      chrome.runtime.sendMessage({
        action: 'CAPTURE_ERROR',
        error: err.message || 'Capture failed'
      }).catch(() => {});
    }
  } finally {
    if (injected) {
      await chrome.tabs.sendMessage(tabId, { action: 'RESTORE_PAGE' }).catch(() => {});
    }
    isCapturing = false;
  }
}

// 6. Visible viewport capture
async function performVisibleCapture(tabId) {
  if (isCapturing) {
    chrome.runtime.sendMessage({
      action: 'CAPTURE_ERROR',
      error: 'A capture is already in progress.'
    }).catch(() => {});
    return;
  }

  isCapturing = true;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || isRestrictedUrl(tab.url)) {
      throw new Error('Chromium security prevents capturing internal or restricted browser pages.');
    }

    const dataUrl = await safeCaptureVisibleTab(tab.windowId);

    const captureId = `capture_${Date.now()}`;
    await saveScreenshot(captureId, {
      dataUrl,
      title: tab.title || 'Visible Screenshot',
      type: 'visible'
    });

    chrome.runtime.sendMessage({ action: 'CAPTURE_COMPLETE' }).catch(() => {});

    const previewUrl = chrome.runtime.getURL(`preview/preview.html?id=${captureId}`);
    const previewTab = await chrome.tabs.create({ url: previewUrl });
    if (previewTab && previewTab.id) {
      await registerPreviewTab(previewTab.id, captureId);
    }
  } catch (err) {
    console.error('Visible capture failed:', err);
    chrome.runtime.sendMessage({
      action: 'CAPTURE_ERROR',
      error: err.message || 'Capture failed'
    }).catch(() => {});
  } finally {
    isCapturing = false;
  }
}

// 7. Message & Command Router
chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.action === 'START_FULL_CAPTURE') {
    performFullPageCapture(request.tabId);
  } else if (request.action === 'START_VISIBLE_CAPTURE') {
    performVisibleCapture(request.tabId);
  } else if (request.action === 'STOP_CAPTURE') {
    shouldStopEarly = true;
  } else if (request.action === 'CANCEL_CAPTURE') {
    shouldCancel = true;
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'capture-full-page') {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id && !isRestrictedUrl(activeTab.url)) {
      performFullPageCapture(activeTab.id);
    }
  }
});
