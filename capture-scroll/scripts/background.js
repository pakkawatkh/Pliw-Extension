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
        console.warn(`[Capture Scroll] Quota hit, backing off (attempt ${attempt + 1}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, 800 + (attempt * 300)));
      } else {
        throw err;
      }
    }
  }
}

// 3. Ensure content script is injected in active tab
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

// 3. Full-page capture & canvas stitching engine
async function performFullPageCapture(tabId) {
  try {
    await ensureContentScript(tabId);

    // Get metrics from tab
    const metrics = await chrome.tabs.sendMessage(tabId, { action: 'INIT_CAPTURE_METRICS' });
    if (!metrics || !metrics.success) {
      throw new Error('Unable to read page dimensions.');
    }

    const { viewportWidth, viewportHeight, scrollHeight, dpr, totalSteps, title } = metrics;
    const slices = [];

    // Notify popup of progress start
    chrome.runtime.sendMessage({
      action: 'CAPTURE_PROGRESS',
      step: 0,
      totalSteps,
      status: `Starting capture (1/${totalSteps})...`
    }).catch(() => {});

    // Loop through each slice
    for (let i = 0; i < totalSteps; i++) {
      let scrollY = i * viewportHeight;

      // Handle the last slice: prevent overscrolling past bottom
      if (scrollY + viewportHeight > scrollHeight) {
        scrollY = Math.max(0, scrollHeight - viewportHeight);
      }

      // 1. Tell page to scroll
      await chrome.tabs.sendMessage(tabId, {
        action: 'SCROLL_TO_POSITION',
        y: scrollY,
        stepIndex: i
      });

      // 2. Capture viewport (using rate-limited safe capture)
      const dataUrl = await safeCaptureVisibleTab(null);
      slices.push({
        y: scrollY,
        dataUrl,
        isLast: i === totalSteps - 1
      });

      // 3. Report progress
      chrome.runtime.sendMessage({
        action: 'CAPTURE_PROGRESS',
        step: i + 1,
        totalSteps,
        status: `Captured section ${i + 1} of ${totalSteps}...`
      }).catch(() => {});
    }

    // Restore page scroll and fixed elements
    await chrome.tabs.sendMessage(tabId, { action: 'RESTORE_PAGE' }).catch(() => {});

    // 4. Stitch onto high-DPI OffscreenCanvas
    const physicalWidth = Math.round(viewportWidth * dpr);
    const physicalHeight = Math.round(scrollHeight * dpr);

    const canvas = new OffscreenCanvas(physicalWidth, physicalHeight);
    const ctx = canvas.getContext('2d');

    // Draw each slice at its physical coordinate
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      const blob = await (await fetch(slice.dataUrl)).blob();
      const bitmap = await createImageBitmap(blob);

      const destY = Math.round(slice.y * dpr);
      ctx.drawImage(bitmap, 0, destY);
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
    await chrome.tabs.create({ url: previewUrl });

  } catch (err) {
    console.error('Full page capture failed:', err);
    chrome.runtime.sendMessage({
      action: 'CAPTURE_ERROR',
      error: err.message || 'Capture failed'
    }).catch(() => {});
    // Attempt cleanup
    chrome.tabs.sendMessage(tabId, { action: 'RESTORE_PAGE' }).catch(() => {});
  }
}

// 4. Visible viewport capture
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
    await chrome.tabs.create({ url: previewUrl });
  } catch (err) {
    console.error('Visible capture failed:', err);
    chrome.runtime.sendMessage({
      action: 'CAPTURE_ERROR',
      error: err.message || 'Capture failed'
    }).catch(() => {});
  }
}

// 5. Message & Command Router
chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.action === 'START_FULL_CAPTURE') {
    performFullPageCapture(request.tabId);
  } else if (request.action === 'START_VISIBLE_CAPTURE') {
    performVisibleCapture(request.tabId);
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
