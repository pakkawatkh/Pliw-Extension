// preview/cropper-engine.js - Lightweight Pure JS Cropping Engine

class CropperEngine {
  constructor(overlayEl, cropBoxEl, wrapperEl, onCropChange) {
    this.overlay = overlayEl;
    this.cropBox = cropBoxEl;
    this.wrapper = wrapperEl;
    this.onCropChange = onCropChange;

    this.active = false;
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
    // Mouse down on overlay to start new crop
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
    if (defaultRect) {
      this.boxX = defaultRect.x;
      this.boxY = defaultRect.y;
      this.boxW = defaultRect.w;
      this.boxH = defaultRect.h;
    } else {
      // Default to 80% centered box
      this.boxW = Math.round(wrapperRect.width * 0.8);
      this.boxH = Math.min(Math.round(wrapperRect.height * 0.5), 600);
      this.boxX = Math.round((wrapperRect.width - this.boxW) / 2);
      this.boxY = 40;
    }

    this.updateCropBoxDOM();
  }

  stop() {
    this.active = false;
    this.overlay.classList.add('hidden');
  }

  startDraw(e) {
    const rect = this.wrapper.getBoundingClientRect();
    this.startX = e.clientX - rect.left;
    this.startY = e.clientY - rect.top;
    this.boxX = this.startX;
    this.boxY = this.startY;
    this.boxW = 0;
    this.boxH = 0;
    this.isResizing = true;
    this.currentHandle = 'se';
    this.updateCropBoxDOM();
  }

  startDrag(e) {
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.initialBoxX = this.boxX;
    this.initialBoxY = this.boxY;
  }

  startResize(e, handle) {
    this.isResizing = true;
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

    if (this.isDragging) {
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;

      let newX = this.initialBoxX + dx;
      let newY = this.initialBoxY + dy;

      // Constrain within wrapper
      newX = Math.max(0, Math.min(newX, wrapperRect.width - this.boxW));
      newY = Math.max(0, Math.min(newY, wrapperRect.height - this.boxH));

      this.boxX = newX;
      this.boxY = newY;
      this.updateCropBoxDOM();
    } else if (this.isResizing) {
      const curX = e.clientX - wrapperRect.left;
      const curY = e.clientY - wrapperRect.top;

      let x = this.boxX;
      let y = this.boxY;
      let w = this.boxW;
      let h = this.boxH;

      if (this.currentHandle.includes('e')) {
        w = Math.max(20, Math.min(curX - x, wrapperRect.width - x));
      }
      if (this.currentHandle.includes('s')) {
        h = Math.max(20, Math.min(curY - y, wrapperRect.height - y));
      }
      if (this.currentHandle.includes('w')) {
        const right = this.initialBoxX + this.initialBoxW;
        const newX = Math.max(0, Math.min(curX, right - 20));
        x = newX;
        w = right - newX;
      }
      if (this.currentHandle.includes('n')) {
        const bottom = this.initialBoxY + this.initialBoxH;
        const newY = Math.max(0, Math.min(curY, bottom - 20));
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
