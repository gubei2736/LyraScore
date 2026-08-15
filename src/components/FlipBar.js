/**
 * 顶部工具栏内嵌定时翻页控制器 (FlipBar Component)
 * 紧凑优雅地嵌入在阅读器顶部导航栏，包含倒计时动画与极简下拉设置弹窗
 */

import { appState } from '../core/state.js';

export class FlipBar {
  constructor(containerElement, autoFlipController) {
    this.container = containerElement;
    this.controller = autoFlipController;
    this.isSettingsOpen = false;

    this.render();
    this.bindEvents();

    this.controller.onProgress = (progress, remainingSec) => {
      this.updateProgress(progress, remainingSec);
    };

    appState.subscribe(() => {
      this.syncState();
    });
  }

  render() {
    const isRunning = appState.get('isAutoFlipping');
    const mode = appState.get('autoFlipMode');
    const intervalSec = appState.get('flipIntervalSec');
    const scrollSpeed = appState.get('scrollSpeed');

    this.container.innerHTML = `
      <div class="topbar-flip-widget ${isRunning ? 'running' : 'idle'}">
        <!-- 主播放/暂停按钮 -->
        <button class="topbar-flip-play-btn" id="flipMainToggleBtn" title="${isRunning ? '暂停自动翻页' : '开始自动翻页'}">
          <span class="flip-play-icon" id="flipCenterIcon">${isRunning ? '⏸' : '▶'}</span>
          <span class="flip-play-text" id="flipTimeCounter">
            ${mode === 'flip' ? `翻页 ${intervalSec}s` : `滚动 ${scrollSpeed}px`}
          </span>
        </button>

        <!-- 快速加减时长 -->
        <div class="topbar-flip-stepper">
          <button class="flip-step-btn" id="flipMinusBtn" title="减少时间 / 减速">-</button>
          <button class="flip-step-btn" id="flipPlusBtn" title="增加时间 / 加速">+</button>
        </div>

        <!-- 设置齿轮按钮 -->
        <button class="topbar-flip-gear-btn" id="flipSettingsToggleBtn" title="自动翻页设置">
          ⚙️
        </button>

        <!-- 下拉设置面板 (纯净无外设干扰) -->
        <div class="topbar-flip-popover ${this.isSettingsOpen ? 'open' : ''}" id="flipSettingsPopover">
          <div class="flip-popover-header">
            <span>⏱️ 自动翻页设置</span>
            <button class="stamp-close-btn" id="flipSettingsCloseBtn">✕</button>
          </div>

          <div class="setting-item">
            <label class="setting-label">翻页模式</label>
            <div class="segmented-control">
              <button class="seg-btn ${mode === 'flip' ? 'active' : ''}" data-mode="flip">定时整页</button>
              <button class="seg-btn ${mode === 'scroll' ? 'active' : ''}" data-mode="scroll">匀速平滑滚动</button>
            </div>
          </div>

          <div class="setting-item ${mode === 'flip' ? '' : 'hidden'}" id="flipIntervalSection">
            <label class="setting-label">单页停留时长: <strong id="intervalDisplay">${intervalSec}</strong> 秒</label>
            <input type="range" class="size-slider" id="flipIntervalSlider" min="3" max="120" step="1" value="${intervalSec}">
          </div>

          <div class="setting-item ${mode === 'scroll' ? '' : 'hidden'}" id="scrollSpeedSection">
            <label class="setting-label">平滑滚动速率: <strong id="speedDisplay">${scrollSpeed}</strong> px/s</label>
            <input type="range" class="size-slider" id="scrollSpeedSlider" min="10" max="150" step="5" value="${scrollSpeed}">
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    this.container.querySelector('#flipMainToggleBtn')?.addEventListener('click', () => {
      this.controller.toggle();
    });

    this.container.querySelector('#flipMinusBtn')?.addEventListener('click', () => {
      const mode = appState.get('autoFlipMode');
      if (mode === 'flip') {
        const cur = appState.get('flipIntervalSec');
        this.controller.setIntervalSec(cur - 2);
      } else {
        const cur = appState.get('scrollSpeed');
        this.controller.setScrollSpeed(cur - 5);
      }
    });

    this.container.querySelector('#flipPlusBtn')?.addEventListener('click', () => {
      const mode = appState.get('autoFlipMode');
      if (mode === 'flip') {
        const cur = appState.get('flipIntervalSec');
        this.controller.setIntervalSec(cur + 2);
      } else {
        const cur = appState.get('scrollSpeed');
        this.controller.setScrollSpeed(cur + 5);
      }
    });

    this.container.querySelector('#flipSettingsToggleBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isSettingsOpen = !this.isSettingsOpen;
      this.container.querySelector('#flipSettingsPopover')?.classList.toggle('open', this.isSettingsOpen);
    });

    this.container.querySelector('#flipSettingsCloseBtn')?.addEventListener('click', () => {
      this.isSettingsOpen = false;
      this.container.querySelector('#flipSettingsPopover')?.classList.remove('open');
    });

    this.container.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = btn.dataset.mode;
        this.controller.setMode(m);
        this.render();
        this.bindEvents();
      });
    });

    this.container.querySelector('#flipIntervalSlider')?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      this.controller.setIntervalSec(v);
      const disp = this.container.querySelector('#intervalDisplay');
      if (disp) disp.textContent = v;
    });

    this.container.querySelector('#scrollSpeedSlider')?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      this.controller.setScrollSpeed(v);
      const disp = this.container.querySelector('#speedDisplay');
      if (disp) disp.textContent = v;
    });
  }

  updateProgress(progress, remainingSec) {
    const isRunning = appState.get('isAutoFlipping');
    const counter = this.container.querySelector('#flipTimeCounter');
    const icon = this.container.querySelector('#flipCenterIcon');

    if (isRunning) {
      if (counter) counter.textContent = `剩余 ${remainingSec}s`;
      if (icon) icon.textContent = '⏸';
    }
  }

  syncState() {
    const isRunning = appState.get('isAutoFlipping');
    const mode = appState.get('autoFlipMode');
    const intervalSec = appState.get('flipIntervalSec');
    const scrollSpeed = appState.get('scrollSpeed');

    const widget = this.container.querySelector('.topbar-flip-widget');
    if (widget) {
      widget.classList.toggle('running', isRunning);
      widget.classList.toggle('idle', !isRunning);
    }

    const icon = this.container.querySelector('#flipCenterIcon');
    if (icon && !isRunning) {
      icon.textContent = '▶';
    }

    const counter = this.container.querySelector('#flipTimeCounter');
    if (counter && !isRunning) {
      counter.textContent = mode === 'flip' ? `翻页 ${intervalSec}s` : `滚动 ${scrollSpeed}px`;
    }
  }
}
