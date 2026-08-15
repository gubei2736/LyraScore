/**
 * 自动翻谱悬浮控制台 (FlipBar)
 * 包含定时翻页呼吸倒计时圆环、平滑滚动调速器与蓝牙脚踏板状态
 */

import { appState } from '../core/state.js';

export class FlipBar {
  constructor(containerElement, autoFlipController) {
    this.container = containerElement;
    this.controller = autoFlipController;
    this.isSettingsOpen = false;

    this.render();
    this.bindEvents();

    // 绑定控制器进度通知
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
      <div class="flip-bar-widget ${isRunning ? 'running' : 'idle'}">
        <!-- 倒计时环形指示器 & 主开关 -->
        <button class="flip-main-toggle-btn" id="flipMainToggleBtn" title="${isRunning ? '暂停自动翻谱 (空格键)' : '开始自动翻谱 (空格键)'}">
          <svg class="countdown-svg" viewBox="0 0 44 44">
            <circle class="countdown-track" cx="22" cy="22" r="18" />
            <circle class="countdown-indicator" id="countdownCircle" cx="22" cy="22" r="18" />
          </svg>
          <span class="flip-icon-center" id="flipCenterIcon">${isRunning ? '⏸' : '▶'}</span>
        </button>

        <div class="flip-status-info">
          <div class="flip-mode-badge" id="flipModeToggleBtn" title="点击切换翻页/平滑滚动模式">
            ${mode === 'flip' ? '⏱ 定时翻页' : '📜 平滑滚动'}
          </div>
          <div class="flip-time-counter" id="flipTimeCounter">
            ${mode === 'flip' ? `${intervalSec}s / 页` : `${scrollSpeed} px/s`}
          </div>
        </div>

        <!-- 快速加减秒数/速度 -->
        <div class="flip-quick-adjust">
          <button class="quick-step-btn" id="flipMinusBtn" title="减少时间/减速">-</button>
          <button class="quick-step-btn" id="flipPlusBtn" title="增加时间/加速">+</button>
        </div>

        <button class="flip-settings-btn" id="flipSettingsToggleBtn" title="自动翻谱与踏板设置">
          ⚙️
        </button>

        <!-- 详细设置面板 -->
        <div class="flip-settings-popover ${this.isSettingsOpen ? 'open' : ''}" id="flipSettingsPopover">
          <div class="settings-popover-title">
            <span>自动翻谱与外设设置</span>
            <button class="stamp-close-btn" id="flipSettingsCloseBtn">✕</button>
          </div>

          <div class="setting-item">
            <label class="setting-label">翻谱模式</label>
            <div class="segmented-control">
              <button class="seg-btn ${mode === 'flip' ? 'active' : ''}" data-mode="flip">定时翻页</button>
              <button class="seg-btn ${mode === 'scroll' ? 'active' : ''}" data-mode="scroll">平滑滚动</button>
            </div>
          </div>

          <div class="setting-item ${mode === 'flip' ? '' : 'hidden'}" id="flipIntervalSection">
            <label class="setting-label">翻页间隔时长: <strong id="intervalDisplay">${intervalSec}</strong> 秒</label>
            <input type="range" class="size-slider" id="flipIntervalSlider" min="3" max="120" step="1" value="${intervalSec}">
          </div>

          <div class="setting-item ${mode === 'scroll' ? '' : 'hidden'}" id="scrollSpeedSection">
            <label class="setting-label">滚动速度: <strong id="speedDisplay">${scrollSpeed}</strong> px/s</label>
            <input type="range" class="size-slider" id="scrollSpeedSlider" min="10" max="150" step="5" value="${scrollSpeed}">
          </div>

          <div class="pedal-tip-box">
            <div class="tip-title">🎹 蓝牙脚踏翻页板 / 键盘支持</div>
            <div class="tip-content">
              已自动支持蓝牙脚踏翻页板：<br>
              • <strong>右踏板 / PageDown / 空格</strong>: 下一页/播放<br>
              • <strong>左踏板 / PageUp</strong>: 上一页
            </div>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // 主开关
    this.container.querySelector('#flipMainToggleBtn')?.addEventListener('click', () => {
      this.controller.toggle();
    });

    // 点击模式切换
    this.container.querySelector('#flipModeToggleBtn')?.addEventListener('click', () => {
      const cur = appState.get('autoFlipMode');
      const next = cur === 'flip' ? 'scroll' : 'flip';
      this.controller.setMode(next);
      this.render();
      this.bindEvents();
    });

    // 快速步进
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

    // 设置面板开关
    this.container.querySelector('#flipSettingsToggleBtn')?.addEventListener('click', () => {
      this.isSettingsOpen = !this.isSettingsOpen;
      this.container.querySelector('#flipSettingsPopover')?.classList.toggle('open', this.isSettingsOpen);
    });
    this.container.querySelector('#flipSettingsCloseBtn')?.addEventListener('click', () => {
      this.isSettingsOpen = false;
      this.container.querySelector('#flipSettingsPopover')?.classList.remove('open');
    });

    // 模式单选
    this.container.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = btn.dataset.mode;
        this.controller.setMode(m);
        this.render();
        this.bindEvents();
      });
    });

    // 滑块
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
    const circle = this.container.querySelector('#countdownCircle');
    const centerIcon = this.container.querySelector('#flipCenterIcon');
    const counter = this.container.querySelector('#flipTimeCounter');

    if (circle) {
      // 周长 = 2 * PI * 18 ≈ 113.1
      const circumference = 113.1;
      const offset = circumference * (1 - progress);
      circle.style.strokeDasharray = `${circumference}`;
      circle.style.strokeDashoffset = `${offset}`;
    }

    if (appState.get('isAutoFlipping') && centerIcon) {
      centerIcon.textContent = `${remainingSec}s`;
      centerIcon.style.fontSize = '11px';
      centerIcon.style.fontWeight = 'bold';
    }

    if (counter && appState.get('autoFlipMode') === 'flip') {
      counter.textContent = `${remainingSec}s / 剩余`;
    }
  }

  syncState() {
    const isRunning = appState.get('isAutoFlipping');
    const mode = appState.get('autoFlipMode');
    const intervalSec = appState.get('flipIntervalSec');
    const scrollSpeed = appState.get('scrollSpeed');

    const widget = this.container.querySelector('.flip-bar-widget');
    if (widget) {
      widget.classList.toggle('running', isRunning);
      widget.classList.toggle('idle', !isRunning);
    }

    const centerIcon = this.container.querySelector('#flipCenterIcon');
    if (centerIcon && !isRunning) {
      centerIcon.textContent = '▶';
      centerIcon.style.fontSize = '14px';
    }

    const counter = this.container.querySelector('#flipTimeCounter');
    if (counter && !isRunning) {
      counter.textContent = mode === 'flip' ? `${intervalSec}s / 页` : `${scrollSpeed} px/s`;
    }
  }
}
