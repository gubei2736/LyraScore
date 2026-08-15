/**
 * StrokeRenderer - 顶级手写笔墨水渲染与图层控制器
 * 包含低延迟硬件直通、Perfect Freehand 笔锋生成、多笔刷、橡皮擦与历史栈
 */

import { getStroke, renderStrokeToContext } from './perfectFreehand.js';
import { renderStampToContext } from './stamps.js';
import { PalmRejectionManager } from './palmRejection.js';

export class StrokeRenderer {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', {
      desynchronized: true, // 启用低延迟硬件直通管线
      alpha: true
    });

    this.options = {
      scoreId: options.scoreId || 'default',
      pageIndex: options.pageIndex || 0,
      onChange: options.onChange || (() => {}),
      ...options
    };

    // 当前笔刷配置
    this.brush = {
      tool: 'fountain', // 'fountain' | 'ballpoint' | 'highlighter' | 'eraser' | 'stamp' | 'line' | 'text'
      color: '#1a56db',
      size: 4,
      opacity: 1.0,
      stamp: null, // 当前选中的音乐记号
      snapToStraightLine: true // 是否开启长按直线自动吸附
    };

    // 矢量笔画列表与撤销重做栈
    this.strokes = [];
    this.undoStack = [];

    // 当前正在绘制的笔画临时数据
    this.currentRawPoints = [];
    this.isDrawing = false;
    this.strokeStartTime = 0;
    this.holdTimer = null;
    this.isSnappedToLine = false;

    // 初始化防误触与触控事件
    this.palmManager = new PalmRejectionManager(this.canvas, {
      onPenDown: this.onPenDown.bind(this),
      onPenMove: this.onPenMove.bind(this),
      onPenUp: this.onPenUp.bind(this),
      onDoubleTapTwoFingers: () => this.undo()
    });

    this.resizeToParent();
  }

  setBrush(config) {
    this.brush = { ...this.brush, ...config };
  }

  resizeToParent(width, height) {
    const w = width || this.canvas.parentElement?.clientWidth || 800;
    const h = height || this.canvas.parentElement?.clientHeight || 1130;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.redraw();
    }
  }

  onPenDown(pt, originalEvent) {
    this.isDrawing = true;
    this.isSnappedToLine = false;
    this.strokeStartTime = Date.now();
    this.currentRawPoints = [[pt.x, pt.y, pt.pressure]];

    if (this.brush.tool === 'stamp' && this.brush.stamp) {
      // 印章模式：单次点击直接盖印
      const stampItem = {
        type: 'stamp',
        x: pt.x,
        y: pt.y,
        color: this.brush.color,
        fontSize: this.brush.stamp.fontSize || 24,
        symbol: this.brush.stamp.symbol,
        altText: this.brush.stamp.altText,
        isFingering: this.brush.stamp.isFingering,
        id: 'stamp_' + Date.now()
      };
      this.addStroke(stampItem);
      this.isDrawing = false;
      return;
    }

    if (this.brush.tool === 'eraser') {
      this.eraseAtPoint(pt.x, pt.y, this.brush.size * 5);
      return;
    }

    // 智能直线吸附长按计时器 (在同一位置停留 450ms 自动转为笔直直线)
    if (this.brush.snapToStraightLine && (this.brush.tool === 'fountain' || this.brush.tool === 'highlighter' || this.brush.tool === 'ballpoint' || this.brush.tool === 'line')) {
      clearTimeout(this.holdTimer);
      this.holdTimer = setTimeout(() => {
        if (this.isDrawing && this.currentRawPoints.length > 3) {
          this.isSnappedToLine = true;
          this.drawCurrentLive();
        }
      }, 450);
    }
  }

  onPenMove(points, originalEvent) {
    if (!this.isDrawing) return;

    if (this.brush.tool === 'eraser') {
      for (const pt of points) {
        this.eraseAtPoint(pt.x, pt.y, this.brush.size * 5);
      }
      return;
    }

    for (const pt of points) {
      this.currentRawPoints.push([pt.x, pt.y, pt.pressure]);
    }

    this.drawCurrentLive();
  }

  onPenUp(pt, originalEvent) {
    clearTimeout(this.holdTimer);
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.brush.tool === 'eraser') {
      this.options.onChange(this.strokes);
      return;
    }

    if (this.currentRawPoints.length === 0) return;

    let finalPoints = this.currentRawPoints;

    // 如果触发了直线吸附或当前是直线工具
    if (this.isSnappedToLine || this.brush.tool === 'line') {
      const p0 = finalPoints[0];
      const pn = finalPoints[finalPoints.length - 1];
      // 线性生成几个等距点
      finalPoints = [
        [p0[0], p0[1], p0[2]],
        [p0[0] * 0.5 + pn[0] * 0.5, p0[1] * 0.5 + pn[1] * 0.5, 0.5],
        [pn[0], pn[1], pn[2]]
      ];
    }

    const strokeItem = {
      id: 'str_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      type: 'stroke',
      tool: this.brush.tool,
      color: this.brush.color,
      size: this.brush.size,
      opacity: this.brush.tool === 'highlighter' ? 0.45 : this.brush.opacity,
      points: finalPoints,
      isStraight: this.isSnappedToLine || this.brush.tool === 'line'
    };

    this.addStroke(strokeItem);
    this.currentRawPoints = [];
    this.isSnappedToLine = false;
  }

  addStroke(strokeItem) {
    this.strokes.push(strokeItem);
    this.undoStack = []; // 清空重做栈
    this.redraw();
    this.options.onChange(this.strokes);
  }

  undo() {
    if (this.strokes.length === 0) return false;
    const popped = this.strokes.pop();
    this.undoStack.push(popped);
    this.redraw();
    this.options.onChange(this.strokes);
    return true;
  }

  redo() {
    if (this.undoStack.length === 0) return false;
    const item = this.undoStack.pop();
    this.strokes.push(item);
    this.redraw();
    this.options.onChange(this.strokes);
    return true;
  }

  clear() {
    if (this.strokes.length === 0) return;
    this.undoStack.push(...this.strokes);
    this.strokes = [];
    this.redraw();
    this.options.onChange(this.strokes);
  }

  eraseAtPoint(x, y, radius = 20) {
    const beforeCount = this.strokes.length;
    this.strokes = this.strokes.filter(st => {
      if (st.type === 'stamp') {
        return Math.hypot(st.x - x, st.y - y) > radius + 15;
      }
      if (st.type === 'stroke' && st.points) {
        // 检查任一点是否在橡皮擦圆形范围内
        for (const pt of st.points) {
          if (Math.hypot(pt[0] - x, pt[1] - y) < radius) {
            return false; // 移除整条笔画
          }
        }
      }
      return true;
    });

    if (this.strokes.length !== beforeCount) {
      this.redraw();
    }
  }

  drawCurrentLive() {
    this.redraw();
    if (this.currentRawPoints.length < 1) return;

    let pointsToRender = this.currentRawPoints;
    if (this.isSnappedToLine || this.brush.tool === 'line') {
      const p0 = pointsToRender[0];
      const pn = pointsToRender[pointsToRender.length - 1];
      pointsToRender = [
        [p0[0], p0[1], p0[2]],
        [p0[0] * 0.5 + pn[0] * 0.5, p0[1] * 0.5 + pn[1] * 0.5, 0.5],
        [pn[0], pn[1], pn[2]]
      ];
    }

    const tool = this.brush.tool;
    const isHighlighter = tool === 'highlighter';
    const isFountain = tool === 'fountain';

    const strokeOptions = {
      size: isHighlighter ? this.brush.size * 3.5 : this.brush.size,
      thinning: isFountain ? 0.6 : 0.05,
      smoothing: 0.65,
      streamline: 0.45,
      start: { taper: isFountain ? 15 : 0 },
      end: { taper: isFountain ? 20 : 0 }
    };

    const outline = getStroke(pointsToRender, strokeOptions);
    const compOp = isHighlighter ? 'multiply' : 'source-over';
    const color = isHighlighter
      ? hexToRgba(this.brush.color, 0.45)
      : this.brush.color;

    renderStrokeToContext(this.ctx, outline, color, compOp);
  }

  redraw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const item of this.strokes) {
      if (item.type === 'stamp') {
        renderStampToContext(this.ctx, item);
      } else if (item.type === 'stroke' && item.points) {
        const isHighlighter = item.tool === 'highlighter';
        const isFountain = item.tool === 'fountain';

        const strokeOptions = {
          size: isHighlighter ? item.size * 3.5 : item.size,
          thinning: isFountain ? 0.6 : 0.05,
          smoothing: 0.65,
          streamline: 0.45,
          start: { taper: isFountain ? 15 : 0 },
          end: { taper: isFountain ? 20 : 0 }
        };

        const outline = getStroke(item.points, strokeOptions);
        const compOp = isHighlighter ? 'multiply' : 'source-over';
        const color = isHighlighter
          ? hexToRgba(item.color, item.opacity || 0.45)
          : item.color;

        renderStrokeToContext(this.ctx, outline, color, compOp);
      }
    }
  }

  loadStrokes(strokesArray) {
    this.strokes = Array.isArray(strokesArray) ? [...strokesArray] : [];
    this.undoStack = [];
    this.redraw();
  }

  getStrokes() {
    return this.strokes;
  }

  destroy() {
    this.palmManager.destroy();
  }
}

function hexToRgba(hex, alpha = 1) {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
