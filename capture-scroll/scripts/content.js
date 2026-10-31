// scripts/content.js - Scrolling Inspector & DOM Coordinator

(() => {
  // Prevent duplicate injection
  if (window.__tiffyCaptureScrollInjected) return;
  window.__tiffyCaptureScrollInjected = true;

  let originalScrollX = 0;
  let originalScrollY = 0;
  let hiddenFixedElements = [];
  let scrollbarStyleTag = null;

  // 1. Hide scrollbars completely during capture
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

  // 2. Locate fixed & sticky elements to prevent repeating headers
  function handleFixedElements(hide) {
    if (hide) {
      hiddenFixedElements = [];
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        // Only inspect visible elements within current viewport
        const style = window.getComputedStyle(el);
        if ((style.position === 'fixed' || style.position === 'sticky') && style.visibility !== 'hidden' && style.display !== 'none') {
          const rect = el.getBoundingClientRect();
          // Hide only if it sticks near top or covers screen
          if (rect.height > 0 && rect.width > 0) {
            hiddenFixedElements.push({
              element: el,
              originalVisibility: el.style.visibility
            });
            el.style.visibility = 'hidden';
          }
        }
      }
    } else {
      // Restore
      for (const item of hiddenFixedElements) {
        item.element.style.visibility = item.originalVisibility;
      }
      hiddenFixedElements = [];
    }
  }

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
          handleFixedElements(true);
        } else {
          handleFixedElements(false);
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

      case 'RESTORE_PAGE': {
        handleFixedElements(false);
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
