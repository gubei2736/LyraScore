/**
 * 智能自动翻谱与平滑滚动控制器 (AutoFlipController)
 * 支持自定义秒数倒计时定时翻页、像素级连续平滑滚动、蓝牙翻谱脚踏板映射
 */

import { appState } from './state.js';

export class AutoFlipController {
  constructor(scoreReader, scrollContainerElement) {
    this.reader = scoreReader;
    this.scrollEl = scrollContainerElement;

    this.isRunning = false;
    this.mode = 'flip'; // 'flip' | 'scroll'
    this.intervalSec = 15; // 翻页间隔秒数
    this.scrollSpeed = 35; // 连续滚动速度 (px/s)

    // 定时翻页倒计时状态
    this.remainingMs = 0;
    this.totalMs = 0;
    this.lastTickTime = 0;
    this.rafId = null;

    this.accumulatedScrollPx = 0; // 累加未取整像素，保证极慢速也能极致顺滑

    // 回调通知
    this.onProgress = () => {}; // progress (0~1), remainingSec

    this.bindKeyboardAndPedals();
  }

  setMode(mode) {
    this.mode = mode;
    appState.set({ autoFlipMode: mode });

    if (mode === 'scroll') {
      if (this.reader && this.reader.layoutMode !== 'scroll') {
        this.reader.setLayoutMode('scroll');
      }
    } else if (mode === 'flip') {
      if (this.reader && this.reader.layoutMode === 'scroll') {
        const isLandscape = window.innerWidth > window.innerHeight;
        this.reader.setLayoutMode(isLandscape ? 'double' : 'single');
      }
    }
  }

  setIntervalSec(sec) {
    this.intervalSec = Math.max(2, Math.min(300, sec));
    appState.set({ flipIntervalSec: this.intervalSec });
    if (this.isRunning && this.mode === 'flip') {
      this.resetTimer();
    }
  }

  setScrollSpeed(pxPerSec) {
    this.scrollSpeed = Math.max(5, Math.min(200, pxPerSec));
    appState.set({ scrollSpeed: this.scrollSpeed });
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    appState.set({ isAutoFlipping: true });

    if (this.mode === 'scroll') {
      if (this.reader && this.reader.layoutMode !== 'scroll') {
        this.reader.setLayoutMode('scroll');
      }
      this.accumulatedScrollPx = 0;
    } else if (this.mode === 'flip') {
      this.resetTimer();
    }

    this.lastTickTime = performance.now();
    this.loop();
  }

  pause() {
    this.isRunning = false;
    appState.set({ isAutoFlipping: false });
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  toggle() {
    if (this.isRunning) {
      this.pause();
    } else {
      this.start();
    }
  }

  resetTimer() {
    this.totalMs = this.intervalSec * 1000;
    this.remainingMs = this.totalMs;
  }

  loop() {
    if (!this.isRunning) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTickTime) / 1000, 0.1); // 秒数差 (防止切换后台时突跳)
    this.lastTickTime = now;

    if (this.mode === 'flip') {
      this.remainingMs -= dt * 1000;

      const progress = Math.max(0, Math.min(1, 1 - (this.remainingMs / this.totalMs)));
      const remSec = Math.ceil(Math.max(0, this.remainingMs) / 1000);

      this.onProgress(progress, remSec);

      if (this.remainingMs <= 0) {
        // 时间到，执行翻页
        this.reader.nextPage().then(hasNext => {
          if (hasNext) {
            this.resetTimer();
          } else {
            // 已翻到末尾，暂停
            this.pause();
            this.onProgress(1, 0);
          }
        });
      }
    } else if (this.mode === 'scroll') {
      // 连续平滑滚动模式
      if (this.scrollEl) {
        const deltaPx = this.scrollSpeed * dt;
        this.accumulatedScrollPx += deltaPx;

        // 当累积量大于等于 0.5 像素时执行滚动，兼顾高刷新率与亚像素精度
        if (Math.abs(this.accumulatedScrollPx) >= 0.5) {
          this.scrollEl.scrollTop += this.accumulatedScrollPx;
          this.accumulatedScrollPx = 0;
        }

        // 判断是否到达乐谱底部
        const isAtBottom = this.scrollEl.scrollTop + this.scrollEl.clientHeight >= this.scrollEl.scrollHeight - 4;
        if (isAtBottom && this.scrollEl.scrollHeight > this.scrollEl.clientHeight + 10) {
          this.pause();
        }
      }
    }

    if (this.isRunning) {
      this.rafId = requestAnimationFrame(this.loop.bind(this));
    }
  }

  // 绑定键盘、蓝牙脚踏翻页器 (Page Turner Pedal)
  bindKeyboardAndPedals() {
    window.addEventListener('keydown', (e) => {
      // 如果当前焦点在输入框中则不触发
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      switch (e.code) {
        case 'PageDown':
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          this.reader.nextPage();
          if (this.isRunning && this.mode === 'flip') this.resetTimer();
          break;

        case 'PageUp':
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          this.reader.prevPage();
          if (this.isRunning && this.mode === 'flip') this.resetTimer();
          break;

        case 'Space':
          e.preventDefault();
          this.toggle();
          break;
      }
    });
  }

  destroy() {
    this.pause();
  }
}
