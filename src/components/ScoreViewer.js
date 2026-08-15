/**
 * 乐谱阅读与专注模式主视图 (ScoreViewer Component)
 * 包含沉浸式视口、顶部控制条（内嵌极简滑动缩放条、一体化翻页控制与定时翻页）、单/双页排版与自由拖拽手写笔工具箱
 */

import { ScoreReader } from '../core/reader.js';
import { AutoFlipController } from '../core/autoFlip.js';
import { PenToolbox } from './PenToolbox.js';
import { FlipBar } from './FlipBar.js';
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
              <button class="nav-segment-btn nav-btn-prev" id="prevPageBtn" title="上一页 (左踏板/PageUp/向下滑)">
                ‹
              </button>
              <div class="page-indicator-badge" id="pageIndicator">
                1 / 1
              </div>
              <button class="nav-segment-btn nav-btn-next" id="nextPageBtn" title="下一页 (右踏板/PageDown/向上滑)">
                ›
              </button>
            </div>

            <!-- 内嵌顶部工具栏的定时翻页控制器 -->
            <div id="topbarFlipSlot"></div>
          </div>

          <div class="topbar-right">
            <!-- 极简触控滑动缩放条 (去除了放大镜图标，支持屏幕双指联动) -->
            <div class="zoom-slider-box" title="左右滑动或在屏幕上双指捏合缩放乐谱">
              <input type="range" class="zoom-range-slider" id="zoomRangeSlider" min="60" max="260" step="5" value="100">
              <span class="zoom-pct-display" id="zoomLabel">100%</span>
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

    // 挂载顶部内嵌定时翻页控制器
    const flipSlot = this.container.querySelector('#topbarFlipSlot');
    if (flipSlot) {
      this.flipBar = new FlipBar(flipSlot, this.autoFlip);
    }
  }

  initOrientationWatcher() {
    const checkOrientation = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      const doubleBtn = this.container.querySelector('#btnDoublePage');

      if (!isLandscape) {
        if (doubleBtn) {
          doubleBtn.disabled = true;
          doubleBtn.classList.add('disabled-btn');
          doubleBtn.title = '双页模式仅在横屏下可用';
        }
        this.reader.setLayoutMode('single');
        this.container.querySelectorAll('.layout-toggle-group button').forEach(b => {
          b.classList.toggle('active', b.dataset.layout === 'single');
        });
      } else {
        if (doubleBtn) {
          doubleBtn.disabled = false;
          doubleBtn.classList.remove('disabled-btn');
          doubleBtn.title = '双页并排模式';
        }
      }
    };

    window.addEventListener('resize', checkOrientation);
    checkOrientation();
  }

  setStageMode(active) {
    this.isStageMode = active;
    const topbar = this.container.querySelector('#readerTopbar');
    const exitBtn = this.container.querySelector('#floatingExitStageBtn');
    const penContainer = this.container.querySelector('#floatingPenContainer');

    if (active) {
      topbar?.classList.add('hidden-bar');
      if (exitBtn) exitBtn.style.display = 'flex';
      if (penContainer) penContainer.style.display = 'none';
      wakeLockManager.request();
    } else {
      topbar?.classList.remove('hidden-bar');
      if (exitBtn) exitBtn.style.display = 'none';
      if (penContainer) penContainer.style.display = 'block';
    }
  }

  closeViewer() {
    this.setStageMode(false);
    this.autoFlip.pause();
    wakeLockManager.release();
    if (this.penToolbox) {
      this.penToolbox.toggle(false);
    }
    const penContainer = this.container.querySelector('#floatingPenContainer');
    if (penContainer) {
      penContainer.style.display = 'none';
    }
  }

  bindEvents() {
    // 返回书架
    this.container.querySelector('#readerBackBtn')?.addEventListener('click', () => {
      this.closeViewer();
      this.onBackToLibrary();
    });

    // 翻页按键
    this.container.querySelector('#prevPageBtn')?.addEventListener('click', () => {
      this.reader.prevPage();
    });
    this.container.querySelector('#nextPageBtn')?.addEventListener('click', () => {
      this.reader.nextPage();
    });

    // 触控热区
    this.container.querySelector('#hotzoneLeft')?.addEventListener('click', () => {
      this.reader.prevPage();
    });
    this.container.querySelector('#hotzoneRight')?.addEventListener('click', () => {
      this.reader.nextPage();
    });
    this.container.querySelector('#hotzoneCenter')?.addEventListener('click', () => {
      if (this.isStageMode) {
        const topbar = this.container.querySelector('#readerTopbar');
        topbar?.classList.toggle('hidden-bar');
      }
    });

    // 顶部滑动缩放条拖动监听
    const zoomSlider = this.container.querySelector('#zoomRangeSlider');
    zoomSlider?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.currentZoom = val / 100;
      this.reader.setZoom(this.currentZoom);
    });

    // 排版模式切换
    this.container.querySelectorAll('.layout-toggle-group button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const layout = btn.dataset.layout;
        this.reader.setLayoutMode(layout);
        this.container.querySelectorAll('.layout-toggle-group button').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    // 主题切换
    this.container.querySelector('#themeCycleBtn')?.addEventListener('click', () => {
      const themes = ['parchment', 'dark', 'light'];
      const cur = appState.get('theme') || 'parchment';
      const next = themes[(themes.indexOf(cur) + 1) % themes.length];
      appState.set({ theme: next });
    });

    // 进入专注模式
    this.container.querySelector('#stageModeBtn')?.addEventListener('click', () => {
      this.setStageMode(true);
    });

    // 退出专注模式
    this.container.querySelector('#floatingExitStageBtn')?.addEventListener('click', () => {
      this.setStageMode(false);
    });

    // 键盘监听
    window.addEventListener('keydown', (e) => {
      if (appState.get('currentView') !== 'reader') return;
      if (e.key === 'Escape' && this.isStageMode) {
        this.setStageMode(false);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        this.reader.nextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        this.reader.prevPage();
      }
    });
  }

  updateZoomLabel() {
    const label = this.container.querySelector('#zoomLabel');
    const slider = this.container.querySelector('#zoomRangeSlider');
    const pct = Math.round(this.currentZoom * 100);
    if (label) label.textContent = `${pct}%`;
    if (slider && parseInt(slider.value, 10) !== pct) {
      slider.value = pct;
    }
  }

  async openScore(score) {
    this.setStageMode(false);
    this.currentZoom = 1.0;
    this.updateZoomLabel();

    const penContainer = this.container.querySelector('#floatingPenContainer');
    if (penContainer) {
      penContainer.style.display = 'block';
    }

    const titleEl = this.container.querySelector('#viewerScoreTitle');
    const badgesRow = this.container.querySelector('#viewerBadgesRow');

    if (titleEl) titleEl.textContent = score.title;

    if (badgesRow) {
      const keyObj = KEY_SIGNATURES.find(k => k.id === score.keySignature);
      badgesRow.innerHTML = `
        <span class="meta-tag-pill">${score.format.toUpperCase()}</span>
        ${keyObj ? `<span class="meta-key-badge">${keyObj.name.split(' (')[0]}</span>` : ''}
        ${score.isCopy ? `<span class="card-copy-badge">🌿 副本: ${score.copyNote || ''}</span>` : ''}
      `;
    }

    const isLandscape = window.innerWidth > window.innerHeight;
    const initialMode = (isLandscape && (score.pageCount > 1 || score.format === 'pdf')) ? 'double' : 'single';
    this.reader.setLayoutMode(initialMode);
    this.container.querySelectorAll('.layout-toggle-group button').forEach(b => {
      b.classList.toggle('active', b.dataset.layout === initialMode);
    });

    try {
      await this.reader.loadScore(score);
    } catch (err) {
      console.error('加载乐谱失败:', err);
      const stageEl = this.container.querySelector('#scorePagesStage');
      if (stageEl) {
        stageEl.innerHTML = `
          <div style="padding: 60px 20px; text-align: center; color: #dc2626;">
            <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
            <h3>乐谱加载失败</h3>
            <p style="color: #6b7280; margin: 12px 0;">${err.message || '文件可能损坏或格式不兼容'}</p>
            <button onclick="location.reload()" class="btn btn-primary btn-sm">重新加载</button>
          </div>
        `;
      }
    }

    await wakeLockManager.request();
  }

  syncState() {
    const cur = appState.get('currentPage') || 0;
    const total = appState.get('totalPages') || 1;
    const layout = appState.get('layoutMode');

    const ind = this.container.querySelector('#pageIndicator');
    if (ind) {
      if (layout === 'double' && total > 1) {
        const p1 = cur + 1;
        const p2 = Math.min(total, cur + 2);
        ind.textContent = `${p1}-${p2} / ${total}`;
      } else {
        ind.textContent = `${cur + 1} / ${total}`;
      }
    }
  }
}
