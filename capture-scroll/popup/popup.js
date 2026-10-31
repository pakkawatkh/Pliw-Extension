// popup.js - Capture Scroll Trigger Controller

document.addEventListener('DOMContentLoaded', () => {
  const btnCaptureFull = document.getElementById('btn-capture-full');
  const btnCaptureVisible = document.getElementById('btn-capture-visible');
  const statusCard = document.getElementById('status-card');
  const statusText = document.getElementById('status-text');
  const statusPercent = document.getElementById('status-percent');
  const progressBarFill = document.getElementById('progress-bar-fill');

  function setInProgress(text, percent) {
    statusCard.classList.remove('hidden');
    statusText.textContent = text;
    statusPercent.textContent = `${Math.round(percent)}%`;
    progressBarFill.style.width = `${Math.round(percent)}%`;
    btnCaptureFull.disabled = true;
    btnCaptureVisible.disabled = true;
    btnCaptureFull.style.opacity = '0.6';
    btnCaptureVisible.style.opacity = '0.6';
  }

  // 1. Capture Full Page
  btnCaptureFull.addEventListener('click', async () => {
    setInProgress('Initializing full page capture...', 5);

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.id) {
        alert('Cannot capture this page.');
        return;
      }

      // Check for restricted URLs (chrome://, edge://, brave://)
      if (activeTab.url.startsWith('chrome://') || 
          activeTab.url.startsWith('brave://') || 
          activeTab.url.startsWith('edge://') ||
          activeTab.url.startsWith('chrome-extension://')) {
        alert('Chromium security prevents extensions from capturing internal browser pages.');
        window.close();
        return;
      }

      chrome.runtime.sendMessage({
        action: 'START_FULL_CAPTURE',
        tabId: activeTab.id
      });
    } catch (err) {
      console.error('Capture trigger error:', err);
      statusText.textContent = 'Error starting capture';
    }
  });

  // 2. Capture Visible Viewport Only
  btnCaptureVisible.addEventListener('click', async () => {
    setInProgress('Capturing visible area...', 40);

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.id) return;

      chrome.runtime.sendMessage({
        action: 'START_VISIBLE_CAPTURE',
        tabId: activeTab.id
      });
    } catch (err) {
      console.error('Visible capture error:', err);
      statusText.textContent = 'Error starting capture';
    }
  });

  // 3. Listen for progress reports from background worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'CAPTURE_PROGRESS') {
      const pct = (message.step / message.totalSteps) * 100;
      setInProgress(message.status || `Capturing section ${message.step}/${message.totalSteps}...`, pct);
    } else if (message.action === 'CAPTURE_COMPLETE') {
      setInProgress('Opening in Studio...', 100);
      setTimeout(() => {
        window.close();
      }, 500);
    } else if (message.action === 'CAPTURE_ERROR') {
      statusText.textContent = `Error: ${message.error}`;
      statusPercent.textContent = '!';
      progressBarFill.style.background = '#ef4444';
      btnCaptureFull.disabled = false;
      btnCaptureVisible.disabled = false;
      btnCaptureFull.style.opacity = '1';
      btnCaptureVisible.style.opacity = '1';
    }
  });
});
