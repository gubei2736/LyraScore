/**
 * 乐谱阅读与演奏主视图 (ScoreViewer Component)
 * 包含沉浸式视口、顶部演奏控制条（内嵌定时翻页与缩放微调）、单/双页排版（横竖屏智能约束）与自由拖拽手写笔工具箱
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
        <!-- 顶部紧凑演奏工具栏 (响应式流式布局) -->
        <header class="reader-topbar" id="readerTopbar">
          <div class="topbar-left">
            <button class="btn btn-ghost topbar-back-btn" id="readerBackBtn" title="返回乐谱库">
              <span class="btn-icon">◀</span>
              <span class="back-text">书架</span>
            </button>
            <div class="score-title-meta">
              <h2 class="viewer-score-title" id="viewerScoreTitle">乐谱加载中...</h2>
              <div class="viewer-badges-row" id="viewerBadgesRow"></div>
            </div>
          </div>

          <div class="topbar-center">
            <!-- 页面切换与页码显示 -->
            <div class="page-nav-controls">
              <button class="nav-arrow-btn" id="prevPageBtn" title="上一页 (左踏板/PageUp)">◀</button>
              <span class="page-indicator" id="pageIndicator">1 / 1</span>
              <button class="nav-arrow-btn" id="nextPageBtn" title="下一页 (右踏板/PageDown)">▶</button>
            </div>

            <!-- 内嵌顶部工具栏的定时翻页控制器 -->
            <div id="topbarFlipSlot"></div>
          </div>

          <div class="topbar-right">
            <!-- 乐谱缩放微调控制器 -->
            <div class="zoom-control-group">
              <button class="zoom-btn" id="zoomOutBtn" title="缩小乐谱">-</button>
              <span class="zoom-label" id="zoomLabel">100%</span>
              <button class="zoom-btn" id="zoomInBtn" title="放大乐谱">+</button>
            </div>

            <!-- 排版模式切换 (仅单页/双页，竖屏仅单页) -->
            <div class="layout-toggle-group">
              <button class="icon-toggle-btn active" data-layout="single" title="单页模式">📄</button>
              <button class="icon-toggle-btn" data-layout="double" id="btnDoublePage" title="双页并排模式 (仅横屏可用)">📖</button>
            </div>

            <!-- 主题切换 -->
            <button class="btn btn-ghost btn-sm" id="themeCycleBtn" title="切换演奏色调 (羊皮纸/深色/纯白)">
              🎨 <span class="btn-label-text">主题</span>
            </button>

            <!-- 舞台沉浸演奏模式 (全屏+防息屏) -->
            <button class="btn btn-primary btn-sm stage-mode-btn" id="stageModeBtn" title="开启舞台沉浸全屏演奏">
              🎭 <span class="btn-label-text">演奏</span>
            </button>
          </div>
        </header>

        <!-- 演奏模式下常驻的微型半透明退出胶囊按钮 -->
        <button class="floating-stage-exit-pill" id="floatingExitStageBtn" style="display: none;" title="点击退出演奏模式">
          ✕ 退出演奏
        </button>

        <!-- 核心乐谱阅读视口 (支持原生上下顺畅滑动) -->
        <main class="score-viewport-container" id="scoreViewport">
          <!-- 左右触控翻页热区 (适合弹琴时轻触边缘快速翻谱) -->
          <div class="touch-hotzone hotzone-left" id="hotzoneLeft" title="点击上一页"></div>
          <div class="touch-hotzone hotzone-center" id="hotzoneCenter" title="点击唤出/隐藏工具条"></div>
          <div class="touch-hotzone hotzone-right" id="hotzoneRight" title="点击下一页"></div>

          <!-- 乐谱页面承载区域 -->
          <div class="score-pages-stage" id="scorePagesStage"></div>
        </main>

        <!-- 浮动手写笔工具箱容器 (半透明自由拖拽移动) -->
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
        // 竖屏：强制单页，禁用双页
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
        // 横屏：启用双页
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

  bindEvents() {
    // 返回书架
    this.container.querySelector('#readerBackBtn')?.addEventListener('click', () => {
      this.setStageMode(false);
      this.autoFlip.pause();
      wakeLockManager.release();
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

    // 缩放控制
    this.container.querySelector('#zoomInBtn')?.addEventListener('click', () => {
      this.currentZoom = Math.min(this.currentZoom + 0.15, 2.5);
      this.reader.setZoom(this.currentZoom);
      this.updateZoomLabel();
    });
    this.container.querySelector('#zoomOutBtn')?.addEventListener('click', () => {
      this.currentZoom = Math.max(this.currentZoom - 0.15, 0.6);
      this.reader.setZoom(this.currentZoom);
      this.updateZoomLabel();
    });

    // 排版模式切换（只处理单页和双页）
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

    // 进入演奏模式
    this.container.querySelector('#stageModeBtn')?.addEventListener('click', () => {
      this.setStageMode(true);
    });

    // 退出演奏模式
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
    if (label) {
      label.textContent = `${Math.round(this.currentZoom * 100)}%`;
    }
  }

  async openScore(score) {
    this.setStageMode(false);
    this.currentZoom = 1.0;
    this.updateZoomLabel();

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
