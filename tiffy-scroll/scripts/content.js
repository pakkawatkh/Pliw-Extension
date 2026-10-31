// scripts/content.js - Scrolling Inspector & DOM Coordinator

(() => {
  // Prevent duplicate injection
  if (window.__tiffyCaptureScrollInjected) return;
  window.__tiffyCaptureScrollInjected = true;

  let originalScrollX = 0;
  let originalScrollY = 0;
  let hiddenFixedElements = [];
  let scrollbarStyleTag = null;
  let floatingBanner = null;

  // 1. Floating On-Page Control Banner during capture
  function updateFloatingBanner(step, totalSteps) {
    if (!floatingBanner) {
      floatingBanner = document.createElement('div');
      floatingBanner.id = 'tiffy-floating-capture-bar';
      floatingBanner.innerHTML = `
        <style>
          #tiffy-floating-capture-bar {
            all: initial;
            position: fixed !important;
            bottom: 24px !important;
            right: 24px !important;
            background: rgba(15, 23, 42, 0.94) !important;
            backdrop-filter: blur(16px) !important;
            -webkit-backdrop-filter: blur(16px) !important;
            color: #ffffff !important;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;
            font-size: 13px !important;
            padding: 8px 16px !important;
            border-radius: 30px !important;
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            box-shadow: 0 10px 30px rgba(0,0,0,0.45) !important;
            z-index: 2147483647 !important;
            border: 1px solid rgba(255,255,255,0.18) !important;
            user-select: none !important;
          }
          #tiffy-floating-capture-bar .tcb-dot {
            width: 8px;
            height: 8px;
            background: #ef4444;
            border-radius: 50%;
            animation: tcbPulse 1.2s infinite;
          }
          @keyframes tcbPulse {
            0% { transform: scale(0.9); opacity: 0.8; }
            50% { transform: scale(1.3); opacity: 1; }
            100% { transform: scale(0.9); opacity: 0.8; }
          }
          #tiffy-floating-capture-bar .tcb-text {
            font-weight: 500;
            color: #f8fafc;
            white-space: nowrap;
          }
          #tiffy-floating-capture-bar .tcb-btn-stop {
            all: initial;
            background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%) !important;
            color: #ffffff !important;
            font-family: inherit !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            padding: 5px 12px !important;
            border-radius: 16px !important;
            cursor: pointer !important;
            box-shadow: 0 2px 8px rgba(2,132,199,0.5) !important;
            transition: transform 0.1s !important;
          }
          #tiffy-floating-capture-bar .tcb-btn-stop:hover {
            transform: scale(1.04) !important;
          }
          #tiffy-floating-capture-bar .tcb-btn-cancel {
            all: initial;
            background: transparent !important;
            color: #94a3b8 !important;
            font-family: inherit !important;
            font-size: 14px !important;
            cursor: pointer !important;
            padding: 3px 6px !important;
          }
          #tiffy-floating-capture-bar .tcb-btn-cancel:hover {
            color: #ffffff !important;
          }
        </style>
        <div class="tcb-dot"></div>
        <span id="tcb-text" class="tcb-text">Capturing...</span>
        <button id="tcb-stop-btn" class="tcb-btn-stop">⏹ Stop &amp; Finish</button>
        <button id="tcb-cancel-btn" class="tcb-btn-cancel" title="Cancel capture">✕</button>
      `;

      (document.body || document.documentElement).appendChild(floatingBanner);

      floatingBanner.querySelector('#tcb-stop-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        floatingBanner.querySelector('#tcb-stop-btn').textContent = 'Stopping...';
        chrome.runtime.sendMessage({ action: 'STOP_CAPTURE' });
      });

      floatingBanner.querySelector('#tcb-cancel-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        chrome.runtime.sendMessage({ action: 'CANCEL_CAPTURE' });
        removeFloatingBanner();
      });
    }

    const textEl = floatingBanner.querySelector('#tcb-text');
    if (textEl) {
      textEl.textContent = `Capturing (${step}/${totalSteps})...`;
    }
  }

  function hideFloatingBanner() {
    if (floatingBanner) floatingBanner.style.display = 'none';
  }

  function showFloatingBanner() {
    if (floatingBanner) floatingBanner.style.display = 'flex';
  }

  function removeFloatingBanner() {
    if (floatingBanner) {
      floatingBanner.remove();
      floatingBanner = null;
    }
  }

  // 2. Hide scrollbars completely during capture
  function hideScrollbars() {
    if (scrollbarStyleTag) return;
    scrollbarStyleTag = document.createElement('style');
    scrollbarStyleTag.id = 'tiffy-hide-scrollbars';
    scrollbarStyleTag.textContent = `
      ::-webkit-scrollbar { display: none !important; }
      html, body {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(scrollbarStyleTag);
  }

  function restoreScrollbars() {
    if (scrollbarStyleTag) {
      scrollbarStyleTag.remove();
      scrollbarStyleTag = null;
    }
  }

  // 3. Locate and hide fixed/sticky headers safely without breaking page styles
  const hiddenFixedElementsMap = new Map(); // element -> original inline visibility

  function hideFixedHeaders() {
    // Only capture and hide once per session; do not wipe or repeat
    if (hiddenFixedElementsMap.size > 0) return;

    const candidates = document.querySelectorAll('header, nav, [role="banner"], ytd-masthead, #masthead, #header, div');
    const vw = window.innerWidth;

    for (const el of candidates) {
      if (el.id === 'tiffy-floating-capture-bar') continue;

      try {
        const style = window.getComputedStyle(el);
        const isFixedOrSticky = style.position === 'fixed' || style.position === 'sticky';

        if (isFixedOrSticky && style.display !== 'none' && style.visibility !== 'hidden') {
          const rect = el.getBoundingClientRect();
          // Only target top-level banners sticking near top edge of the viewport
          if (rect.top <= 10 && rect.height > 0 && rect.height < (window.innerHeight * 0.4) && rect.width >= vw * 0.5) {
            // Check if ancestor is already hidden to prevent redundant child hiding
            let hasHiddenAncestor = false;
            let parent = el.parentElement;
            while (parent) {
              if (hiddenFixedElementsMap.has(parent)) {
                hasHiddenAncestor = true;
                break;
              }
              parent = parent.parentElement;
            }

            if (!hasHiddenAncestor) {
              hiddenFixedElementsMap.set(el, el.style.visibility || '');
              el.setAttribute('data-tiffy-hidden', 'true');
              el.style.setProperty('visibility', 'hidden', 'important');
            }
          }
        }
      } catch (e) {}
    }
  }

  function restoreFixedHeaders() {
    // 1. Restore from Map
    for (const [el, orig] of hiddenFixedElementsMap.entries()) {
      try {
        if (orig) {
          el.style.visibility = orig;
        } else {
          el.style.removeProperty('visibility');
        }
        el.removeAttribute('data-tiffy-hidden');
      } catch (e) {}
    }
    hiddenFixedElementsMap.clear();

    // 2. Safety Net: restore any remaining elements with data-tiffy-hidden
    document.querySelectorAll('[data-tiffy-hidden]').forEach(el => {
      try {
        el.style.removeProperty('visibility');
        el.removeAttribute('data-tiffy-hidden');
      } catch (e) {}
    });
  }

  // Safety net: auto-restore if user navigates away
  window.addEventListener('beforeunload', restoreFixedHeaders);

  // 3. Message handler
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'INIT_CAPTURE_METRICS': {
        originalScrollX = window.scrollX;
        originalScrollY = window.scrollY;
        hideScrollbars();

        // Calculate accurate dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const scrollWidth = Math.max(
          document.documentElement.scrollWidth,
          document.body ? document.body.scrollWidth : 0,
          document.documentElement.clientWidth
        );
        const scrollHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body ? document.body.scrollHeight : 0,
          document.documentElement.clientHeight
        );
        const dpr = window.devicePixelRatio || 1;

        // Generate scroll steps
        const totalSteps = Math.ceil(scrollHeight / viewportHeight);

        sendResponse({
          success: true,
          viewportWidth,
          viewportHeight,
          scrollWidth,
          scrollHeight,
          dpr,
          totalSteps,
          title: document.title || 'Screenshot'
        });
        return true;
      }

      case 'SCROLL_TO_POSITION': {
        const { y, stepIndex } = request;

        // On subsequent steps (stepIndex > 0), hide sticky headers so they don't smear
        if (stepIndex > 0) {
          hideFixedHeaders();
        } else {
          restoreFixedHeaders();
        }

        window.scrollTo({
          top: y,
          left: 0,
          behavior: 'instant'
        });

        // Allow DOM paint & image lazy loading to settle
        requestAnimationFrame(() => {
          setTimeout(() => {
            sendResponse({
              success: true,
              currentY: window.scrollY
            });
          }, 150);
        });
        return true;
      }

      case 'UPDATE_FLOATING_BANNER': {
        updateFloatingBanner(request.step, request.totalSteps);
        sendResponse({ success: true });
        return true;
      }

      case 'HIDE_BANNER': {
        hideFloatingBanner();
        sendResponse({ success: true });
        return true;
      }

      case 'SHOW_BANNER': {
        showFloatingBanner();
        sendResponse({ success: true });
        return true;
      }

      case 'RESTORE_PAGE': {
        removeFloatingBanner();
        restoreFixedHeaders();
        restoreScrollbars();
        window.scrollTo({
          top: originalScrollY,
          left: originalScrollX,
          behavior: 'instant'
        });
        sendResponse({ success: true });
        return true;
      }
    }
  });
})();
