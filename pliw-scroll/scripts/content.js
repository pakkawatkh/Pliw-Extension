// scripts/content.js - Scrolling Inspector & DOM Coordinator

(() => {
  // Prevent duplicate injection
  if (window.__pliwCaptureScrollInjected) return;
  window.__pliwCaptureScrollInjected = true;

  let originalScrollX = 0;
  let originalScrollY = 0;
  let scrollbarStyleTag = null;
  let floatingBanner = null;

  // 1. Floating On-Page Control Banner during capture
  function updateFloatingBanner(step, totalSteps) {
    if (!floatingBanner) {
      floatingBanner = document.createElement('div');
      floatingBanner.id = 'pliw-floating-capture-bar';
      floatingBanner.innerHTML = `
        <style>
          #pliw-floating-capture-bar {
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
          #pliw-floating-capture-bar .tcb-dot {
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
          #pliw-floating-capture-bar .tcb-text {
            font-weight: 500;
            color: #f8fafc;
            white-space: nowrap;
          }
          #pliw-floating-capture-bar .tcb-btn-stop {
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
          #pliw-floating-capture-bar .tcb-btn-stop:hover {
            transform: scale(1.04) !important;
          }
          #pliw-floating-capture-bar .tcb-btn-cancel {
            all: initial;
            background: transparent !important;
            color: #94a3b8 !important;
            font-family: inherit !important;
            font-size: 14px !important;
            cursor: pointer !important;
            padding: 3px 6px !important;
          }
          #pliw-floating-capture-bar .tcb-btn-cancel:hover {
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
    if (floatingBanner) {
      floatingBanner.style.setProperty('display', 'none', 'important');
    }
  }

  function showFloatingBanner() {
    if (floatingBanner) {
      floatingBanner.style.setProperty('display', 'flex', 'important');
    }
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
    scrollbarStyleTag.id = 'pliw-hide-scrollbars';
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

  // 3. Locate and hide fixed/sticky elements (headers, chips, sidebars, floating widgets)
  const hiddenFixedElementsMap = new Map();

  function hideAllFixedAndStickyElements() {
    const vh = window.innerHeight;
    const all = document.querySelectorAll('*');

    for (const el of all) {
      if (!el || el.id === 'pliw-floating-capture-bar') continue;
      if (el.closest && el.closest('#pliw-floating-capture-bar')) continue;

      try {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        const pos = style.position;
        const rect = el.getBoundingClientRect();

        let shouldHide = false;

        // A. Fixed elements: on slices > 0, hide ANY fixed element (top headers, sidebars, floating badges, cookie banners)
        // because it does not scroll and was already captured in slice 0.
        if (pos === 'fixed') {
          if (rect.width > 0 && rect.height > 0) {
            shouldHide = true;
          }
        }
        // B. Sticky elements: hide if currently sticking near the top of the viewport (<= 160px)
        // e.g. YouTube chips bar, table headers, sticky navigation
        else if (pos === 'sticky') {
          if (rect.top <= 160 && rect.bottom > 0 && rect.height > 0 && rect.height < (vh * 0.45)) {
            shouldHide = true;
          }
        }

        if (shouldHide) {
          // Avoid hiding an element if its ancestor is already hidden
          let hasHiddenAncestor = false;
          let parent = el.parentElement;
          while (parent) {
            if (hiddenFixedElementsMap.has(parent)) {
              hasHiddenAncestor = true;
              break;
            }
            parent = parent.parentElement;
          }

          if (!hasHiddenAncestor && !hiddenFixedElementsMap.has(el)) {
            hiddenFixedElementsMap.set(el, {
              visibility: el.style.getPropertyValue('visibility'),
              visibilityPriority: el.style.getPropertyPriority('visibility'),
              opacity: el.style.getPropertyValue('opacity'),
              opacityPriority: el.style.getPropertyPriority('opacity'),
              pointerEvents: el.style.getPropertyValue('pointer-events'),
              pointerEventsPriority: el.style.getPropertyPriority('pointer-events')
            });
            el.setAttribute('data-pliw-hidden', 'true');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('opacity', '0', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
          }
        }
      } catch (e) {}
    }
  }

  function restoreStyleProp(el, prop, value, priority) {
    if (value) {
      el.style.setProperty(prop, value, priority || '');
    } else {
      el.style.removeProperty(prop);
    }
  }

  function restoreFixedAndStickyElements() {
    for (const [el, orig] of hiddenFixedElementsMap.entries()) {
      try {
        restoreStyleProp(el, 'visibility', orig.visibility, orig.visibilityPriority);
        restoreStyleProp(el, 'opacity', orig.opacity, orig.opacityPriority);
        restoreStyleProp(el, 'pointer-events', orig.pointerEvents, orig.pointerEventsPriority);
        el.removeAttribute('data-pliw-hidden');
      } catch (e) {}
    }
    hiddenFixedElementsMap.clear();

    // Safety Net: restore any remaining elements with data-pliw-hidden
    document.querySelectorAll('[data-pliw-hidden]').forEach(el => {
      try {
        el.style.removeProperty('visibility');
        el.style.removeProperty('opacity');
        el.style.removeProperty('pointer-events');
        el.removeAttribute('data-pliw-hidden');
      } catch (e) {}
    });
  }

  // Safety net: auto-restore if user navigates away
  window.addEventListener('beforeunload', restoreFixedAndStickyElements);

  // 4. Message handler
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'PING': {
        sendResponse({ success: true });
        return true;
      }

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
        const totalSteps = Math.max(1, Math.ceil(scrollHeight / viewportHeight));

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

        // If stepIndex === 0, ensure all fixed and sticky elements are visible for natural top slice
        if (stepIndex === 0) {
          restoreFixedAndStickyElements();
        }

        window.scrollTo({
          top: y,
          left: 0,
          behavior: 'instant'
        });

        // Allow scroll and layout to settle, then hide all fixed and sticky elements for slices > 0
        setTimeout(() => {
          if (stepIndex > 0) {
            hideAllFixedAndStickyElements();
          }

          requestAnimationFrame(() => {
            const actualScrollHeight = Math.max(
              document.documentElement.scrollHeight,
              document.body ? document.body.scrollHeight : 0,
              document.documentElement.clientHeight
            );

            sendResponse({
              success: true,
              actualY: window.scrollY,
              scrollHeight: actualScrollHeight
            });
          });
        }, 180);
        return true;
      }

      case 'UPDATE_FLOATING_BANNER': {
        updateFloatingBanner(request.step, request.totalSteps);
        sendResponse({ success: true });
        return true;
      }

      case 'HIDE_BANNER': {
        hideFloatingBanner();
        // Wait two animation frames so Chromium commits the hidden banner before captureVisibleTab
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            sendResponse({ success: true });
          });
        });
        return true;
      }

      case 'SHOW_BANNER': {
        showFloatingBanner();
        sendResponse({ success: true });
        return true;
      }

      case 'RESTORE_PAGE': {
        removeFloatingBanner();
        restoreFixedAndStickyElements();
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
