// scripts/background.js - Service Worker Coordinator & Canvas Stitcher

// 1. IndexedDB storage helper for large stitched screenshots
const DB_NAME = 'TiffyCaptureScrollDB';
const DB_VERSION = 1;
const STORE_NAME = 'screenshots';

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

// Map tracking preview tab ID to capture ID for instant auto-destruction on close
const previewTabMap = new Map(); // tabId -> captureId

chrome.tabs.onRemoved.addListener((tabId) => {
  if (previewTabMap.has(tabId)) {
    const captureId = previewTabMap.get(tabId);
    previewTabMap.delete(tabId);
    deleteScreenshot(captureId).catch(() => {});
  }
});

// Run garbage cleanup on extension start
cleanupOldScreenshots();

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
        console.warn(`[Tiffy Scroll] Quota hit, backing off (attempt ${attempt + 1}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, 800 + (attempt * 300)));
      } else {
        throw err;
      }
    }
  }
}

// 3. Capture state flags for stopping or cancelling early
let shouldStopEarly = false;
let shouldCancel = false;

// 4. Ensure content script is injected in active tab
async function ensureContentScript(tabId) {
  try {
    // Try pinging
    const res = await chrome.tabs.sendMessage(tabId, { action: 'INIT_CAPTURE_METRICS' });
    if (res && res.success) return true;
  } catch (err) {
    // Content script not yet present, inject it dynamically
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['scripts/content.js']
    });
    // Wait brief moment for initialization
    await new Promise(r => setTimeout(r, 100));
  }
  return true;
}

// 4. Full-page capture & canvas stitching engine
async function performFullPageCapture(tabId) {
  shouldStopEarly = false;
  shouldCancel = false;

  try {
    await ensureContentScript(tabId);

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

    // Notify popup of progress start
    chrome.runtime.sendMessage({
      action: 'CAPTURE_PROGRESS',
      step: 0,
      totalSteps: Math.ceil(scrollHeight / viewportHeight),
      status: `Starting capture (1/${Math.ceil(scrollHeight / viewportHeight)})...`
    }).catch(() => {});

    // --- STEP 0: Slice 0 (Initial top of the page with natural headers & sidebars) ---
    const step0Res = await chrome.tabs.sendMessage(tabId, {
      action: 'SCROLL_TO_POSITION',
      y: 0,
      stepIndex: 0
    });

    await chrome.tabs.sendMessage(tabId, { action: 'HIDE_BANNER' }).catch(() => {});
    const firstDataUrl = await safeCaptureVisibleTab(null);
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
      totalSteps: Math.ceil(scrollHeight / viewportHeight),
      status: `Captured section 1...`
    }).catch(() => {});

    // --- SUBSEQUENT STEPS: Delta-scroll through remaining content ---
    let step = 1;
    while (step < maxSteps) {
      if (shouldCancel) {
        throw new Error('Capture cancelled by user.');
      }
      if (shouldStopEarly) {
        console.log('[Tiffy Scroll] Stop early requested by user at step', step);
        break;
      }

      // Check if we already reached or exceeded the document bottom
      if (canvasDrawnHeight >= scrollHeight) {
        break;
      }

      // Compute next target scroll position
      let targetY = currentActualY + viewportHeight;
      if (targetY + viewportHeight > scrollHeight) {
        targetY = Math.max(0, scrollHeight - viewportHeight);
      }

      // If target cannot advance, stop
      if (targetY <= currentActualY) {
        break;
      }

      // Update floating banner
      await chrome.tabs.sendMessage(tabId, {
        action: 'UPDATE_FLOATING_BANNER',
        step: step + 1,
        totalSteps: Math.max(step + 1, Math.ceil(scrollHeight / viewportHeight))
      }).catch(() => {});

      // Scroll and hide fixed/sticky elements
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
        // Could not scroll further
        break;
      }

      // Capture visible tab
      await chrome.tabs.sendMessage(tabId, { action: 'HIDE_BANNER' }).catch(() => {});
      const sliceDataUrl = await safeCaptureVisibleTab(null);
      await chrome.tabs.sendMessage(tabId, { action: 'SHOW_BANNER' }).catch(() => {});

      // DELTA STITCHING:
      // The new pixels revealed by scrolling down by deltaY are at the bottom of the viewport
      const sourceY = Math.max(0, viewportHeight - deltaY);
      const sourceHeight = Math.min(deltaY, viewportHeight);

      sliceDrawInstructions.push({
        dataUrl: sliceDataUrl,
        sourceY: sourceY,
        sourceHeight: sourceHeight,
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

      // Check if we hit the bottom of the document
      if (newActualY + viewportHeight >= scrollHeight) {
        break;
      }

      step++;
    }

    // --- RENDER SEAMLESS HIGH-DPI CANVAS ---
    const physicalWidth = Math.round(viewportWidth * dpr);
    const physicalHeight = Math.round(canvasDrawnHeight * dpr);

    const canvas = new OffscreenCanvas(physicalWidth, physicalHeight);
    const ctx = canvas.getContext('2d');

    for (const inst of sliceDrawInstructions) {
      const blob = await (await fetch(inst.dataUrl)).blob();
      const bitmap = await createImageBitmap(blob);

      const sX = 0;
      const sY = Math.round(inst.sourceY * dpr);
      const sW = physicalWidth;
      const sH = Math.round(inst.sourceHeight * dpr);

      const dX = 0;
      const dY = Math.round(inst.destY * dpr);
      const dW = physicalWidth;
      const dH = Math.round(inst.destHeight * dpr);

      ctx.drawImage(bitmap, sX, sY, sW, sH, dX, dY, dW, dH);
    }

    // Convert stitched canvas to Blob
    const finalBlob = await canvas.convertToBlob({ type: 'image/png' });
    const reader = new FileReader();
    const finalDataUrl = await new Promise((resolve) => {
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(finalBlob);
    });

    // Save to IndexedDB
    const captureId = `capture_${Date.now()}`;
    await saveScreenshot(captureId, {
      dataUrl: finalDataUrl,
      width: physicalWidth,
      height: physicalHeight,
      dpr,
      title: title || 'Full Page Screenshot',
      type: 'full-page'
    });

    // Notify complete
    chrome.runtime.sendMessage({ action: 'CAPTURE_COMPLETE' }).catch(() => {});

    // Open Preview Studio in new tab
    const previewUrl = chrome.runtime.getURL(`preview/preview.html?id=${captureId}`);
    const previewTab = await chrome.tabs.create({ url: previewUrl });
    if (previewTab && previewTab.id) {
      previewTabMap.set(previewTab.id, captureId);
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
    // Guaranteed cleanup: restore scroll position, unhide fixed elements, and remove banner
    await chrome.tabs.sendMessage(tabId, { action: 'RESTORE_PAGE' }).catch(() => {});
  }
}

// 5. Visible viewport capture
async function performVisibleCapture(tabId) {
  try {
    const dataUrl = await safeCaptureVisibleTab(null);
    const tab = await chrome.tabs.get(tabId);

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
      previewTabMap.set(previewTab.id, captureId);
    }
  } catch (err) {
    console.error('Visible capture failed:', err);
    chrome.runtime.sendMessage({
      action: 'CAPTURE_ERROR',
      error: err.message || 'Capture failed'
    }).catch(() => {});
  }
}

// 6. Message & Command Router
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
    if (activeTab && activeTab.id) {
      performFullPageCapture(activeTab.id);
    }
  }
});
