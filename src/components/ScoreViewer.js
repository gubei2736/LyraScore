/**
 * 乐谱阅读与专注模式主视图 (ScoreViewer Component)
 * 包含沉浸式视口、顶部控制条（内嵌触控滑动缩放条、一体化翻页控制、自动翻页设置与内置专业节拍器）、单/双页排版与手写笔工具箱
 */

import { ScoreReader } from '../core/reader.js';
import { AutoFlipController } from '../core/autoFlip.js';
import { PenToolbox } from './PenToolbox.js';
import { FlipBar } from './FlipBar.js';
import { Metronome } from './Metronome.js';
import { appState, KEY_SIGNATURES } from '../core/state.js';
import { wakeLockManager } from '../utils/wakeLock.js';

export class ScoreViewer {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.onBackToLibrary = options.onBackToLibrary || (() => {});
    this.onEditScore = options.onEditScore || (() => {});
    this.onCopyScore = options.onCopyScore || (() => {});

    this.reader = null;
    this.autoFlip = null;
    this.penToolbox = null;
    this.flipBar = null;
    this.metronome = null;
    this.isStageMode = false;
    this.currentZoom = 1.0;

    this.render();
    this.initReader();
    this.initOrientationWatcher();

    appState.subscribe(() => {
      this.syncState();
    });
  }

  render() {
    this.container.innerHTML = `
      <div class="score-viewer-layout">
        <!-- 顶部紧凑控制栏 (高级流式排布) -->
        <header class="reader-topbar" id="readerTopbar">
          <div class="topbar-left">
            <button class="btn btn-secondary btn-sm topbar-back-btn" id="readerBackBtn" title="返回乐谱库">
              <span class="btn-icon">◀</span>
              <span class="back-text">书架</span>
            </button>
            <div class="score-title-meta">
              <h2 class="viewer-score-title" id="viewerScoreTitle">乐谱加载中...</h2>
              <div class="viewer-badges-row" id="viewerBadgesRow"></div>
            </div>
          </div>

          <div class="topbar-center">
            <!-- 一体化连贯翻页药丸胶囊 -->
            <div class="page-nav-segmented">
              <button class="nav-segment-btn nav-btn-prev" id="prevPageBtn" title="上一页">
                ‹
              </button>
              <div class="page-indicator-badge" id="pageIndicator">
                1 / 1
              </div>
              <button class="nav-segment-btn nav-btn-next" id="nextPageBtn" title="下一页">
                ›
              </button>
            </div>

            <!-- 内嵌顶部工具栏的自动翻页控制器 -->
            <div id="topbarFlipSlot"></div>

            <!-- 内嵌顶部工具栏的内置专业节拍器 -->
            <div id="topbarMetronomeSlot"></div>
          </div>

          <div class="topbar-right">
            <!-- 触控滑动缩放条 (点击百分比可一键复位100%) -->
            <div class="zoom-slider-box" title="左右滑动缩放乐谱，点击百分比一键复位100%">
              <input type="range" class="zoom-range-slider" id="zoomRangeSlider" min="60" max="260" step="5" value="100">
              <span class="zoom-pct-display" id="zoomLabel" title="点击一键复位为 100%">100%</span>
            </div>

            <!-- 排版模式切换 (仅单页/双页，竖屏仅单页) -->
            <div class="layout-toggle-group">
              <button class="icon-toggle-btn active" data-layout="single" title="单页模式">📄</button>
              <button class="icon-toggle-btn" data-layout="double" id="btnDoublePage" title="双页并排模式 (仅横屏可用)">📖</button>
            </div>

            <!-- 主题切换 (纯汉字无图标) -->
            <button class="btn btn-ghost btn-sm" id="themeCycleBtn" title="切换阅读色调 (羊皮纸/深色/纯白)">
              主题
            </button>

            <!-- 专注模式 (沉浸全屏+防息屏) -->
            <button class="btn btn-primary btn-sm stage-mode-btn" id="stageModeBtn" title="开启全屏专注沉浸阅读">
              专注模式
            </button>
          </div>
        </header>

        <!-- 专注模式下常驻的微型半透明退出胶囊按钮 -->
        <button class="floating-stage-exit-pill" id="floatingExitStageBtn" style="display: none;" title="点击退出专注模式">
          ✕ 退出专注
        </button>

        <!-- 核心乐谱阅读视口 (支持双指平滑缩放与手势上下/左右阻尼滑动翻页) -->
        <main class="score-viewport-container" id="scoreViewport">
          <!-- 左右触控翻页微型热区 -->
          <div class="touch-hotzone hotzone-left" id="hotzoneLeft" title="上一页"></div>
          <div class="touch-hotzone hotzone-center" id="hotzoneCenter" title="唤出/隐藏工具栏"></div>
          <div class="touch-hotzone hotzone-right" id="hotzoneRight" title="下一页"></div>

          <!-- 乐谱页面承载区域 -->
          <div class="score-pages-stage" id="scorePagesStage"></div>
        </main>

        <!-- 浮动手写笔工具箱容器 (半透明自由拖拽移动 + 智能边缘避让 + 原始位置精准还原) -->
        <div class="floating-pen-container" id="floatingPenContainer"></div>
      </div>
    `;

    this.bindEvents();
  }

  initReader() {
    const stageEl = this.container.querySelector('#scorePagesStage');
    const viewportEl = this.container.querySelector('#scoreViewport');

    this.reader = new ScoreReader(stageEl);
    this.autoFlip = new AutoFlipController(this.reader, viewportEl);

    // 监听屏幕双指缩放手势，双向联动顶部滑动条
    this.reader.onZoomChange = (newScale) => {
      this.currentZoom = newScale;
      this.updateZoomLabel();
    };

    // 挂载手写笔浮动工具箱
    const penContainer = this.container.querySelector('#floatingPenContainer');
    this.penToolbox = new PenToolbox(penContainer, this.reader);

    // 挂载顶部内嵌自动翻页控制器
    const flipSlot = this.container.querySelector('#topbarFlipSlot');
    if (flipSlot) {
      this.flipBar = new FlipBar(flipSlot, this.autoFlip);
    }

    // 挂载顶部内嵌专业节拍器
    const metroSlot = this.container.querySelector('#topbarMetronomeSlot');
    if (metroSlot) {
      this.metronome = new Metronome(metroSlot);
    }

    // 挂载全局键盘快捷键
    this.initKeyboardShortcuts();
  }

  initOrientationWatcher() {
    const checkOrientation = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      const btnDouble = this.container.querySelector('#btnDoublePage');
      if (btnDouble) {
        if (!isLandscape) {
          btnDouble.classList.add('disabled-btn');
          btnDouble.setAttribute('title', '双页模式仅在横屏下可用');
          if (appState.get('layoutMode') === 'double') {
            this.reader.setLayoutMode('single');
            this.container.querySelectorAll('.layout-toggle-group button').forEach(b => {
              b.classList.toggle('active', b.dataset.layout === 'single');
            });
          }
        } else {
          btnDouble.classList.remove('disabled-btn');
          btnDouble.setAttribute('title', '双页并排模式');
        }
      }
    };

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    setTimeout(checkOrientation, 100);
  }

  bindEvents() {
    this.container.querySelector('#readerBackBtn')?.addEventListener('click', () => {
      this.exitStageMode();
      this.autoFlip?.stop();
      this.metronome?.destroy();
      this.onBackToLibrary();
    });

    this.container.querySelector('#prevPageBtn')?.addEventListener('click', () => {
      this.reader?.prevPage();
    });
    this.container.querySelector('#nextPageBtn')?.addEventListener('click', () => {
      this.reader?.nextPage();
    });

    this.container.querySelector('#hotzoneLeft')?.addEventListener('click', () => {
      this.reader?.prevPage();
    });
    this.container.querySelector('#hotzoneRight')?.addEventListener('click', () => {
      this.reader?.nextPage();
    });

    this.container.querySelector('#hotzoneCenter')?.addEventListener('click', () => {
      if (this.isStageMode) {
        this.toggleStageTopBar();
      }
    });

    // 触控滑动条缩放
    const slider = this.container.querySelector('#zoomRangeSlider');
    slider?.addEventListener('input', (e) => {
      const pct = parseInt(e.target.value, 10);
      const scale = pct / 100;
      this.currentZoom = scale;
      this.reader?.setZoom(scale);
      this.updateZoomLabel();
    });

    // 点击百分比一键复位 100%
    this.container.querySelector('#zoomLabel')?.addEventListener('click', () => {
      this.currentZoom = 1.0;
      this.reader?.setZoom(1.0);
      if (slider) slider.value = 100;
      this.updateZoomLabel();
    });

    this.container.querySelectorAll('.layout-toggle-group button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled-btn')) return;
        const mode = btn.dataset.layout;
        this.reader?.setLayoutMode(mode);
        this.container.querySelectorAll('.layout-toggle-group button').forEach(b => {
          b.classList.toggle('active', b === btn);
        });
      });
    });

    this.container.querySelector('#themeCycleBtn')?.addEventListener('click', () => {
      const themes = ['parchment', 'dark', 'light'];
      const current = appState.get('theme');
      const nextIndex = (themes.indexOf(current) + 1) % themes.length;
      appState.set({ theme: themes[nextIndex] });
    });

    this.container.querySelector('#stageModeBtn')?.addEventListener('click', () => {
      this.enterStageMode();
    });
    this.container.querySelector('#floatingExitStageBtn')?.addEventListener('click', () => {
      this.exitStageMode();
    });
  }

  updateZoomLabel() {
    const label = this.container.querySelector('#zoomLabel');
    const slider = this.container.querySelector('#zoomRangeSlider');
    const pct = Math.round(this.currentZoom * 100);
    if (label) label.textContent = `${pct}%`;
    if (slider) slider.value = pct;
  }

  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (appState.get('currentView') !== 'reader') return;

      if (['PageDown', 'ArrowRight', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        this.reader?.nextPage();
      } else if (['PageUp', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        this.reader?.prevPage();
      } else if (e.key === ' ' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        this.autoFlip?.toggle();
      } else if (e.key === 'Escape') {
        if (this.isStageMode) {
          this.exitStageMode();
        }
      }
    });
  }

  async openScore(score, initialPage = 0) {
    appState.set({ currentView: 'reader' });
    this.updateScoreMeta(score);

    this.currentZoom = 1.0;
    const slider = this.container.querySelector('#zoomRangeSlider');
    if (slider) slider.value = 100;
    this.updateZoomLabel();

    await this.reader.loadScore(score, initialPage);
  }

  updateScoreMeta(score) {
    const titleEl = this.container.querySelector('#viewerScoreTitle');
    if (titleEl) {
      titleEl.textContent = score.title || '未知乐谱';
    }

    const badgesRow = this.container.querySelector('#viewerBadgesRow');
    if (badgesRow) {
      let html = '';
      if (score.composer) {
        html += `<span class="badge badge-accent">${score.composer}</span>`;
      }
      if (score.keySignature) {
        const keyInfo = KEY_SIGNATURES.find(k => k.id === score.keySignature);
        if (keyInfo) {
          html += `<span class="badge badge-gray">${keyInfo.name}</span>`;
        }
      }
      badgesRow.innerHTML = html;
    }
  }

  enterStageMode() {
    this.isStageMode = true;
    appState.set({ isStageMode: true });

    this.container.querySelector('#readerTopbar')?.classList.add('hidden-bar');
    const exitBtn = this.container.querySelector('#floatingExitStageBtn');
    if (exitBtn) exitBtn.style.display = 'flex';

    wakeLockManager.request();

    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  exitStageMode() {
    this.isStageMode = false;
    appState.set({ isStageMode: false });

    this.container.querySelector('#readerTopbar')?.classList.remove('hidden-bar');
    const exitBtn = this.container.querySelector('#floatingExitStageBtn');
    if (exitBtn) exitBtn.style.display = 'none';

    wakeLockManager.release();

    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  toggleStageTopBar() {
    const topbar = this.container.querySelector('#readerTopbar');
    if (topbar) {
      topbar.classList.toggle('hidden-bar');
    }
  }

  syncState() {
    const currentPage = appState.get('currentPage');
    const totalPages = appState.get('totalPages');

    const indicator = this.container.querySelector('#pageIndicator');
    if (indicator) {
      indicator.textContent = `${currentPage + 1} / ${totalPages}`;
    }

    const btnPrev = this.container.querySelector('#prevPageBtn');
    const btnNext = this.container.querySelector('#nextPageBtn');
    if (btnPrev) btnPrev.disabled = (currentPage === 0);
    if (btnNext) btnNext.disabled = (currentPage >= totalPages - 1);
  }
}
