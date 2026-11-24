// popup.js - Tiffy Scroll Trigger Controller

document.addEventListener('DOMContentLoaded', () => {
  const btnCaptureFull = document.getElementById('btn-capture-full');
  const btnCaptureVisible = document.getElementById('btn-capture-visible');
  const btnStopCapture = document.getElementById('btn-stop-capture');
  const btnCancelCapture = document.getElementById('btn-cancel-capture');
  const statusCard = document.getElementById('status-card');
  const statusText = document.getElementById('status-text');
  const statusPercent = document.getElementById('status-percent');
  const statusActions = document.getElementById('status-actions');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const versionBadge = document.getElementById('version-badge');

  if (versionBadge && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
    versionBadge.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  const defaultStopButtonHtml = btnStopCapture.innerHTML;

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

  function setInProgress(text, percent) {
    const safePct = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
    statusCard.classList.remove('hidden');
    if (statusActions) statusActions.classList.remove('hidden');
    statusText.textContent = text;
    statusPercent.textContent = `${safePct}%`;
    progressBarFill.style.background = 'linear-gradient(90deg, #38bdf8 0%, #0284c7 100%)';
    progressBarFill.style.width = `${safePct}%`;
    btnCaptureFull.disabled = true;
    btnCaptureVisible.disabled = true;
    btnCaptureFull.style.opacity = '0.6';
    btnCaptureVisible.style.opacity = '0.6';
  }

  function resetUI() {
    statusCard.classList.add('hidden');
    if (statusActions) statusActions.classList.remove('hidden');
    btnCaptureFull.disabled = false;
    btnCaptureVisible.disabled = false;
    btnCaptureFull.style.opacity = '1';
    btnCaptureVisible.style.opacity = '1';
    btnStopCapture.disabled = false;
    btnStopCapture.innerHTML = defaultStopButtonHtml;
  }

  function showError(message) {
    statusCard.classList.remove('hidden');
    if (statusActions) statusActions.classList.add('hidden');
    statusText.textContent = `Error: ${message}`;
    statusPercent.textContent = '!';
    progressBarFill.style.background = '#ef4444';
    progressBarFill.style.width = '100%';
    btnCaptureFull.disabled = false;
    btnCaptureVisible.disabled = false;
    btnCaptureFull.style.opacity = '1';
    btnCaptureVisible.style.opacity = '1';
    btnStopCapture.disabled = false;
    btnStopCapture.innerHTML = defaultStopButtonHtml;
  }

  async function getCapturableActiveTab() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id) {
      showError('Cannot capture this page.');
      return null;
    }
    if (isRestrictedUrl(activeTab.url)) {
      showError('Cannot capture internal or restricted browser pages.');
      return null;
    }
    return activeTab;
  }

  // 1. Capture Full Page
  btnCaptureFull.addEventListener('click', async () => {
    try {
      const activeTab = await getCapturableActiveTab();
      if (!activeTab) return;

      btnStopCapture.disabled = false;
      btnStopCapture.innerHTML = defaultStopButtonHtml;
      setInProgress('Initializing full page capture...', 5);

      chrome.runtime.sendMessage({
        action: 'START_FULL_CAPTURE',
        tabId: activeTab.id
      });
    } catch (err) {
      console.error('Capture trigger error:', err);
      showError('Failed to start capture.');
    }
  });

  // 2. Capture Visible Viewport Only
  btnCaptureVisible.addEventListener('click', async () => {
    try {
      const activeTab = await getCapturableActiveTab();
      if (!activeTab) return;

      btnStopCapture.disabled = false;
      btnStopCapture.innerHTML = defaultStopButtonHtml;
      setInProgress('Capturing visible area...', 40);

      chrome.runtime.sendMessage({
        action: 'START_VISIBLE_CAPTURE',
        tabId: activeTab.id
      });
    } catch (err) {
      console.error('Visible capture error:', err);
      showError('Failed to start capture.');
    }
  });

  // Stop & Finish early
  btnStopCapture.addEventListener('click', () => {
    btnStopCapture.disabled = true;
    btnStopCapture.textContent = 'Stopping & stitching...';
    chrome.runtime.sendMessage({ action: 'STOP_CAPTURE' });
  });

  // Cancel & discard
  btnCancelCapture.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'CANCEL_CAPTURE' });
    resetUI();
  });

  // 3. Listen for progress reports from background worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'CAPTURE_PROGRESS') {
      const pct = message.totalSteps > 0 ? (message.step / message.totalSteps) * 100 : 0;
      setInProgress(message.status || `Capturing section ${message.step}/${message.totalSteps}...`, pct);
    } else if (message.action === 'CAPTURE_COMPLETE') {
      setInProgress('Opening in Studio...', 100);
      setTimeout(() => {
        window.close();
      }, 500);
    } else if (message.action === 'CAPTURE_CANCELLED') {
      resetUI();
    } else if (message.action === 'CAPTURE_ERROR') {
      showError(message.error || 'Capture failed');
    }
  });
});
