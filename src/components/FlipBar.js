/**
 * 顶部工具栏内嵌定时翻页控制器 (FlipBar Component)
 * 具备高辨识度模式切换选择卡、手动输入时长数字框与顶部胶囊实时联动
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
        <!-- 主播放/暂停按钮 (实时反映当前模式) -->
        <button class="topbar-flip-play-btn" id="flipMainToggleBtn" title="${isRunning ? '暂停自动翻页' : '开始自动翻页'}">
          <span class="flip-play-icon" id="flipCenterIcon">${isRunning ? '⏸' : '▶'}</span>
          <span class="flip-play-text" id="flipTimeCounter">
            ${mode === 'flip' ? `定时翻页: ${intervalSec}s` : `平滑滚动: ${scrollSpeed}px/s`}
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

        <!-- 下拉设置面板 -->
        <div class="topbar-flip-popover ${this.isSettingsOpen ? 'open' : ''}" id="flipSettingsPopover">
          <div class="flip-popover-header">
            <span>⏱️ 自动翻页设置</span>
            <button class="stamp-close-btn" id="flipSettingsCloseBtn">✕</button>
          </div>

          <!-- 高辨识度模式选择卡片组 -->
          <div class="flip-mode-cards-group">
            <div class="flip-mode-card ${mode === 'flip' ? 'selected' : ''}" data-mode="flip">
              <div class="mode-card-icon">📄</div>
              <div class="mode-card-info">
                <div class="mode-card-title">定时整页翻页</div>
                <div class="mode-card-desc">倒计时结束瞬间翻到下一页</div>
              </div>
              <div class="mode-card-radio-mark">
                ${mode === 'flip' ? '✓ 已选择' : '选择'}
              </div>
            </div>

            <div class="flip-mode-card ${mode === 'scroll' ? 'selected' : ''}" data-mode="scroll">
              <div class="mode-card-icon">📜</div>
              <div class="mode-card-info">
                <div class="mode-card-title">匀速平滑滚动</div>
                <div class="mode-card-desc">视口自上而下匀速平稳滑行</div>
              </div>
              <div class="mode-card-radio-mark">
                ${mode === 'scroll' ? '✓ 已选择' : '选择'}
              </div>
            </div>
          </div>

          <!-- 单页停留时长 (仅在定时整页模式下呈现) -->
          <div class="setting-item ${mode === 'flip' ? '' : 'hidden'}" id="flipIntervalSection">
            <div class="setting-input-header">
              <label class="setting-label">单页停留时长</label>
              <div class="setting-input-wrapper">
                <input type="number" class="manual-number-input" id="flipIntervalNumberInput" min="1" max="999" step="1" value="${intervalSec}">
                <span class="input-unit">秒</span>
              </div>
            </div>
            <input type="range" class="size-slider" id="flipIntervalSlider" min="2" max="120" step="1" value="${intervalSec}">
          </div>

          <!-- 平滑滚动速率 (仅在匀速滚动模式下呈现) -->
          <div class="setting-item ${mode === 'scroll' ? '' : 'hidden'}" id="scrollSpeedSection">
            <div class="setting-input-header">
              <label class="setting-label">平滑滚动速率</label>
              <div class="setting-input-wrapper">
                <input type="number" class="manual-number-input" id="scrollSpeedNumberInput" min="5" max="300" step="5" value="${scrollSpeed}">
                <span class="input-unit">px/s</span>
              </div>
            </div>
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
        this.updateInterval(cur - 2);
      } else {
        const cur = appState.get('scrollSpeed');
        this.updateScrollSpeed(cur - 5);
      }
    });

    this.container.querySelector('#flipPlusBtn')?.addEventListener('click', () => {
      const mode = appState.get('autoFlipMode');
      if (mode === 'flip') {
        const cur = appState.get('flipIntervalSec');
        this.updateInterval(cur + 2);
      } else {
        const cur = appState.get('scrollSpeed');
        this.updateScrollSpeed(cur + 5);
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

    // 点击模式卡片切换模式
    this.container.querySelectorAll('.flip-mode-card').forEach(card => {
      card.addEventListener('click', () => {
        const m = card.dataset.mode;
        this.controller.setMode(m);
        this.render();
        this.bindEvents();
      });
    });

    // 单页停留时长：手动数字输入框
    const numInput = this.container.querySelector('#flipIntervalNumberInput');
    numInput?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v) && v > 0) {
        this.controller.setIntervalSec(v);
        const slider = this.container.querySelector('#flipIntervalSlider');
        if (slider) slider.value = Math.min(Math.max(v, 2), 120);
        this.updateCapsuleText();
      }
    });

    // 单页停留时长：滑动条
    const slider = this.container.querySelector('#flipIntervalSlider');
    slider?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      this.updateInterval(v);
    });

    // 平滑滚动速率：手动数字输入框
    const speedNumInput = this.container.querySelector('#scrollSpeedNumberInput');
    speedNumInput?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v) && v > 0) {
        this.controller.setScrollSpeed(v);
        const spdSlider = this.container.querySelector('#scrollSpeedSlider');
        if (spdSlider) spdSlider.value = Math.min(Math.max(v, 10), 150);
        this.updateCapsuleText();
      }
    });

    // 平滑滚动速率：滑动条
    const spdSlider = this.container.querySelector('#scrollSpeedSlider');
    spdSlider?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      this.updateScrollSpeed(v);
    });
  }

  updateInterval(sec) {
    const safeSec = Math.max(1, sec);
    this.controller.setIntervalSec(safeSec);
    const numInput = this.container.querySelector('#flipIntervalNumberInput');
    const slider = this.container.querySelector('#flipIntervalSlider');
    if (numInput) numInput.value = safeSec;
    if (slider) slider.value = Math.min(Math.max(safeSec, 2), 120);
    this.updateCapsuleText();
  }

  updateScrollSpeed(speed) {
    const safeSpeed = Math.max(5, speed);
    this.controller.setScrollSpeed(safeSpeed);
    const numInput = this.container.querySelector('#scrollSpeedNumberInput');
    const slider = this.container.querySelector('#scrollSpeedSlider');
    if (numInput) numInput.value = safeSpeed;
    if (slider) slider.value = Math.min(Math.max(safeSpeed, 10), 150);
    this.updateCapsuleText();
  }

  updateCapsuleText() {
    const isRunning = appState.get('isAutoFlipping');
    if (isRunning) return;

    const mode = appState.get('autoFlipMode');
    const intervalSec = appState.get('flipIntervalSec');
    const scrollSpeed = appState.get('scrollSpeed');
    const counter = this.container.querySelector('#flipTimeCounter');

    if (counter) {
      counter.textContent = mode === 'flip' ? `定时翻页: ${intervalSec}s` : `平滑滚动: ${scrollSpeed}px/s`;
    }
  }

  updateProgress(progress, remainingSec) {
    const isRunning = appState.get('isAutoFlipping');
    const counter = this.container.querySelector('#flipTimeCounter');
    const icon = this.container.querySelector('#flipCenterIcon');

    if (isRunning) {
      const mode = appState.get('autoFlipMode');
      if (counter) {
        counter.textContent = mode === 'flip' ? `剩余 ${remainingSec}s` : `滚动中...`;
      }
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
      counter.textContent = mode === 'flip' ? `定时翻页: ${intervalSec}s` : `平滑滚动: ${scrollSpeed}px/s`;
    }
  }
}
