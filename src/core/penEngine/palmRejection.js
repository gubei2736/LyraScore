/**
 * 平板手写笔严格防误触与多点手势调度器 (Strict Palm Rejection & Gesture Dispatcher)
 */

export class PalmRejectionManager {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.options = {
      onlyPenMode: true, // 仅允许手写笔画线，手指仅用于缩放和平移
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

    // 禁用默认浏览器手势与右键
    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', this.handlePointerDown.bind(this), { passive: false });
    el.addEventListener('pointermove', this.handlePointerMove.bind(this), { passive: false });
    el.addEventListener('pointerup', this.handlePointerUp.bind(this), { passive: false });
    el.addEventListener('pointercancel', this.handlePointerCancel.bind(this), { passive: false });
  }

  getPointerCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
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
    e.preventDefault();

    const isPen = e.pointerType === 'pen';
    const isMouse = e.pointerType === 'mouse';
    const isTouch = e.pointerType === 'touch';

    // 1. 如果手写笔下笔，直接进入书写状态（即使有手掌贴在屏幕上也优先忽略手掌）
    if (isPen || (isMouse && e.button === 0) || (!this.options.onlyPenMode && isTouch)) {
      this.isPenDrawing = true;
      this.canvas.setPointerCapture(e.pointerId);
      const coords = this.getPointerCoords(e);
      this.options.onPenDown(coords, e);
      return;
    }

    // 2. 触控模式 (用于多指平移与捏合缩放)
    if (isTouch) {
      this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // 双指触控
      if (this.activeTouches.size === 2) {
        const touches = Array.from(this.activeTouches.values());
        this.lastTouchDistance = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
        this.lastTouchCenter = {
          x: (touches[0].x + touches[1].x) / 2,
          y: (touches[0].y + touches[1].y) / 2
        };

        // 检查双指双击撤销
        const now = Date.now();
        if (now - this.lastTwoFingerTapTime < 300) {
          this.options.onDoubleTapTwoFingers();
          this.lastTwoFingerTapTime = 0;
        } else {
          this.lastTwoFingerTapTime = now;
        }
      }
    }
  }

  handlePointerMove(e) {
    e.preventDefault();

    if (this.isPenDrawing) {
      // 提取高采样率下的合并采样事件 (Coalesced Events)
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      const points = events.map(ev => this.getPointerCoords(ev));
      this.options.onPenMove(points, e);
      return;
    }

    // 处理双指缩放与平移
    if (e.pointerType === 'touch' && this.activeTouches.has(e.pointerId)) {
      this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activeTouches.size === 2) {
        const touches = Array.from(this.activeTouches.values());
        const currentDist = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
        const currentCenter = {
          x: (touches[0].x + touches[1].x) / 2,
          y: (touches[0].y + touches[1].y) / 2
        };

        if (this.lastTouchDistance && this.lastTouchDistance > 10) {
          const zoomDelta = currentDist / this.lastTouchDistance;
          this.options.onGestureZoom(zoomDelta, currentCenter);
        }

        if (this.lastTouchCenter) {
          const dx = currentCenter.x - this.lastTouchCenter.x;
          const dy = currentCenter.y - this.lastTouchCenter.y;
          this.options.onGesturePan(dx, dy);
        }

        this.lastTouchDistance = currentDist;
        this.lastTouchCenter = currentCenter;
      }
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
