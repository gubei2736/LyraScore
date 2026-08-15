/**
 * 触控手势与缩放实时可视化诊断监视器 (Gesture Diagnostics HUD)
 * 实时监测屏幕触控点数、指间物理距离、放大倍率与事件传递状态
 */

export class GestureDiagnostics {
  constructor() {
    this.hudEl = null;
    this.canvasOverlay = null;
    this.ctx = null;
    this.touches = [];
    this.logInfo = {
      touchCount: 0,
      initialDist: 0,
      currentDist: 0,
      scale: 1.0,
      state: '待命',
      target: ''
    };

    this.initHUD();
    this.initCanvasOverlay();
  }

  initHUD() {
    const existing = document.getElementById('gestureHudWidget');
    if (existing) existing.remove();

    this.hudEl = document.createElement('div');
    this.hudEl.id = 'gestureHudWidget';
    this.hudEl.style.cssText = `
      position: fixed;
      top: 60px;
      right: 12px;
      z-index: 9999;
      background: rgba(17, 24, 39, 0.88);
      color: #38bdf8;
      font-family: monospace;
      font-size: 11px;
      padding: 8px 12px;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      backdrop-filter: blur(8px);
      pointer-events: none;
      line-height: 1.5;
      max-width: 260px;
      border: 1px solid rgba(56, 189, 248, 0.3);
    `;
    document.body.appendChild(this.hudEl);
    this.updateHUD();
  }

  initCanvasOverlay() {
    const existing = document.getElementById('gestureDebugCanvas');
    if (existing) existing.remove();

    this.canvasOverlay = document.createElement('canvas');
    this.canvasOverlay.id = 'gestureDebugCanvas';
    this.canvasOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 9998;
    `;
    document.body.appendChild(this.canvasOverlay);
    this.ctx = this.canvasOverlay.getContext('2d');

    const resize = () => {
      this.canvasOverlay.width = window.innerWidth;
      this.canvasOverlay.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();
  }

  update(info = {}, rawTouches = []) {
    this.logInfo = { ...this.logInfo, ...info };
    this.touches = Array.from(rawTouches).map(t => ({ x: t.clientX, y: t.clientY }));
    this.updateHUD();
    this.drawTouchRings();
  }

  updateHUD() {
    if (!this.hudEl) return;
    const { touchCount, initialDist, currentDist, scale, state, target } = this.logInfo;
    this.hudEl.innerHTML = `
      <div style="font-weight: bold; color: #facc15;">🔍 手势诊断 HUD</div>
      <div>触控指点: <span style="color: ${touchCount >= 2 ? '#4ade80' : '#ffffff'}; font-weight: bold;">${touchCount} 指</span></div>
      <div>初始指距: ${Math.round(initialDist)} px</div>
      <div>当前指距: ${Math.round(currentDist)} px</div>
      <div>缩放倍率: <span style="color: #f43f5e; font-weight: bold;">${Math.round(scale * 100)}%</span></div>
      <div>手势状态: <span style="color: #60a5fa;">${state}</span></div>
      <div style="color: #94a3b8; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">元素: ${target || '-'}</div>
    `;
  }

  drawTouchRings() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvasOverlay.width, this.canvasOverlay.height);

    if (this.touches.length === 0) return;

    this.ctx.save();
    // 绘制各指触摸光环
    this.touches.forEach((pt, idx) => {
      this.ctx.beginPath();
      this.ctx.arc(pt.x, pt.y, 28, 0, Math.PI * 2);
      this.ctx.fillStyle = idx === 0 ? 'rgba(56, 189, 248, 0.25)' : 'rgba(74, 222, 128, 0.25)';
      this.ctx.fill();
      this.ctx.strokeStyle = idx === 0 ? '#38bdf8' : '#4ade80';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '12px sans-serif';
      this.ctx.fillText(`P${idx + 1}`, pt.x - 8, pt.y + 4);
    });

    // 双指之间画连线与距离标注
    if (this.touches.length >= 2) {
      const p1 = this.touches[0];
      const p2 = this.touches[1];
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.strokeStyle = '#f43f5e';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.stroke();

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const dist = Math.round(Math.hypot(p1.x - p2.x, p1.y - p2.y));
      this.ctx.fillStyle = '#facc15';
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.fillText(`${dist}px`, midX + 6, midY - 6);
    }

    this.ctx.restore();
  }
}

export const gestureDiagnostics = new GestureDiagnostics();
