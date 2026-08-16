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

            <!-- 排版模式切换 (单页 / 双页，仅横屏显示) -->
            <div class="layout-toggle-group" id="layoutToggleGroup">
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
        <button class="floating-stage-exit-pill" id="floatingExitStageBtn" style="display: none;">
          <span>✕</span> 退出专注
        </button>

        <!-- 核心乐谱视口与触控热区 -->
        <div class="score-viewport-container" id="scoreViewport">
          <!-- 左右隐形翻页热区 -->
          <div class="touch-hotzone hotzone-left" id="hotzoneLeft" title="点击上一页"></div>
          <div class="touch-hotzone hotzone-right" id="hotzoneRight" title="点击下一页"></div>
          <!-- 顶部中间热区 (专注模式下轻触可唤出顶部栏) -->
          <div class="touch-hotzone hotzone-center" id="hotzoneCenter" title="点击呼出/隐藏顶部控制条"></div>

          <!-- 乐谱页面排版舞台 -->
          <div class="score-pages-stage" id="scorePagesStage"></div>
        </div>

        <!-- 悬浮手写批注工具栏挂载点 -->
        <div id="floatingPenContainer" class="floating-pen-container"></div>
      </div>
    `;

    this.bindEvents();
    this.initOrientationWatcher();
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
      const layoutGroup = this.container.querySelector('#layoutToggleGroup');
      const btnDouble = this.container.querySelector('#btnDoublePage');

      if (layoutGroup) {
        if (!isLandscape) {
          // 竖屏状态下彻底隐藏排版切换控件（默认单页自适应）
          layoutGroup.style.display = 'none';
          if (appState.get('layoutMode') === 'double' && this.reader) {
            this.reader.setLayoutMode('single');
            this.container.querySelectorAll('.layout-toggle-group button').forEach(b => {
              b.classList.toggle('active', b.dataset.layout === 'single');
            });
          }
        } else {
          // 横屏状态下显示单页/双页切换器
          layoutGroup.style.display = 'flex';
          btnDouble?.classList.remove('disabled-btn');
          btnDouble?.setAttribute('title', '双页并排模式');
        }
      }
    };

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    setTimeout(checkOrientation, 100);
  }

  bindEvents() {
    // 返回书架主页
    this.container.querySelector('#readerBackBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.closeViewer();
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

    // 触控缩放条滑动
    const zoomSlider = this.container.querySelector('#zoomRangeSlider');
    zoomSlider?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.currentZoom = val / 100;
      this.reader?.setZoom(this.currentZoom);
      this.updateZoomLabel();
    });

    // 点击 100% 标签一键复位
    this.container.querySelector('#zoomLabel')?.addEventListener('click', () => {
      this.currentZoom = 1.0;
      this.reader?.setZoom(1.0);
      const slider = this.container.querySelector('#zoomRangeSlider');
      if (slider) slider.value = 100;
      this.updateZoomLabel();
    });

    // 单/双页排版切换
    this.container.querySelectorAll('.layout-toggle-group button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled-btn')) return;
        const layout = btn.dataset.layout;
        this.container.querySelectorAll('.layout-toggle-group button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.reader?.setLayoutMode(layout);
      });
    });

    // 主题轮转 (纯汉字)
    this.container.querySelector('#themeCycleBtn')?.addEventListener('click', () => {
      const themes = ['parchment', 'dark', 'light'];
      const cur = document.documentElement.getAttribute('data-theme') || 'parchment';
      const next = themes[(themes.indexOf(cur) + 1) % themes.length];
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('lyra_theme', next);
    });

    // 专注模式
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

  /**
   * 安全关闭阅读器并释放资源
   */
  closeViewer() {
    try {
      this.exitStageMode();
      this.autoFlip?.stop();
      this.metronome?.destroy();
    } catch (err) {
      console.warn('关闭阅读器资源时异常:', err);
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

    const layoutMode = appState.get('layoutMode') || 'single';
    this.container.querySelectorAll('.layout-toggle-group button').forEach(b => {
      b.classList.toggle('active', b.dataset.layout === layoutMode);
    });
  }
}
