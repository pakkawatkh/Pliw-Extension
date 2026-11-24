// preview/preview.js - Interactive Studio Controller

const DB_NAME = 'PliwCaptureScrollDB';
const DB_VERSION = 1;
const STORE_NAME = 'screenshots';
const LANG_STORAGE_KEY = 'pliwScrollLang';

const I18N = {
  en: {
    fitWidth: 'Fit Width',
    actualSize: '100% Size',
    drawBtn: 'Draw',
    cropBtn: 'Crop',
    resetBtn: 'Reset',
    copyBtn: 'Copy',
    copyResolutionHeader: 'Copy Resolution',
    copyFullTitle: '📋 100% Full Resolution',
    copyFullDesc: 'Original high-DPI quality',
    copy50Title: '⚡ 50% Optimized Scale',
    copy50Desc: 'Ideal for Slack, Teams, Jira & Chat',
    copy30Title: '📱 30% Compact Scale',
    copy30Desc: 'Super lightweight & fast sharing',
    copyCustomTitle: '⚙️ Custom Width...',
    copyCustomDesc: 'Specify exact width (e.g. 1080px, 1200px)',
    downloadBtn: 'Download PNG',
    doneBtn: '✓ Done',
    cropSelection: 'Crop Selection:',
    applyCropBtn: '✓ Apply Crop',
    cancelBtn: '✕ Cancel',
    toolPen: 'Freehand Pen (1)',
    toolHighlighter: 'Highlighter (2)',
    toolArrow: 'Arrow (3)',
    toolRect: 'Rectangle (4)',
    toolEllipse: 'Ellipse (5)',
    toolLine: 'Line (6)',
    toolText: 'Text (7)',
    toolBlur: 'Pixelate / Blur (8)',
    toolEraser: 'Eraser (9)',
    customColor: 'Custom Color',
    undoTitle: 'Undo (⌘Z)',
    redoTitle: 'Redo (⌘⇧Z)',
    clearTitle: 'Clear All Drawings',
    toastDownscaled: 'Very tall page was auto-scaled to stay within browser canvas limits.',
    toastSelectCrop: 'Please select a crop area first.',
    toastCropped: 'Image cropped successfully!',
    toastRestored: 'Restored original full screenshot',
    toastCleared: 'Cleared all drawings',
    toastCopied: (label, w, h, sizeStr) => `Copied ${label} (${w}×${h}px • ${sizeStr})! Ready to paste (⌘V)`,
    toastCopyFailed: 'Copy failed: Permission denied or tab not focused',
    toastDownloaded: 'Screenshot downloaded',
    toastDownloadFailed: 'Failed to export PNG image',
    toastInvalidWidth: 'Please enter a valid width of at least 50px.',
    promptCustomWidth: 'Enter target width in pixels (e.g. 1080, 1200, 800):',
    noScreenshot: 'No screenshot specified',
    notFound: 'Screenshot not found or expired',
    croppedSuffix: '(Cropped)'
  },
  th: {
    fitWidth: 'พอดีจอ',
    actualSize: 'ขนาดจริง 100%',
    drawBtn: 'วาดเขียน',
    cropBtn: 'ครอบตัด',
    resetBtn: 'คืนค่าเดิม',
    copyBtn: 'คัดลอก',
    copyResolutionHeader: 'เลือกขนาดคัดลอก',
    copyFullTitle: '📋 ความละเอียดเต็ม 100%',
    copyFullDesc: 'คมชัดต้นฉบับ High-DPI',
    copy50Title: '⚡ ย่อขนาด 50%',
    copy50Desc: 'เหมาะสำหรับส่งใน Slack, Teams, Line & Chat',
    copy30Title: '📱 ย่อขนาด 30%',
    copy30Desc: 'ไฟล์เล็ก ส่งไวมาก',
    copyCustomTitle: '⚙️ กำหนดความกว้างเอง...',
    copyCustomDesc: 'ระบุความกว้างเป็นพิกเซล (เช่น 1080px, 1200px)',
    downloadBtn: 'ดาวน์โหลด PNG',
    doneBtn: '✓ เสร็จสิ้น',
    cropSelection: 'ขนาดที่เลือก:',
    applyCropBtn: '✓ ตัดภาพ',
    cancelBtn: '✕ ยกเลิก',
    toolPen: 'ปากกาวาดอิสระ (1)',
    toolHighlighter: 'ปากกาไฮไลต์ (2)',
    toolArrow: 'ลูกศร (3)',
    toolRect: 'กรอบสี่เหลี่ยม (4)',
    toolEllipse: 'วงกลม / วงรี (5)',
    toolLine: 'เส้นตรง (6)',
    toolText: 'เพิ่มข้อความ (7)',
    toolBlur: 'เบลอ / เซ็นเซอร์ (8)',
    toolEraser: 'ยางลบ (9)',
    customColor: 'เลือกสีเพิ่มเติม',
    undoTitle: 'ย้อนกลับ (⌘Z)',
    redoTitle: 'ทำซ้ำ (⌘⇧Z)',
    clearTitle: 'ล้างเส้นที่วาดทั้งหมด',
    toastDownscaled: 'หน้าเว็บยาวมาก ระบบย่อขนาดอัตโนมัติให้พอดีขีดจำกัดเบราว์เซอร์',
    toastSelectCrop: 'กรุณาลากเลือกพื้นที่ที่ต้องการครอบตัดก่อน',
    toastCropped: 'ครอบตัดภาพเรียบร้อยแล้ว!',
    toastRestored: 'คืนค่าภาพต้นฉบับแล้ว',
    toastCleared: 'ล้างเส้นที่วาดทั้งหมดแล้ว',
    toastCopied: (label, w, h, sizeStr) => `คัดลอกแล้ว ${label} (${w}×${h}px • ${sizeStr}) พร้อมวาง (⌘V)`,
    toastCopyFailed: 'คัดลอกไม่สำเร็จ: กรุณาคลิกที่หน้านี้แล้วลองอีกครั้ง',
    toastDownloaded: 'ดาวน์โหลดภาพเรียบร้อยแล้ว',
    toastDownloadFailed: 'บันทึกไฟล์ PNG ไม่สำเร็จ',
    toastInvalidWidth: 'กรุณาระบุความกว้างอย่างน้อย 50px',
    promptCustomWidth: 'ระบุความกว้างที่ต้องการเป็นพิกเซล (เช่น 1080, 1200, 800):',
    noScreenshot: 'ไม่พบข้อมูลภาพหน้าจอ',
    notFound: 'ไม่พบภาพหน้าจอหรือภาพหมดอายุแล้ว',
    croppedSuffix: '(ครอบตัดแล้ว)'
  }
};

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

async function loadSavedLang() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(LANG_STORAGE_KEY);
      if (res && (res[LANG_STORAGE_KEY] === 'th' || res[LANG_STORAGE_KEY] === 'en')) {
        return res[LANG_STORAGE_KEY];
      }
    }
  } catch (e) {
    // fallback to localStorage
  }
  const local = localStorage.getItem(LANG_STORAGE_KEY);
  if (local === 'th' || local === 'en') return local;
  return navigator.language && navigator.language.toLowerCase().startsWith('th') ? 'th' : 'en';
}

function saveLang(lang) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [LANG_STORAGE_KEY]: lang });
    }
  } catch (e) {
    // ignore
  }
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch (e) {
    // ignore
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const captureId = urlParams.get('id');

  const mainCanvas = document.getElementById('main-canvas');
  const annotationCanvas = document.getElementById('annotation-canvas');
  const imageWrapper = document.getElementById('image-wrapper');
  const workspace = document.getElementById('workspace');

  const badgeTitle = document.getElementById('badge-title');
  const badgeDims = document.getElementById('badge-dims');

  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnFitWidth = document.getElementById('btn-fit-width');
  const btnActualSize = document.getElementById('btn-actual-size');
  const zoomLevelText = document.getElementById('zoom-level');

  const btnAnnotateToggle = document.getElementById('btn-annotate-toggle');
  const annotateToolbar = document.getElementById('annotate-toolbar');
  const toolButtons = annotateToolbar.querySelectorAll('.tool-btn[data-tool]');
  const colorSwatches = annotateToolbar.querySelectorAll('.color-swatch');
  const inputCustomColor = document.getElementById('input-custom-color');
  const strokeWidthSlider = document.getElementById('stroke-width-slider');
  const strokeWidthVal = document.getElementById('stroke-width-val');
  const strokeSizeDot = document.getElementById('stroke-size-dot');
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnClearAnnotations = document.getElementById('btn-clear-annotations');
  const btnDoneAnnotate = document.getElementById('btn-done-annotate');

  const btnCropToggle = document.getElementById('btn-crop-toggle');
  const btnResetCrop = document.getElementById('btn-reset-crop');
  const btnCopyClipboard = document.getElementById('btn-copy-clipboard');
  const btnCopyLabel = document.getElementById('btn-copy-label');
  const btnCopyToggleMenu = document.getElementById('btn-copy-toggle-menu');
  const copyMenu = document.getElementById('copy-menu');
  const badgeFullResolution = document.getElementById('badge-full-resolution');
  const btnDownloadPng = document.getElementById('btn-download-png');
  const btnLangToggle = document.getElementById('btn-lang-toggle');

  let currentLang = await loadSavedLang();
  let currentCopyScale = 1.0;
  let currentCustomWidth = null;
  let isCropped = false;

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
  let annotator = null;
  let zoomPercent = 100;
  let pageTitle = 'Screenshot';

  function t(key) {
    return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key;
  }

  function updateCopyButtonLabel() {
    const base = t('copyBtn');
    if (currentCustomWidth) {
      btnCopyLabel.textContent = `${base} (${currentCustomWidth}px)`;
    } else if (currentCopyScale === 0.5) {
      btnCopyLabel.textContent = `${base} (50%)`;
    } else if (currentCopyScale === 0.3) {
      btnCopyLabel.textContent = `${base} (30%)`;
    } else {
      btnCopyLabel.textContent = base;
    }
  }

  function applyLanguage(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    btnLangToggle.textContent = lang === 'th' ? 'TH' : 'EN';

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });

    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      if (key) el.title = t(key);
    });

    updateCopyButtonLabel();

    if (mainCanvas.width && mainCanvas.height) {
      badgeDims.textContent = isCropped
        ? `${mainCanvas.width} × ${mainCanvas.height} px ${t('croppedSuffix')}`
        : `${mainCanvas.width} × ${mainCanvas.height} px`;
    }
  }

  applyLanguage(currentLang);

  btnLangToggle.addEventListener('click', () => {
    const nextLang = currentLang === 'th' ? 'en' : 'th';
    saveLang(nextLang);
    applyLanguage(nextLang);
  });

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

  // Initialize Annotation Engine
  function updateStrokePreview(size, color) {
    const clampedDot = Math.max(4, Math.min(18, size));
    strokeSizeDot.style.width = `${clampedDot}px`;
    strokeSizeDot.style.height = `${clampedDot}px`;
    strokeSizeDot.style.backgroundColor = color;
    strokeWidthVal.textContent = `${size}px`;
  }

  annotator = new AnnotationEngine(annotationCanvas, mainCanvas, imageWrapper, {
    onStateChange: (state) => {
      btnUndo.disabled = !state.canUndo;
      btnRedo.disabled = !state.canRedo;
      btnClearAnnotations.disabled = !state.hasAnnotations;
      btnAnnotateToggle.classList.toggle('btn-active', state.active);

      toolButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tool === state.tool);
      });
      updateStrokePreview(state.lineWidth, state.color);
    }
  });

  updateStrokePreview(annotator.lineWidth, annotator.color);

  function enterAnnotateMode() {
    if (cropper && cropper.active) {
      cancelCrop();
    }
    annotateToolbar.classList.remove('hidden');
    annotator.start();
  }

  function exitAnnotateMode() {
    annotateToolbar.classList.add('hidden');
    annotator.stop();
  }

  btnAnnotateToggle.addEventListener('click', () => {
    if (annotator.active) {
      exitAnnotateMode();
    } else {
      enterAnnotateMode();
    }
  });

  btnDoneAnnotate.addEventListener('click', exitAnnotateMode);

  toolButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      annotator.setTool(btn.dataset.tool);
    });
  });

  colorSwatches.forEach((swatch) => {
    swatch.addEventListener('click', () => {
      colorSwatches.forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
      const color = swatch.dataset.color;
      inputCustomColor.value = color;
      annotator.setColor(color);
    });
  });

  inputCustomColor.addEventListener('input', (e) => {
    colorSwatches.forEach((s) => s.classList.remove('active'));
    annotator.setColor(e.target.value);
  });

  strokeWidthSlider.addEventListener('input', (e) => {
    annotator.setLineWidth(parseInt(e.target.value, 10));
  });

  btnUndo.addEventListener('click', () => annotator.undo());
  btnRedo.addEventListener('click', () => annotator.redo());
  btnClearAnnotations.addEventListener('click', () => {
    if (annotator.hasAnnotations()) {
      annotator.clear();
      showToast(t('toastCleared'), '🧹', 2000);
    }
  });

  // 1. Fetch screenshot from IndexedDB (or demo mode if ?demo=1)
  const isDemo = urlParams.get('demo') === '1';

  if (isDemo) {
    const demoCanvas = document.createElement('canvas');
    demoCanvas.width = 1280;
    demoCanvas.height = 900;
    const dCtx = demoCanvas.getContext('2d');
    const grad = dCtx.createLinearGradient(0, 0, 1280, 900);
    grad.addColorStop(0, '#f8fafc');
    grad.addColorStop(1, '#e0f2fe');
    dCtx.fillStyle = grad;
    dCtx.fillRect(0, 0, 1280, 900);
    dCtx.fillStyle = '#0f172a';
    dCtx.font = '700 42px -apple-system, sans-serif';
    dCtx.fillText('Pliw Scroll Studio — Drawing Preview', 80, 120);
    dCtx.fillStyle = '#475569';
    dCtx.font = '400 22px -apple-system, sans-serif';
    dCtx.fillText('Test freehand drawing, arrows, shapes, text, blur, crop & export.', 80, 175);
    dCtx.fillStyle = '#ffffff';
    dCtx.fillRect(80, 230, 1120, 560);
    dCtx.strokeStyle = '#cbd5e1';
    dCtx.lineWidth = 2;
    dCtx.strokeRect(80, 230, 1120, 560);

    pageTitle = 'Demo Canvas';
    badgeTitle.textContent = pageTitle;
    const demoImg = new Image();
    demoImg.onload = () => {
      originalImage = demoImg;
      drawCanvas(demoImg);
      fitToWidth();
    };
    demoImg.src = demoCanvas.toDataURL('image/png');
  } else {
    if (!captureId) {
      badgeTitle.textContent = t('noScreenshot');
      return;
    }

    const record = await getScreenshotFromDB(captureId).catch(err => {
      console.error('Failed to load screenshot from DB:', err);
      return null;
    });

    if (!record || !record.dataUrl) {
      badgeTitle.textContent = t('notFound');
      return;
    }

    pageTitle = record.title || 'Screenshot';
    badgeTitle.textContent = pageTitle;
    document.title = `${pageTitle} • Pliw Scroll Studio`;

    // 2. Load into image & canvas
    const img = new Image();
    img.onload = () => {
      originalImage = img;
      drawCanvas(img);
      fitToWidth();
      if (record.downscaled) {
        showToast(t('toastDownscaled'), 'ℹ️', 4500);
      }
    };
    img.src = record.dataUrl;
  }

  function drawCanvas(sourceImg) {
    mainCanvas.width = sourceImg.width;
    mainCanvas.height = sourceImg.height;
    const ctx = mainCanvas.getContext('2d');
    ctx.drawImage(sourceImg, 0, 0);

    annotator.syncSize(sourceImg.width, sourceImg.height);

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
      showToast(t('toastSelectCrop'), '⚠️', 3000);
      return;
    }

    const scaleX = mainCanvas.width / imageWrapper.clientWidth;
    const scaleY = mainCanvas.height / imageWrapper.clientHeight;

    const cropX = Math.max(0, Math.round(currentCropCoords.displayX * scaleX));
    const cropY = Math.max(0, Math.round(currentCropCoords.displayY * scaleY));
    const cropW = Math.max(1, Math.min(mainCanvas.width - cropX, Math.round(currentCropCoords.displayWidth * scaleX)));
    const cropH = Math.max(1, Math.min(mainCanvas.height - cropY, Math.round(currentCropCoords.displayHeight * scaleY)));

    // Composite existing annotations before cropping so drawings stay intact inside cropped area
    const composited = annotator.getCompositedCanvas();

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(composited, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    mainCanvas.width = cropW;
    mainCanvas.height = cropH;
    const mainCtx = mainCanvas.getContext('2d');
    mainCtx.drawImage(tempCanvas, 0, 0);

    // Clear vector layer (already baked into cropped canvas) and sync its size
    annotator.clear();
    annotator.syncSize(cropW, cropH);

    cropper.stop();
    cropActionBar.classList.add('hidden');
    btnResetCrop.classList.remove('hidden');
    isCropped = true;
    badgeDims.textContent = `${cropW} × ${cropH} px ${t('croppedSuffix')}`;
    if (badgeFullResolution) {
      badgeFullResolution.textContent = `${cropW}px`;
    }

    fitToWidth();
    showToast(t('toastCropped'), '✂️');
  }

  function cancelCrop() {
    cropper.stop();
    cropActionBar.classList.add('hidden');
  }

  btnCropToggle.addEventListener('click', () => {
    if (annotator.active) {
      exitAnnotateMode();
    }
    cropActionBar.classList.remove('hidden');
    cropper.start();
  });

  btnCancelCrop.addEventListener('click', cancelCrop);
  btnApplyCrop.addEventListener('click', applyActiveCrop);

  btnResetCrop.addEventListener('click', () => {
    if (originalImage) {
      if (cropper.active) cancelCrop();
      isCropped = false;
      annotator.clear();
      drawCanvas(originalImage);
      btnResetCrop.classList.add('hidden');
      fitToWidth();
      showToast(t('toastRestored'), '↩️');
    }
  });

  // 5. Copy to Clipboard (Full Resolution & Resized Options, composited with annotations)
  async function copyImageToClipboard(scaleFactor = 1.0, customWidth = null) {
    try {
      const compositedCanvas = annotator.getCompositedCanvas();
      let targetWidth, targetHeight;

      if (customWidth) {
        targetWidth = Math.max(50, Math.round(customWidth));
        targetHeight = Math.max(1, Math.round((compositedCanvas.height / compositedCanvas.width) * targetWidth));
      } else {
        targetWidth = Math.max(1, Math.round(compositedCanvas.width * scaleFactor));
        targetHeight = Math.max(1, Math.round(compositedCanvas.height * scaleFactor));
      }

      let sourceCanvas = compositedCanvas;
      if (targetWidth !== compositedCanvas.width || targetHeight !== compositedCanvas.height) {
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = targetWidth;
        scaledCanvas.height = targetHeight;
        const sCtx = scaledCanvas.getContext('2d');
        sCtx.imageSmoothingEnabled = true;
        sCtx.imageSmoothingQuality = 'high';
        sCtx.drawImage(compositedCanvas, 0, 0, targetWidth, targetHeight);
        sourceCanvas = scaledCanvas;
      }

      const blob = await canvasToPngBlob(sourceCanvas);

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);

      const sizeKb = Math.round(blob.size / 1024);
      const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
      const label = scaleFactor === 1.0 && !customWidth ? '100%' : `${targetWidth}px`;
      showToast(t('toastCopied')(label, targetWidth, targetHeight, sizeStr), '✅');
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      showToast(t('toastCopyFailed'), '❌', 4000);
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

  function setActiveMenuItem(activeEl, scale, customW = null) {
    copyMenuItems.forEach(item => item.classList.remove('active'));
    activeEl.classList.add('active');
    currentCopyScale = scale;
    currentCustomWidth = customW;
    updateCopyButtonLabel();
    copyMenu.classList.add('hidden');
  }

  document.getElementById('opt-copy-full').addEventListener('click', (e) => {
    e.stopPropagation();
    setActiveMenuItem(e.currentTarget, 1.0, null);
    copyImageToClipboard(1.0, null);
  });

  document.getElementById('opt-copy-50').addEventListener('click', (e) => {
    e.stopPropagation();
    setActiveMenuItem(e.currentTarget, 0.5, null);
    copyImageToClipboard(0.5, null);
  });

  document.getElementById('opt-copy-30').addEventListener('click', (e) => {
    e.stopPropagation();
    setActiveMenuItem(e.currentTarget, 0.3, null);
    copyImageToClipboard(0.3, null);
  });

  document.getElementById('opt-copy-custom').addEventListener('click', (e) => {
    e.stopPropagation();
    copyMenu.classList.add('hidden');
    const input = prompt(t('promptCustomWidth'), '1080');
    if (input) {
      const parsedW = parseInt(input, 10);
      if (!isNaN(parsedW) && parsedW >= 50) {
        setActiveMenuItem(e.currentTarget, null, parsedW);
        copyImageToClipboard(null, parsedW);
      } else {
        showToast(t('toastInvalidWidth'), '⚠️', 3000);
      }
    }
  });

  // 6. Download PNG (composited with annotations)
  btnDownloadPng.addEventListener('click', async () => {
    try {
      const compositedCanvas = annotator.getCompositedCanvas();
      const blob = await canvasToPngBlob(compositedCanvas);
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

      showToast(t('toastDownloaded'), '💾');
    } catch (err) {
      console.error('Download failed:', err);
      showToast(t('toastDownloadFailed'), '❌', 3500);
    }
  });

  // 7. Studio Keyboard Shortcuts
  const toolShortcutMap = {
    '1': 'pen',
    '2': 'highlighter',
    '3': 'arrow',
    '4': 'rect',
    '5': 'ellipse',
    '6': 'line',
    '7': 'text',
    '8': 'blur',
    '9': 'eraser'
  };

  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    const isTyping = tag === 'input' || tag === 'textarea';
    if (isTyping) return;

    const key = e.key.toLowerCase();

    if ((e.metaKey || e.ctrlKey) && key === 'z') {
      if (e.shiftKey) {
        if (annotator.canRedo()) {
          e.preventDefault();
          annotator.redo();
        }
      } else {
        if (annotator.canUndo()) {
          e.preventDefault();
          annotator.undo();
        }
      }
      return;
    }

    if ((e.metaKey || e.ctrlKey) && key === 'y') {
      if (annotator.canRedo()) {
        e.preventDefault();
        annotator.redo();
      }
      return;
    }

    if (e.key === 'Escape') {
      if (!copyMenu.classList.contains('hidden')) {
        copyMenu.classList.add('hidden');
      } else if (cropper && cropper.active) {
        cancelCrop();
      } else if (annotator && annotator.active) {
        exitAnnotateMode();
      }
    } else if (e.key === 'Enter' && cropper && cropper.active) {
      e.preventDefault();
      applyActiveCrop();
    } else if ((e.metaKey || e.ctrlKey) && key === 'c' && !window.getSelection().toString()) {
      e.preventDefault();
      copyImageToClipboard(currentCopyScale, currentCustomWidth);
    } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      if (key === 'd') {
        if (annotator.active) {
          exitAnnotateMode();
        } else {
          enterAnnotateMode();
        }
      } else if (annotator.active && toolShortcutMap[key]) {
        annotator.setTool(toolShortcutMap[key]);
      }
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
