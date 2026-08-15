/**
 * 乐谱阅读与演奏主视图 (ScoreViewer Component)
 * 包含沉浸式视口、顶部演奏控制条（内嵌定时翻页）、单/双页排版切换与手写笔工具箱
 */

import { ScoreReader } from '../core/reader.js';
import { AutoFlipController } from '../core/autoFlip.js';
import { PenToolbox } from './PenToolbox.js';
import { FlipBar } from './FlipBar.js';
import { appState, KEY_SIGNATURES } from '../core/state.js';
import { exportCurrentPageAsImage } from '../utils/exporter.js';
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

    this.render();
    this.initReader();

    appState.subscribe(() => {
      this.syncState();
    });
  }

  render() {
    this.container.innerHTML = `
      <div class="score-viewer-layout">
        <!-- 顶部紧凑演奏工具栏 (全功能集成) -->
        <header class="reader-topbar" id="readerTopbar">
          <div class="topbar-left">
            <button class="btn btn-ghost topbar-back-btn" id="readerBackBtn" title="返回乐谱库">
              <span class="btn-icon">◀</span>
              <span>书架</span>
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
            <!-- 手写批注开关 (可折叠隐藏) -->
            <button class="btn btn-ghost btn-sm" id="togglePenToolboxBtn" title="显示/隐藏手写批注工具箱">
              🖊️ 批注
            </button>

            <!-- 排版模式切换 -->
            <div class="layout-toggle-group">
              <button class="icon-toggle-btn active" data-layout="single" title="单页模式 (适合竖屏平板)">📄</button>
              <button class="icon-toggle-btn" data-layout="double" title="双页并排模式 (适合横屏平板)">📖</button>
              <button class="icon-toggle-btn" data-layout="scroll" title="垂直连续滚动">📜</button>
            </div>

            <!-- 主题切换 -->
            <button class="btn btn-ghost btn-sm" id="themeCycleBtn" title="切换演奏色调 (羊皮纸/深色/纯白)">
              🎨 主题
            </button>

            <!-- 导出带笔记乐谱 -->
            <button class="btn btn-ghost btn-sm" id="exportScoreBtn" title="导出带有手写笔迹的乐谱图片">
              📤 导出
            </button>

            <!-- 舞台沉浸演奏模式 (全屏+防息屏) -->
            <button class="btn btn-primary btn-sm stage-mode-btn" id="stageModeBtn" title="开启舞台沉浸全屏演奏">
              🎭 演奏模式
            </button>
          </div>
        </header>

        <!-- 演奏模式下常驻的微型半透明退出胶囊按钮 -->
        <button class="floating-stage-exit-pill" id="floatingExitStageBtn" style="display: none;" title="点击退出演奏模式">
          ✕ 退出演奏
        </button>

        <!-- 核心乐谱阅读视口 -->
        <main class="score-viewport-container" id="scoreViewport">
          <!-- 左右触控翻页热区 (适合弹琴时轻触边缘快速翻谱) -->
          <div class="touch-hotzone hotzone-left" id="hotzoneLeft" title="点击上一页"></div>
          <div class="touch-hotzone hotzone-center" id="hotzoneCenter" title="点击唤出/隐藏工具条"></div>
          <div class="touch-hotzone hotzone-right" id="hotzoneRight" title="点击下一页"></div>

          <!-- 乐谱页面承载区域 -->
          <div class="score-pages-stage" id="scorePagesStage"></div>
        </main>

        <!-- 浮动手写笔工具箱容器 -->
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

    // 手写批注开关
    this.container.querySelector('#togglePenToolboxBtn')?.addEventListener('click', () => {
      this.penToolbox.toggle();
    });

    // 排版模式切换
    this.container.querySelectorAll('.layout-toggle-group button').forEach(btn => {
      btn.addEventListener('click', () => {
        const layout = btn.dataset.layout;
        this.reader.setLayoutMode(layout);
        this.container.querySelectorAll('.layout-toggle-group button').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    // 导出
    this.container.querySelector('#exportScoreBtn')?.addEventListener('click', async () => {
      const stage = this.container.querySelector('#scorePagesStage');
      const pageWrapper = stage.querySelector('.score-page-wrapper');
      const score = appState.get('currentScore');
      const title = (score?.title || '乐谱').replace(/[\\/:*?"<>|]/g, '_');
      await exportCurrentPageAsImage(pageWrapper, `${title}_批注版.png`);
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

  async openScore(score) {
    this.setStageMode(false);
    const titleEl = this.container.querySelector('#viewerScoreTitle');
    const badgesRow = this.container.querySelector('#viewerBadgesRow');

    if (titleEl) titleEl.textContent = score.title;

    if (badgesRow) {
      const keyObj = KEY_SIGNATURES.find(k => k.id === score.keySignature);
      badgesRow.innerHTML = `
        <span class="meta-tag-pill">${score.format.toUpperCase()}</span>
        ${keyObj ? `<span class="meta-key-badge">${keyObj.name.split(' (')[0]}</span>` : ''}
        ${score.isCopy ? `<span class="card-copy-badge">🌿 副本: ${score.copyNote || ''}</span>` : ''}
        ${(score.tags || []).map(t => `<span class="meta-tag-pill">#${t}</span>`).join('')}
      `;
    }

    // 默认判断：若有多页且为横屏，使用双页，否则使用单页
    const isLandscape = window.innerWidth > window.innerHeight;
    const initialMode = (isLandscape && (score.pageCount > 1 || score.format === 'pdf')) ? 'single' : 'single';
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
