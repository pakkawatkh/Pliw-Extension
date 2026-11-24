// preview/cropper-engine.js - Lightweight Pure JS Cropping Engine

class CropperEngine {
  constructor(overlayEl, cropBoxEl, wrapperEl, onCropChange) {
    this.overlay = overlayEl;
    this.cropBox = cropBoxEl;
    this.wrapper = wrapperEl;
    this.onCropChange = onCropChange;

    this.active = false;
    this.isDrawing = false;
    this.isDragging = false;
    this.isResizing = false;
    this.currentHandle = null;

    this.startX = 0;
    this.startY = 0;
    this.boxX = 0;
    this.boxY = 0;
    this.boxW = 0;
    this.boxH = 0;

    this.initEvents();
  }

  initEvents() {
    // Mouse down on overlay to start new crop in any direction
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('crop-handle') || e.target === this.cropBox) return;
      this.startDraw(e);
    });

    // Mouse down on handles for resizing
    this.cropBox.querySelectorAll('.crop-handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.startResize(e, handle.dataset.handle);
      });
    });

    // Mouse down inside crop box to drag/move
    this.cropBox.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('crop-handle')) return;
      e.stopPropagation();
      this.startDrag(e);
    });

    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', () => this.onMouseUp());
  }

  start(defaultRect) {
    this.active = true;
    this.overlay.classList.remove('hidden');

    const wrapperRect = this.wrapper.getBoundingClientRect();
    const maxW = Math.max(1, wrapperRect.width);
    const maxH = Math.max(1, wrapperRect.height);

    if (defaultRect) {
      this.boxX = Math.max(0, Math.min(defaultRect.x, maxW - 10));
      this.boxY = Math.max(0, Math.min(defaultRect.y, maxH - 10));
      this.boxW = Math.max(10, Math.min(defaultRect.w, maxW - this.boxX));
      this.boxH = Math.max(10, Math.min(defaultRect.h, maxH - this.boxY));
    } else {
      // Default to centered 80% box safely clamped inside short or narrow images
      this.boxW = Math.max(10, Math.round(maxW * 0.8));
      this.boxH = Math.max(10, Math.min(Math.round(maxH * 0.6), 600));
      this.boxX = Math.max(0, Math.round((maxW - this.boxW) / 2));
      const preferredY = Math.min(40, Math.round((maxH - this.boxH) / 2));
      this.boxY = Math.max(0, Math.min(preferredY, maxH - this.boxH));
    }

    this.updateCropBoxDOM();
  }

  stop() {
    this.active = false;
    this.isDrawing = false;
    this.isDragging = false;
    this.isResizing = false;
    this.currentHandle = null;
    this.overlay.classList.add('hidden');
  }

  // Keep crop selection aligned proportionally when the wrapper is zoomed
  rescale(prevWidth, prevHeight, nextWidth, nextHeight) {
    if (!this.active || !prevWidth || !prevHeight || !nextWidth || !nextHeight) return;
    const ratioX = nextWidth / prevWidth;
    const ratioY = nextHeight / prevHeight;

    this.boxX = Math.max(0, Math.min(Math.round(this.boxX * ratioX), nextWidth - 10));
    this.boxY = Math.max(0, Math.min(Math.round(this.boxY * ratioY), nextHeight - 10));
    this.boxW = Math.max(10, Math.min(Math.round(this.boxW * ratioX), nextWidth - this.boxX));
    this.boxH = Math.max(10, Math.min(Math.round(this.boxH * ratioY), nextHeight - this.boxY));
    this.updateCropBoxDOM();
  }

  startDraw(e) {
    const rect = this.wrapper.getBoundingClientRect();
    this.startX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    this.startY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    this.boxX = Math.round(this.startX);
    this.boxY = Math.round(this.startY);
    this.boxW = 0;
    this.boxH = 0;
    this.isDrawing = true;
    this.isResizing = false;
    this.isDragging = false;
    this.updateCropBoxDOM();
  }

  startDrag(e) {
    this.isDragging = true;
    this.isDrawing = false;
    this.isResizing = false;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.initialBoxX = this.boxX;
    this.initialBoxY = this.boxY;
  }

  startResize(e, handle) {
    this.isResizing = true;
    this.isDrawing = false;
    this.isDragging = false;
    this.currentHandle = handle;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;
    this.initialBoxX = this.boxX;
    this.initialBoxY = this.boxY;
    this.initialBoxW = this.boxW;
    this.initialBoxH = this.boxH;
  }

  onMouseMove(e) {
    if (!this.active) return;
    const wrapperRect = this.wrapper.getBoundingClientRect();

    if (this.isDrawing) {
      const curX = Math.max(0, Math.min(e.clientX - wrapperRect.left, wrapperRect.width));
      const curY = Math.max(0, Math.min(e.clientY - wrapperRect.top, wrapperRect.height));

      this.boxX = Math.round(Math.min(this.startX, curX));
      this.boxY = Math.round(Math.min(this.startY, curY));
      this.boxW = Math.round(Math.abs(curX - this.startX));
      this.boxH = Math.round(Math.abs(curY - this.startY));
      this.updateCropBoxDOM();
    } else if (this.isDragging) {
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;

      let newX = this.initialBoxX + dx;
      let newY = this.initialBoxY + dy;

      // Constrain within wrapper
      newX = Math.max(0, Math.min(newX, wrapperRect.width - this.boxW));
      newY = Math.max(0, Math.min(newY, wrapperRect.height - this.boxH));

      this.boxX = Math.round(newX);
      this.boxY = Math.round(newY);
      this.updateCropBoxDOM();
    } else if (this.isResizing) {
      const curX = e.clientX - wrapperRect.left;
      const curY = e.clientY - wrapperRect.top;

      let x = this.boxX;
      let y = this.boxY;
      let w = this.boxW;
      let h = this.boxH;

      const minSize = Math.min(20, wrapperRect.width, wrapperRect.height);

      if (this.currentHandle.includes('e')) {
        w = Math.max(minSize, Math.min(curX - x, wrapperRect.width - x));
      }
      if (this.currentHandle.includes('s')) {
        h = Math.max(minSize, Math.min(curY - y, wrapperRect.height - y));
      }
      if (this.currentHandle.includes('w')) {
        const right = this.initialBoxX + this.initialBoxW;
        const newX = Math.max(0, Math.min(curX, right - minSize));
        x = newX;
        w = right - newX;
      }
      if (this.currentHandle.includes('n')) {
        const bottom = this.initialBoxY + this.initialBoxH;
        const newY = Math.max(0, Math.min(curY, bottom - minSize));
        y = newY;
        h = bottom - newY;
      }

      this.boxX = Math.round(x);
      this.boxY = Math.round(y);
      this.boxW = Math.round(w);
      this.boxH = Math.round(h);
      this.updateCropBoxDOM();
    }
  }

  onMouseUp() {
    this.isDrawing = false;
    this.isDragging = false;
    this.isResizing = false;
    this.currentHandle = null;
  }

  updateCropBoxDOM() {
    this.cropBox.style.left = `${this.boxX}px`;
    this.cropBox.style.top = `${this.boxY}px`;
    this.cropBox.style.width = `${this.boxW}px`;
    this.cropBox.style.height = `${this.boxH}px`;

    if (this.onCropChange) {
      this.onCropChange({
        displayX: this.boxX,
        displayY: this.boxY,
        displayWidth: this.boxW,
        displayHeight: this.boxH
      });
    }
  }
}
