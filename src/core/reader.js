/**
 * 乐谱阅读器调度中心 (ScoreReader Core)
 * 统一调度 PDF / MusicXML / 图片乐谱，管理单页/双页/滚动排版与手写笔图层绑定
 */

import { PdfScoreRenderer } from '../renderers/pdfRenderer.js';
import { XmlScoreRenderer } from '../renderers/xmlRenderer.js';
import { ImageScoreRenderer } from '../renderers/imgRenderer.js';
import { StrokeRenderer } from './penEngine/strokeRenderer.js';
import { scoreDB } from './db.js';
import { appState } from './state.js';

export class ScoreReader {
  constructor(viewportContainerElement) {
    this.container = viewportContainerElement;
    this.currentScore = null;
    this.renderer = null;
    this.strokeRenderers = new Map(); // pageIndex => StrokeRenderer instance

    this.currentPage = 0; // 0-based
    this.totalPages = 1;
    this.layoutMode = 'single'; // 'single' | 'double' | 'scroll'
    this.zoomScale = 1.0;

    this.initResizeObserver();
  }

  initResizeObserver() {
    let resizeTimer = null;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.currentScore) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          this.renderCurrentLayout();
        }, 150);
      }
    });
    this.resizeObserver.observe(this.container);
  }

  async loadScore(score, initialPage = 0) {
    this.currentScore = score;
    this.currentPage = initialPage;
    this.clearStrokes();

    // 更新最后阅读时间
    score.lastReadTime = Date.now();
    scoreDB.saveScore(score);

    if (this.renderer) {
      this.renderer.destroy();
    }

    if (score.format === 'pdf') {
      this.renderer = new PdfScoreRenderer();
      const info = await this.renderer.load(score.fileBlob || score.fileData);
      this.totalPages = info.numPages;
    } else if (score.format === 'xml') {
      this.renderer = new XmlScoreRenderer();
      const info = await this.renderer.load(score.fileBlob || score.fileData);
      this.totalPages = info.numPages || 1;
    } else if (score.format === 'image') {
      this.renderer = new ImageScoreRenderer();
      const info = await this.renderer.load(score.fileBlob || score.fileData);
      this.totalPages = info.numPages;
    }

    appState.set({
      currentScore: score,
      currentPage: this.currentPage,
      totalPages: this.totalPages
    });

    await this.renderCurrentLayout();
  }

  async renderCurrentLayout() {
    if (!this.currentScore || !this.renderer) return;
    this.clearStrokes();
    this.container.innerHTML = '';

    // 安全计算容器有效宽度
    const rawWidth = this.container.clientWidth;
    const containerWidth = rawWidth > 200 ? rawWidth : Math.max(window.innerWidth - 32, 600);
    const mode = this.layoutMode;

    if (this.currentScore.format === 'xml') {
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'score-page-wrapper xml-page-wrapper';
      const xmlContainer = document.createElement('div');
      xmlContainer.className = 'xml-music-container';
      pageWrapper.appendChild(xmlContainer);

      const penCanvas = document.createElement('canvas');
      penCanvas.className = 'pen-overlay-canvas';
      pageWrapper.appendChild(penCanvas);
      this.container.appendChild(pageWrapper);

      await this.renderer.load(this.currentScore.fileBlob || this.currentScore.fileData, xmlContainer);

      setTimeout(async () => {
        const w = pageWrapper.clientWidth || 800;
        const h = pageWrapper.clientHeight || 1100;
        penCanvas.width = w;
        penCanvas.height = h;

        const strokeRenderer = new StrokeRenderer(penCanvas, {
          scoreId: this.currentScore.id,
          pageIndex: 0,
          onChange: (strokes) => {
            scoreDB.savePageAnnotations(this.currentScore.id, 0, strokes);
          }
        });

        const savedStrokes = await scoreDB.getPageAnnotations(this.currentScore.id, 0);
        strokeRenderer.loadStrokes(savedStrokes);
        this.strokeRenderers.set(0, strokeRenderer);
        this.syncPenToolToRenderers();
      }, 100);
      return;
    }

    // PDF 与 图片乐谱排版
    if (mode === 'double' && this.totalPages > 1) {
      // 双页并排模式 (适合平板横屏多页)
      const doubleContainer = document.createElement('div');
      doubleContainer.className = 'score-double-container';

      const leftPageIndex = this.currentPage % 2 === 0 ? this.currentPage : this.currentPage - 1;
      const rightPageIndex = leftPageIndex + 1;

      const pageWidth = Math.floor((containerWidth - 48) / 2);

      const leftPageEl = await this.createPageElement(leftPageIndex, pageWidth);
      if (leftPageEl) doubleContainer.appendChild(leftPageEl);

      if (rightPageIndex < this.totalPages) {
        const rightPageEl = await this.createPageElement(rightPageIndex, pageWidth);
        if (rightPageEl) doubleContainer.appendChild(rightPageEl);
      }

      this.container.appendChild(doubleContainer);
    } else if (mode === 'scroll') {
      // 垂直连续滚动模式
      const scrollContainer = document.createElement('div');
      scrollContainer.className = 'score-scroll-container';

      const pageWidth = Math.min(containerWidth - 32, 960);
      for (let i = 0; i < this.totalPages; i++) {
        const pageEl = await this.createPageElement(i, pageWidth);
        if (pageEl) scrollContainer.appendChild(pageEl);
      }
      this.container.appendChild(scrollContainer);
    } else {
      // 单页模式 (居中且自适应最大可读宽度)
      const singleContainer = document.createElement('div');
      singleContainer.className = 'score-single-container';

      const pageWidth = Math.min(containerWidth - 32, 960);
      const pageEl = await this.createPageElement(this.currentPage, pageWidth);
      if (pageEl) singleContainer.appendChild(pageEl);
      this.container.appendChild(singleContainer);
    }

    this.syncPenToolToRenderers();
  }

  async createPageElement(pageIndex, targetWidth) {
    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'score-page-wrapper';
    pageWrapper.dataset.pageIndex = pageIndex;

    const baseCanvas = document.createElement('canvas');
    baseCanvas.className = 'score-base-canvas';
    pageWrapper.appendChild(baseCanvas);

    const penCanvas = document.createElement('canvas');
    penCanvas.className = 'pen-overlay-canvas';
    pageWrapper.appendChild(penCanvas);

    // 渲染底层乐谱页面 (1-based)
    const renderInfo = await this.renderer.renderPage(pageIndex + 1, baseCanvas, targetWidth);

    if (renderInfo) {
      pageWrapper.style.width = `${renderInfo.width}px`;
      pageWrapper.style.height = `${renderInfo.height}px`;

      penCanvas.width = renderInfo.width;
      penCanvas.height = renderInfo.height;
      penCanvas.style.width = `${renderInfo.width}px`;
      penCanvas.style.height = `${renderInfo.height}px`;

      const strokeRenderer = new StrokeRenderer(penCanvas, {
        scoreId: this.currentScore.id,
        pageIndex: pageIndex,
        onChange: (strokes) => {
          scoreDB.savePageAnnotations(this.currentScore.id, pageIndex, strokes);
        }
      });

      const savedStrokes = await scoreDB.getPageAnnotations(this.currentScore.id, pageIndex);
      strokeRenderer.loadStrokes(savedStrokes);

      this.strokeRenderers.set(pageIndex, strokeRenderer);
    }

    return pageWrapper;
  }

  syncPenToolToRenderers() {
    const isPenActive = appState.get('isPenActive');
    const tool = appState.get('activePenTool');
    const color = appState.get('penColor');
    const size = appState.get('penSize');
    const stamp = appState.get('currentStamp');

    for (const [pageIndex, sr] of this.strokeRenderers.entries()) {
      sr.canvas.style.pointerEvents = isPenActive ? 'auto' : 'none';
      sr.setBrush({
        tool: tool,
        color: color,
        size: size,
        stamp: stamp
      });
    }
  }

  // ================= 翻页与定位控制 =================

  async nextPage() {
    const step = (this.layoutMode === 'double' && this.totalPages > 1) ? 2 : 1;
    if (this.currentPage + step < this.totalPages) {
      this.currentPage += step;
      appState.set({ currentPage: this.currentPage });
      await this.renderCurrentLayout();
      return true;
    }
    return false;
  }

  async prevPage() {
    const step = (this.layoutMode === 'double' && this.totalPages > 1) ? 2 : 1;
    if (this.currentPage - step >= 0) {
      this.currentPage = Math.max(0, this.currentPage - step);
      appState.set({ currentPage: this.currentPage });
      await this.renderCurrentLayout();
      return true;
    }
    return false;
  }

  async goToPage(pageIndex) {
    if (pageIndex >= 0 && pageIndex < this.totalPages) {
      this.currentPage = pageIndex;
      appState.set({ currentPage: this.currentPage });
      await this.renderCurrentLayout();
      return true;
    }
    return false;
  }

  setLayoutMode(mode) {
    if (['single', 'double', 'scroll'].includes(mode)) {
      this.layoutMode = mode;
      appState.set({ layoutMode: mode });
      this.renderCurrentLayout();
    }
  }

  clearStrokes() {
    for (const [_, sr] of this.strokeRenderers.entries()) {
      sr.destroy();
    }
    this.strokeRenderers.clear();
  }

  undoCurrentPage() {
    const sr = this.strokeRenderers.get(this.currentPage);
    if (sr) sr.undo();
  }

  redoCurrentPage() {
    const sr = this.strokeRenderers.get(this.currentPage);
    if (sr) sr.redo();
  }

  clearCurrentPage() {
    const sr = this.strokeRenderers.get(this.currentPage);
    if (sr) sr.clear();
  }
}
