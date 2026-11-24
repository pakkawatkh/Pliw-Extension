// preview/annotation-engine.js - Vector & Freehand Annotation Engine

class AnnotationEngine {
  constructor(annotationCanvas, mainCanvas, wrapperEl, callbacks = {}) {
    this.canvas = annotationCanvas;
    this.ctx = annotationCanvas.getContext('2d');
    this.mainCanvas = mainCanvas;
    this.wrapper = wrapperEl;
    this.callbacks = callbacks;

    this.active = false;
    this.tool = 'pen'; // pen | highlighter | arrow | rect | ellipse | line | text | blur | eraser
    this.color = '#ef4444';
    this.lineWidth = 4;

    this.items = [];
    this.redoStack = [];
    this.currentItem = null;
    this.isDrawing = false;

    this.activeTextEditor = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    this.initEvents();
  }

  initEvents() {
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
  }

  syncSize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.render();
  }

  start() {
    this.active = true;
    this.canvas.classList.add('drawing-active');
    this.updateCursor();
    this._notifyState();
  }

  stop() {
    this.commitTextEditor();
    this.active = false;
    this.isDrawing = false;
    this.currentItem = null;
    this.canvas.classList.remove('drawing-active');
    this.canvas.style.cursor = 'default';
    this.render();
    this._notifyState();
  }

  setTool(tool) {
    this.commitTextEditor();
    this.tool = tool;
    this.updateCursor();
    this._notifyState();
  }

  setColor(color) {
    this.color = color;
    if (this.activeTextEditor) {
      this.activeTextEditor.input.style.color = color;
    }
    this._notifyState();
  }

  setLineWidth(width) {
    this.lineWidth = Math.max(1, Math.min(48, Number(width) || 4));
    this._notifyState();
  }

  updateCursor() {
    if (!this.active) {
      this.canvas.style.cursor = 'default';
      return;
    }
    if (this.tool === 'text') {
      this.canvas.style.cursor = 'text';
    } else if (this.tool === 'eraser') {
      this.canvas.style.cursor = 'cell';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
  }

  hasAnnotations() {
    return this.items.length > 0;
  }

  canUndo() {
    return this.items.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    this.commitTextEditor();
    if (this.items.length === 0) return false;
    const item = this.items.pop();
    this.redoStack.push(item);
    this.render();
    this._notifyState();
    return true;
  }

  redo() {
    this.commitTextEditor();
    if (this.redoStack.length === 0) return false;
    const item = this.redoStack.pop();
    this.items.push(item);
    this.render();
    this._notifyState();
    return true;
  }

  clear() {
    this.commitTextEditor();
    if (this.items.length === 0) return;
    this.items = [];
    this.redoStack = [];
    this.currentItem = null;
    this.render();
    this._notifyState();
  }

  getCanvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: Math.max(0, Math.min(this.canvas.width, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(this.canvas.height, (e.clientY - rect.top) * scaleY))
    };
  }

  getDisplayScale() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !this.canvas.width) return 1;
    return this.canvas.width / rect.width;
  }

  _onPointerDown(e) {
    if (!this.active || e.button !== 0) return;

    // If clicking while a text editor is open, commit it first
    if (this.activeTextEditor) {
      this.commitTextEditor();
      if (this.tool === 'text') return;
    }

    e.preventDefault();
    const pt = this.getCanvasPoint(e);
    const scaleFactor = Math.max(1, this.getDisplayScale());

    if (this.tool === 'text') {
      this._openTextEditor(pt, scaleFactor);
      return;
    }

    this.isDrawing = true;
    const scaledWidth = Math.max(1, Math.round(this.lineWidth * scaleFactor * 10) / 10);

    if (this.tool === 'pen' || this.tool === 'highlighter' || this.tool === 'eraser') {
      const widthMult = this.tool === 'highlighter' ? 4 : (this.tool === 'eraser' ? 3.5 : 1);
      this.currentItem = {
        type: this.tool,
        color: this.color,
        lineWidth: scaledWidth * widthMult,
        points: [pt]
      };
    } else {
      // arrow | rect | ellipse | line | blur
      this.currentItem = {
        type: this.tool,
        color: this.color,
        lineWidth: scaledWidth,
        startX: pt.x,
        startY: pt.y,
        endX: pt.x,
        endY: pt.y
      };
    }

    this.render();
  }

  _onPointerMove(e) {
    if (!this.isDrawing || !this.currentItem) return;
    const pt = this.getCanvasPoint(e);

    if (this.currentItem.points) {
      const last = this.currentItem.points[this.currentItem.points.length - 1];
      const dx = pt.x - last.x;
      const dy = pt.y - last.y;
      if (dx * dx + dy * dy >= 2) {
        this.currentItem.points.push(pt);
        this.render();
      }
    } else {
      let endX = pt.x;
      let endY = pt.y;

      if (e.shiftKey) {
        const dx = endX - this.currentItem.startX;
        const dy = endY - this.currentItem.startY;
        if (this.currentItem.type === 'rect' || this.currentItem.type === 'ellipse' || this.currentItem.type === 'blur') {
          const size = Math.max(Math.abs(dx), Math.abs(dy));
          endX = this.currentItem.startX + Math.sign(dx || 1) * size;
          endY = this.currentItem.startY + Math.sign(dy || 1) * size;
        } else if (this.currentItem.type === 'line' || this.currentItem.type === 'arrow') {
          const angle = Math.atan2(dy, dx);
          const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const dist = Math.hypot(dx, dy);
          endX = this.currentItem.startX + Math.cos(snapped) * dist;
          endY = this.currentItem.startY + Math.sin(snapped) * dist;
        }
      }

      this.currentItem.endX = Math.max(0, Math.min(this.canvas.width, endX));
      this.currentItem.endY = Math.max(0, Math.min(this.canvas.height, endY));
      this.render();
    }
  }

  _onPointerUp() {
    if (!this.isDrawing || !this.currentItem) return;
    this.isDrawing = false;

    const item = this.currentItem;
    this.currentItem = null;

    let isValid = false;
    if (item.points) {
      isValid = item.points.length >= 1;
    } else {
      const dist = Math.hypot(item.endX - item.startX, item.endY - item.startY);
      isValid = dist >= 4;
    }

    if (isValid) {
      this.items.push(item);
      this.redoStack = [];
    }

    this.render();
    this._notifyState();
  }

  _openTextEditor(canvasPt, scaleFactor) {
    this.commitTextEditor();

    const rect = this.canvas.getBoundingClientRect();
    const displayX = (canvasPt.x / this.canvas.width) * rect.width;
    const displayY = (canvasPt.y / this.canvas.height) * rect.height;

    const displayFontSize = Math.max(14, Math.min(64, Math.round(this.lineWidth * 3.5 + 10)));
    const canvasFontSize = Math.round(displayFontSize * scaleFactor);

    const input = document.createElement('textarea');
    input.className = 'annotation-text-input';
    input.rows = 1;
    input.placeholder = 'Type text...';
    input.style.left = `${Math.max(4, Math.min(displayX, rect.width - 140))}px`;
    input.style.top = `${Math.max(4, Math.min(displayY - displayFontSize * 0.6, rect.height - 40))}px`;
    input.style.color = this.color;
    input.style.fontSize = `${displayFontSize}px`;

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
      input.style.width = `${Math.max(120, Math.min(rect.width - 20, input.scrollWidth + 16))}px`;
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this._discardTextEditor();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        this.commitTextEditor();
      }
    });

    this.wrapper.appendChild(input);
    // Focus on next frame so pointerdown doesn't immediately blur it
    requestAnimationFrame(() => input.focus());

    this.activeTextEditor = {
      input,
      x: canvasPt.x,
      y: canvasPt.y,
      fontSize: canvasFontSize
    };
  }

  _discardTextEditor() {
    if (!this.activeTextEditor) return;
    this.activeTextEditor.input.remove();
    this.activeTextEditor = null;
  }

  commitTextEditor() {
    if (!this.activeTextEditor) return;
    const { input, x, y, fontSize } = this.activeTextEditor;
    const text = input.value.trim();
    input.remove();
    this.activeTextEditor = null;

    if (text) {
      this.items.push({
        type: 'text',
        color: this.color,
        fontSize,
        x,
        y,
        text
      });
      this.redoStack = [];
      this.render();
      this._notifyState();
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const item of this.items) {
      this._drawItem(ctx, item);
    }
    if (this.currentItem) {
      this._drawItem(ctx, this.currentItem);
    }
  }

  _drawItem(ctx, item) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (item.type) {
      case 'pen':
        this._drawSmoothPath(ctx, item.points, item.color, item.lineWidth, 1.0, 'source-over');
        break;
      case 'highlighter':
        this._drawSmoothPath(ctx, item.points, item.color, item.lineWidth, 0.36, 'source-over');
        break;
      case 'eraser':
        this._drawSmoothPath(ctx, item.points, '#000000', item.lineWidth, 1.0, 'destination-out');
        break;
      case 'line':
        ctx.strokeStyle = item.color;
        ctx.lineWidth = item.lineWidth;
        ctx.beginPath();
        ctx.moveTo(item.startX, item.startY);
        ctx.lineTo(item.endX, item.endY);
        ctx.stroke();
        break;
      case 'arrow':
        this._drawArrow(ctx, item.startX, item.startY, item.endX, item.endY, item.color, item.lineWidth);
        break;
      case 'rect': {
        const x = Math.min(item.startX, item.endX);
        const y = Math.min(item.startY, item.endY);
        const w = Math.abs(item.endX - item.startX);
        const h = Math.abs(item.endY - item.startY);
        ctx.strokeStyle = item.color;
        ctx.lineWidth = item.lineWidth;
        ctx.strokeRect(x, y, w, h);
        break;
      }
      case 'ellipse': {
        const cx = (item.startX + item.endX) / 2;
        const cy = (item.startY + item.endY) / 2;
        const rx = Math.abs(item.endX - item.startX) / 2;
        const ry = Math.abs(item.endY - item.startY) / 2;
        ctx.strokeStyle = item.color;
        ctx.lineWidth = item.lineWidth;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'blur':
        this._drawPixelate(ctx, item.startX, item.startY, item.endX, item.endY);
        break;
      case 'text':
        this._drawText(ctx, item);
        break;
    }

    ctx.restore();
  }

  _drawSmoothPath(ctx, points, color, lineWidth, alpha, compositeOp) {
    if (!points || points.length === 0) return;
    ctx.globalCompositeOperation = compositeOp;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  _drawArrow(ctx, x1, y1, x2, y2, color, lineWidth) {
    const headLen = Math.max(12, lineWidth * 3.8);
    const angle = Math.atan2(y2 - y1, x2 - x1);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;

    // Shorten shaft slightly so it meets the arrowhead cleanly
    const shaftEndX = x2 - Math.cos(angle) * (headLen * 0.65);
    const shaftEndY = y2 - Math.sin(angle) * (headLen * 0.65);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(shaftEndX, shaftEndY);
    ctx.stroke();

    // Filled triangular arrowhead
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6.5),
      y2 - headLen * Math.sin(angle - Math.PI / 6.5)
    );
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6.5),
      y2 - headLen * Math.sin(angle + Math.PI / 6.5)
    );
    ctx.closePath();
    ctx.fill();
  }

  _drawPixelate(ctx, x1, y1, x2, y2) {
    const x = Math.max(0, Math.floor(Math.min(x1, x2)));
    const y = Math.max(0, Math.floor(Math.min(y1, y2)));
    const w = Math.min(this.mainCanvas.width - x, Math.ceil(Math.abs(x2 - x1)));
    const h = Math.min(this.mainCanvas.height - y, Math.ceil(Math.abs(y2 - y1)));
    if (w < 4 || h < 4) return;

    const pixelSize = Math.max(8, Math.round(Math.min(w, h) / 10), Math.round(this.mainCanvas.width / 120));
    const smallW = Math.max(1, Math.ceil(w / pixelSize));
    const smallH = Math.max(1, Math.ceil(h / pixelSize));

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = smallW;
    tempCanvas.height = smallH;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.imageSmoothingEnabled = true;
    tCtx.drawImage(this.mainCanvas, x, y, w, h, 0, 0, smallW, smallH);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, smallW, smallH, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
  }

  _drawText(ctx, item) {
    const lines = item.text.split('\n');
    const lineHeight = item.fontSize * 1.28;
    ctx.font = `700 ${item.fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif`;
    ctx.textBaseline = 'top';

    const isLight = this._isLightColor(item.color);
    const strokeColor = isLight ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)';

    lines.forEach((line, idx) => {
      const ly = item.y + idx * lineHeight;
      ctx.lineWidth = Math.max(3, item.fontSize * 0.14);
      ctx.strokeStyle = strokeColor;
      ctx.strokeText(line, item.x, ly);
      ctx.fillStyle = item.color;
      ctx.fillText(line, item.x, ly);
    });
  }

  _isLightColor(hex) {
    if (!hex || !hex.startsWith('#') || hex.length < 7) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 186;
  }

  /**
   * Returns a single composited canvas combining mainCanvas + annotationCanvas.
   * If there are no annotations, returns mainCanvas directly to avoid extra work.
   */
  getCompositedCanvas() {
    this.commitTextEditor();
    if (!this.hasAnnotations()) {
      return this.mainCanvas;
    }
    const merged = document.createElement('canvas');
    merged.width = this.mainCanvas.width;
    merged.height = this.mainCanvas.height;
    const mCtx = merged.getContext('2d');
    mCtx.drawImage(this.mainCanvas, 0, 0);
    mCtx.drawImage(this.canvas, 0, 0);
    return merged;
  }

  _notifyState() {
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange({
        active: this.active,
        tool: this.tool,
        color: this.color,
        lineWidth: this.lineWidth,
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
        hasAnnotations: this.hasAnnotations()
      });
    }
  }
}
