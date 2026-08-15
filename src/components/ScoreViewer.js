/**
 * 乐谱阅读与演奏主视图 (ScoreViewer Component)
 * 包含沉浸式视口、顶部演奏控制条、单/双页排版切换、手写笔工具箱与翻谱悬浮条
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

    this.render();
    this.initReader();

    appState.subscribe(() => {
      this.syncState();
    });
  }

  render() {
    this.container.innerHTML = `
      <div class="score-viewer-layout">
        <!-- 顶部紧凑演奏工具栏 -->
        <header class="reader-topbar" id="readerTopbar">
          <div class="topbar-left">
            <button class="btn btn-ghost topbar-back-btn" id="readerBackBtn" title="返回乐谱库">
              <span class="btn-icon">◀</span>
              <span>乐谱书架</span>
            </button>
            <div class="score-title-meta">
              <h2 class="viewer-score-title" id="viewerScoreTitle">乐谱加载中...</h2>
              <div class="viewer-badges-row" id="viewerBadgesRow"></div>
            </div>
          </div>

          <div class="topbar-center">
            <!-- 页面切换与页码显示 -->
            <div class="page-nav-controls">
              <button class="nav-arrow-btn" id="prevPageBtn" title="上一页 (PageUp / 左踏板)">◀</button>
              <span class="page-indicator" id="pageIndicator">1 / 1</span>
              <button class="nav-arrow-btn" id="nextPageBtn" title="下一页 (PageDown / 空格 / 右踏板)">▶</button>
            </div>
          </div>

          <div class="topbar-right">
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

        <!-- 浮动自动翻谱控制台容器 -->
        <div class="floating-flip-container" id="floatingFlipContainer"></div>
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

    // 挂载自动翻谱悬浮台
    const flipContainer = this.container.querySelector('#floatingFlipContainer');
    this.flipBar = new FlipBar(flipContainer, this.autoFlip);
  }

  bindEvents() {
    // 返回书架
    this.container.querySelector('#readerBackBtn')?.addEventListener('click', () => {
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

    // 屏幕边缘触控热区 (平板演奏极致便利)
    this.container.querySelector('#hotzoneLeft')?.addEventListener('click', () => {
      this.reader.prevPage();
    });
    this.container.querySelector('#hotzoneRight')?.addEventListener('click', () => {
      this.reader.nextPage();
    });
    this.container.querySelector('#hotzoneCenter')?.addEventListener('click', () => {
      // 点击中央切换顶部工具栏显隐
      const topbar = this.container.querySelector('#readerTopbar');
      topbar?.classList.toggle('hidden-bar');
    });

    // 排版模式切换
    this.container.querySelectorAll('.layout-toggle-group button').forEach(btn => {
      btn.addEventListener('click', () => {
        const layout = btn.dataset.layout;
        this.reader.setLayoutMode(layout);
        this.container.querySelectorAll('.layout-toggle-group button').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    // 导出带笔记乐谱
    this.container.querySelector('#exportScoreBtn')?.addEventListener('click', async () => {
      const stage = this.container.querySelector('#scorePagesStage');
      const pageWrapper = stage.querySelector('.score-page-wrapper');
      const score = appState.get('currentScore');
      const title = (score?.title || '乐谱').replace(/[\\/:*?"<>|]/g, '_');
      await exportCurrentPageAsImage(pageWrapper, `${title}_批注版.png`);
    });

    // 主题轮转切换
    this.container.querySelector('#themeCycleBtn')?.addEventListener('click', () => {
      const themes = ['parchment', 'dark', 'light'];
      const cur = appState.get('theme') || 'parchment';
      const next = themes[(themes.indexOf(cur) + 1) % themes.length];
      appState.set({ theme: next });
    });

    // 舞台沉浸演奏模式 (全屏 + 隐藏栏 + 防息屏)
    this.container.querySelector('#stageModeBtn')?.addEventListener('click', async () => {
      const topbar = this.container.querySelector('#readerTopbar');
      topbar?.classList.add('hidden-bar');

      // 请求全屏
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (_) {}

      // 开启防息屏
      await wakeLockManager.request();
    });
  }

  async openScore(score) {
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

    // 默认横屏平板切换为双页模式，竖屏单页模式
    const isLandscape = window.innerWidth > window.innerHeight;
    if (isLandscape && score.format !== 'xml') {
      this.reader.setLayoutMode('double');
      this.container.querySelectorAll('.layout-toggle-group button').forEach(b => {
        b.classList.toggle('active', b.dataset.layout === 'double');
      });
    } else {
      this.reader.setLayoutMode('single');
      this.container.querySelectorAll('.layout-toggle-group button').forEach(b => {
        b.classList.toggle('active', b.dataset.layout === 'single');
      });
    }

    await this.reader.loadScore(score);
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
