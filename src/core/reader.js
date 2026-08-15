/**
 * 乐谱阅读器调度中心 (ScoreReader Core)
 * 具备防循环闪烁保护、手势穿透与原生垂直顺畅滚动支持
 */

import { PdfScoreRenderer } from '../renderers/pdfRenderer.js';
import { XmlScoreRenderer } from '../renderers/xmlRenderer.js';
import { ImageScoreRenderer } from '../renderers/imgRenderer.js';
import { StrokeRenderer } from './penEngine/strokeRenderer.js';
import { scoreDB } from './db.js';
import { appState } from './state.js';

export class ScoreReader {
  constructor(viewportContainerElement) {
    this.container = viewportContainerElement; // #scorePagesStage
    this.viewportEl = document.getElementById('scoreViewport') || this.container.parentElement;
    this.currentScore = null;
    this.renderer = null;
    this.strokeRenderers = new Map();

    this.currentPage = 0; // 0-based
    this.totalPages = 1;
    this.layoutMode = 'single';
    this.zoomScale = 1.0;
    this.lastRenderedWidth = 0;
    this.isRendering = false;

    this.initWindowResizeListener();
    this.initPinchZoom();
  }

  initWindowResizeListener() {
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (this.currentScore && !this.isRendering) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const currentWidth = this.viewportEl?.clientWidth || window.innerWidth;
          if (Math.abs(currentWidth - this.lastRenderedWidth) > 20) {
            this.renderCurrentLayout();
          }
        }, 300);
      }
    });
  }

  initPinchZoom() {
    let initialDistance = 0;
    let initialScale = 1.0;

    const getDistance = (touch1, touch2) => {
      const dx = touch1.clientX - touch2.clientX;
      const dy = touch1.clientY - touch2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    this.viewportEl?.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        initialDistance = getDistance(e.touches[0], e.touches[1]);
        initialScale = this.zoomScale;
      }
    }, { passive: true });

    this.viewportEl?.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && initialDistance > 0) {
        const currentDistance = getDistance(e.touches[0], e.touches[1]);
        const scaleChange = currentDistance / initialDistance;
        let newScale = Math.min(Math.max(initialScale * scaleChange, 0.6), 2.8);
        this.container.style.transform = `scale(${newScale})`;
        this.container.style.transformOrigin = 'top center';
      }
    }, { passive: true });

    this.viewportEl?.addEventListener('touchend', (e) => {
      if (e.touches.length < 2 && initialDistance > 0) {
        initialDistance = 0;
      }
    }, { passive: true });
  }

  setZoom(scale) {
    this.zoomScale = Math.min(Math.max(scale, 0.6), 2.8);
    this.container.style.transform = `scale(${this.zoomScale})`;
    this.container.style.transformOrigin = 'top center';
  }

  async loadScore(score, initialPage = 0) {
    this.currentScore = score;
    this.currentPage = initialPage;
    this.clearStrokes();

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
    if (!this.currentScore || !this.renderer || this.isRendering) return;
    this.isRendering = true;

    try {
      this.clearStrokes();
      this.container.innerHTML = '';
      this.container.style.transform = `scale(${this.zoomScale})`;
      this.container.style.transformOrigin = 'top center';

      const vpWidth = this.viewportEl?.clientWidth || window.innerWidth;
      const containerWidth = Math.max(vpWidth - 32, 600);
      this.lastRenderedWidth = vpWidth;

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

      // PDF 与 图片乐谱渲染 (单页 / 双页)
      if (mode === 'double' && this.totalPages > 1) {
        const doubleContainer = document.createElement('div');
        doubleContainer.className = 'score-double-container';

        const leftPageIndex = this.currentPage % 2 === 0 ? this.currentPage : this.currentPage - 1;
        const rightPageIndex = leftPageIndex + 1;

        const pageWidth = Math.floor((containerWidth - 32) / 2);

        const leftPageEl = await this.createPageElement(leftPageIndex, pageWidth);
        if (leftPageEl) doubleContainer.appendChild(leftPageEl);

        if (rightPageIndex < this.totalPages) {
          const rightPageEl = await this.createPageElement(rightPageIndex, pageWidth);
          if (rightPageEl) doubleContainer.appendChild(rightPageEl);
        }

        this.container.appendChild(doubleContainer);
      } else {
        // 单页模式
        const singleContainer = document.createElement('div');
        singleContainer.className = 'score-single-container';

        const pageWidth = Math.min(containerWidth, 980);
        const pageEl = await this.createPageElement(this.currentPage, pageWidth);
        if (pageEl) singleContainer.appendChild(pageEl);
        this.container.appendChild(singleContainer);
      }

      this.syncPenToolToRenderers();
    } finally {
      this.isRendering = false;
    }
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
      // 关键：非手写模式完全穿透，支持手指顺畅上下滑动
      sr.canvas.style.pointerEvents = isPenActive ? 'auto' : 'none';
      sr.canvas.style.touchAction = isPenActive ? 'none' : 'auto';
      sr.setBrush({
        tool: tool,
        color: color,
        size: size,
        stamp: stamp
      });
    }
  }

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
    if (['single', 'double'].includes(mode)) {
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
