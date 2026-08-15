/**
 * 平板手写笔严格防误触与多点手势调度器 (Strict Palm Rejection & Gesture Dispatcher)
 * 放通手指多点触控，手写笔绘制与手指双指缩放完美共存
 */

export class PalmRejectionManager {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.options = {
      onlyPenMode: true,
      onPenDown: options.onPenDown || (() => {}),
      onPenMove: options.onPenMove || (() => {}),
      onPenUp: options.onPenUp || (() => {}),
      onGestureZoom: options.onGestureZoom || (() => {}),
      onGesturePan: options.onGesturePan || (() => {}),
      onDoubleTapTwoFingers: options.onDoubleTapTwoFingers || (() => {}),
      ...options
    };

    this.activeTouches = new Map();
    this.isPenDrawing = false;
    this.lastTouchDistance = null;
    this.lastTouchCenter = null;
    this.lastTwoFingerTapTime = 0;

    this.bindEvents();
  }

  setOnlyPenMode(enabled) {
    this.options.onlyPenMode = enabled;
  }

  bindEvents() {
    const el = this.canvas;
    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', this.handlePointerDown.bind(this), { passive: false });
    el.addEventListener('pointermove', this.handlePointerMove.bind(this), { passive: false });
    el.addEventListener('pointerup', this.handlePointerUp.bind(this), { passive: false });
    el.addEventListener('pointercancel', this.handlePointerCancel.bind(this), { passive: false });
  }

  getPointerCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / (rect.width || 1);
    const scaleY = this.canvas.height / (rect.height || 1);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
      tiltX: e.tiltX || 0,
      tiltY: e.tiltY || 0,
      pointerType: e.pointerType
    };
  }

  handlePointerDown(e) {
    const isPen = e.pointerType === 'pen';
    const isMouse = e.pointerType === 'mouse';
    const isTouch = e.pointerType === 'touch';

    // 1. 手写笔模式：接管绘制并阻止默认事件
    if (isPen || (isMouse && e.button === 0) || (!this.options.onlyPenMode && isTouch)) {
      this.isPenDrawing = true;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch (_) {}
      e.preventDefault();
      const coords = this.getPointerCoords(e);
      this.options.onPenDown(coords, e);
      return;
    }

    // 2. 手指触控模式：放通事件供全局缩放与翻页手势引擎处理，不随意 preventDefault
    if (isTouch) {
      this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  }

  handlePointerMove(e) {
    if (this.isPenDrawing) {
      e.preventDefault();
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      const points = events.map(ev => this.getPointerCoords(ev));
      this.options.onPenMove(points, e);
      return;
    }

    if (e.pointerType === 'touch' && this.activeTouches.has(e.pointerId)) {
      this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  }

  handlePointerUp(e) {
    if (this.isPenDrawing) {
      this.isPenDrawing = false;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch (_) {}
      const coords = this.getPointerCoords(e);
      this.options.onPenUp(coords, e);
    }

    if (e.pointerType === 'touch') {
      this.activeTouches.delete(e.pointerId);
      if (this.activeTouches.size < 2) {
        this.lastTouchDistance = null;
        this.lastTouchCenter = null;
      }
    }
  }

  handlePointerCancel(e) {
    this.handlePointerUp(e);
  }

  destroy() {
    this.activeTouches.clear();
  }
}
