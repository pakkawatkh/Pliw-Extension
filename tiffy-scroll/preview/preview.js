// preview/preview.js - Interactive Studio Controller

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

async function getScreenshotFromDB(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const getReq = tx.objectStore(STORE_NAME).get(id);
    getReq.onsuccess = () => resolve(getReq.result);
    getReq.onerror = () => reject(getReq.error);
  });
}

async function deleteScreenshotFromDB(id) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    return;
  }
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create image blob'));
      }
    }, 'image/png');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const captureId = urlParams.get('id');

  const mainCanvas = document.getElementById('main-canvas');
  const imageWrapper = document.getElementById('image-wrapper');
  const workspace = document.getElementById('workspace');

  const badgeTitle = document.getElementById('badge-title');
  const badgeDims = document.getElementById('badge-dims');

  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnFitWidth = document.getElementById('btn-fit-width');
  const btnActualSize = document.getElementById('btn-actual-size');
  const zoomLevelText = document.getElementById('zoom-level');

  const btnCropToggle = document.getElementById('btn-crop-toggle');
  const btnResetCrop = document.getElementById('btn-reset-crop');
  const btnCopyClipboard = document.getElementById('btn-copy-clipboard');
  const btnCopyLabel = document.getElementById('btn-copy-label');
  const btnCopyToggleMenu = document.getElementById('btn-copy-toggle-menu');
  const copyMenu = document.getElementById('copy-menu');
  const badgeFullResolution = document.getElementById('badge-full-resolution');
  const btnDownloadPng = document.getElementById('btn-download-png');

  let currentCopyScale = 1.0;
  let currentCustomWidth = null;

  const cropActionBar = document.getElementById('crop-action-bar');
  const cropDimsVal = document.getElementById('crop-dims');
  const btnApplyCrop = document.getElementById('btn-apply-crop');
  const btnCancelCrop = document.getElementById('btn-cancel-crop');
  const cropOverlay = document.getElementById('crop-overlay');
  const cropBox = document.getElementById('crop-box');

  const toast = document.getElementById('toast');
  const toastIcon = document.getElementById('toast-icon');
  const toastMessage = document.getElementById('toast-message');
  let toastTimer = null;

  let originalImage = null;
  let currentCropCoords = null;
  let cropper = null;
  let zoomPercent = 100;
  let pageTitle = 'Screenshot';

  function showToast(msg, icon = '✅', duration = 3000) {
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    if (toastIcon) {
      toastIcon.textContent = icon;
    }
    toastMessage.textContent = msg;
    toast.classList.remove('hidden');
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
      toastTimer = null;
    }, duration);
  }

  // 1. Fetch screenshot from IndexedDB
  if (!captureId) {
    badgeTitle.textContent = 'No screenshot specified';
    return;
  }

  const record = await getScreenshotFromDB(captureId).catch(err => {
    console.error('Failed to load screenshot from DB:', err);
    return null;
  });

  if (!record || !record.dataUrl) {
    badgeTitle.textContent = 'Screenshot not found or expired';
    return;
  }

  pageTitle = record.title || 'Screenshot';
  badgeTitle.textContent = pageTitle;
  document.title = `${pageTitle} • Tiffy Scroll Studio`;

  // 2. Load into image & canvas
  const img = new Image();
  img.onload = () => {
    originalImage = img;
    drawCanvas(img);
    fitToWidth();
    if (record.downscaled) {
      showToast('Very tall page was auto-scaled to stay within browser canvas limits.', 'ℹ️', 4500);
    }
  };
  img.src = record.dataUrl;

  function drawCanvas(sourceImg) {
    mainCanvas.width = sourceImg.width;
    mainCanvas.height = sourceImg.height;
    const ctx = mainCanvas.getContext('2d');
    ctx.drawImage(sourceImg, 0, 0);

    badgeDims.textContent = `${sourceImg.width} × ${sourceImg.height} px`;
    if (badgeFullResolution) {
      badgeFullResolution.textContent = `${sourceImg.width}px`;
    }
  }

  // 3. Zoom Handlers (always based on current mainCanvas dimensions, including after crop)
  function applyZoom(pct) {
    if (!mainCanvas.width || !mainCanvas.height) return;

    const prevW = imageWrapper.clientWidth;
    const prevH = imageWrapper.clientHeight;

    zoomPercent = Math.max(10, Math.min(300, Math.round(pct)));
    zoomLevelText.textContent = `${zoomPercent}%`;

    const baseWidth = mainCanvas.width;
    const targetWidth = Math.max(1, Math.round((baseWidth * zoomPercent) / 100));
    const targetHeight = Math.max(1, Math.round((mainCanvas.height / mainCanvas.width) * targetWidth));
    imageWrapper.style.width = `${targetWidth}px`;

    if (cropper && cropper.active && prevW > 0 && prevH > 0) {
      cropper.rescale(prevW, prevH, targetWidth, targetHeight);
    }
  }

  function fitToWidth() {
    if (!mainCanvas.width) return;
    btnFitWidth.classList.add('active');
    btnActualSize.classList.remove('active');

    const availableWidth = Math.max(200, workspace.clientWidth - 80);
    const scale = (availableWidth / mainCanvas.width) * 100;
    applyZoom(Math.min(100, scale));
  }

  function actualSize() {
    btnFitWidth.classList.remove('active');
    btnActualSize.classList.add('active');
    applyZoom(100);
  }

  btnFitWidth.addEventListener('click', fitToWidth);
  btnActualSize.addEventListener('click', actualSize);

  btnZoomIn.addEventListener('click', () => {
    btnFitWidth.classList.remove('active');
    btnActualSize.classList.remove('active');
    applyZoom(zoomPercent + 15);
  });

  btnZoomOut.addEventListener('click', () => {
    btnFitWidth.classList.remove('active');
    btnActualSize.classList.remove('active');
    applyZoom(zoomPercent - 15);
  });

  // 4. Cropping Engine
  cropper = new CropperEngine(cropOverlay, cropBox, imageWrapper, (coords) => {
    currentCropCoords = coords;
    if (!imageWrapper.clientWidth || !imageWrapper.clientHeight) return;
    const scaleX = mainCanvas.width / imageWrapper.clientWidth;
    const scaleY = mainCanvas.height / imageWrapper.clientHeight;
    const realW = Math.round(coords.displayWidth * scaleX);
    const realH = Math.round(coords.displayHeight * scaleY);
    cropDimsVal.textContent = `${realW} × ${realH} px`;
  });

  function applyActiveCrop() {
    if (!currentCropCoords || currentCropCoords.displayWidth < 10 || currentCropCoords.displayHeight < 10) {
      showToast('Please select a crop area first.', '⚠️', 3000);
      return;
    }

    const scaleX = mainCanvas.width / imageWrapper.clientWidth;
    const scaleY = mainCanvas.height / imageWrapper.clientHeight;

    const cropX = Math.max(0, Math.round(currentCropCoords.displayX * scaleX));
    const cropY = Math.max(0, Math.round(currentCropCoords.displayY * scaleY));
    const cropW = Math.max(1, Math.min(mainCanvas.width - cropX, Math.round(currentCropCoords.displayWidth * scaleX)));
    const cropH = Math.max(1, Math.min(mainCanvas.height - cropY, Math.round(currentCropCoords.displayHeight * scaleY)));

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(mainCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    mainCanvas.width = cropW;
    mainCanvas.height = cropH;
    const mainCtx = mainCanvas.getContext('2d');
    mainCtx.drawImage(tempCanvas, 0, 0);

    cropper.stop();
    cropActionBar.classList.add('hidden');
    btnResetCrop.classList.remove('hidden');
    badgeDims.textContent = `${cropW} × ${cropH} px (Cropped)`;
    if (badgeFullResolution) {
      badgeFullResolution.textContent = `${cropW}px`;
    }

    fitToWidth();
    showToast('Image cropped successfully!', '✂️');
  }

  function cancelCrop() {
    cropper.stop();
    cropActionBar.classList.add('hidden');
  }

  btnCropToggle.addEventListener('click', () => {
    cropActionBar.classList.remove('hidden');
    cropper.start();
  });

  btnCancelCrop.addEventListener('click', cancelCrop);
  btnApplyCrop.addEventListener('click', applyActiveCrop);

  btnResetCrop.addEventListener('click', () => {
    if (originalImage) {
      if (cropper.active) cancelCrop();
      drawCanvas(originalImage);
      btnResetCrop.classList.add('hidden');
      fitToWidth();
      showToast('Restored original full screenshot', '↩️');
    }
  });

  // 5. Copy to Clipboard (Full Resolution & Resized Options)
  async function copyImageToClipboard(scaleFactor = 1.0, customWidth = null) {
    try {
      let targetWidth, targetHeight;

      if (customWidth) {
        targetWidth = Math.max(50, Math.round(customWidth));
        targetHeight = Math.max(1, Math.round((mainCanvas.height / mainCanvas.width) * targetWidth));
      } else {
        targetWidth = Math.max(1, Math.round(mainCanvas.width * scaleFactor));
        targetHeight = Math.max(1, Math.round(mainCanvas.height * scaleFactor));
      }

      let sourceCanvas = mainCanvas;
      if (targetWidth !== mainCanvas.width || targetHeight !== mainCanvas.height) {
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = targetWidth;
        scaledCanvas.height = targetHeight;
        const sCtx = scaledCanvas.getContext('2d');
        sCtx.imageSmoothingEnabled = true;
        sCtx.imageSmoothingQuality = 'high';
        sCtx.drawImage(mainCanvas, 0, 0, targetWidth, targetHeight);
        sourceCanvas = scaledCanvas;
      }

      const blob = await canvasToPngBlob(sourceCanvas);

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);

      const sizeKb = Math.round(blob.size / 1024);
      const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
      const label = scaleFactor === 1.0 && !customWidth ? 'Full Resolution' : `Resized ${targetWidth}px`;
      showToast(`Copied ${label} (${targetWidth}×${targetHeight}px • ${sizeStr})! Ready to paste (⌘V)`, '✅');
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      showToast('Copy failed: Permission denied or tab not focused', '❌', 4000);
    }
  }

  // Main copy button: copies using currently selected scale
  btnCopyClipboard.addEventListener('click', () => {
    copyImageToClipboard(currentCopyScale, currentCustomWidth);
  });

  // Toggle resolution dropdown menu
  btnCopyToggleMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    copyMenu.classList.toggle('hidden');
  });

  // Close dropdown menu when clicking anywhere else
  document.addEventListener('click', (e) => {
    if (!copyMenu.contains(e.target) && e.target !== btnCopyToggleMenu) {
      copyMenu.classList.add('hidden');
    }
  });

  // Dropdown options
  const copyMenuItems = copyMenu.querySelectorAll('.menu-item');

  function setActiveMenuItem(activeEl, labelText, scale, customW = null) {
    copyMenuItems.forEach(item => item.classList.remove('active'));
    activeEl.classList.add('active');
    currentCopyScale = scale;
    currentCustomWidth = customW;
    btnCopyLabel.textContent = labelText;
    copyMenu.classList.add('hidden');
  }

  document.getElementById('opt-copy-full').addEventListener('click', (e) => {
    e.stopPropagation();
    setActiveMenuItem(e.currentTarget, 'Copy (Full)', 1.0, null);
    copyImageToClipboard(1.0, null);
  });

  document.getElementById('opt-copy-50').addEventListener('click', (e) => {
    e.stopPropagation();
    setActiveMenuItem(e.currentTarget, 'Copy (50%)', 0.5, null);
    copyImageToClipboard(0.5, null);
  });

  document.getElementById('opt-copy-30').addEventListener('click', (e) => {
    e.stopPropagation();
    setActiveMenuItem(e.currentTarget, 'Copy (30%)', 0.3, null);
    copyImageToClipboard(0.3, null);
  });

  document.getElementById('opt-copy-custom').addEventListener('click', (e) => {
    e.stopPropagation();
    copyMenu.classList.add('hidden');
    const input = prompt('Enter target width in pixels (e.g. 1080, 1200, 800):', '1080');
    if (input) {
      const parsedW = parseInt(input, 10);
      if (!isNaN(parsedW) && parsedW >= 50) {
        setActiveMenuItem(e.currentTarget, `Copy (${parsedW}px)`, null, parsedW);
        copyImageToClipboard(null, parsedW);
      } else {
        showToast('Please enter a valid width of at least 50px.', '⚠️', 3000);
      }
    }
  });

  // 6. Download PNG
  btnDownloadPng.addEventListener('click', async () => {
    try {
      const blob = await canvasToPngBlob(mainCanvas);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      const cleanTitle = pageTitle.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      a.download = `Capture_${cleanTitle}_${timestamp}.png`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Screenshot downloaded', '💾');
    } catch (err) {
      console.error('Download failed:', err);
      showToast('Failed to export PNG image', '❌', 3500);
    }
  });

  // 7. Studio Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!copyMenu.classList.contains('hidden')) {
        copyMenu.classList.add('hidden');
      } else if (cropper && cropper.active) {
        cancelCrop();
      }
    } else if (e.key === 'Enter' && cropper && cropper.active) {
      e.preventDefault();
      applyActiveCrop();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && !window.getSelection().toString()) {
      e.preventDefault();
      copyImageToClipboard(currentCopyScale, currentCustomWidth);
    }
  });

  // 8. Auto-cleanup: destroy temporary screenshot from IndexedDB when tab is closed
  window.addEventListener('beforeunload', () => {
    if (captureId) {
      deleteScreenshotFromDB(captureId);
    }
  });

  window.addEventListener('pagehide', () => {
    if (captureId) {
      deleteScreenshotFromDB(captureId);
    }
  });
});
