/**
 * 乐谱阅读器调度中心 (ScoreReader Core)
 * 具备智能空闲预渲染 (0ms 翻页)、动态 GPU 合成纹理加速、双通道多点触控与超低功耗待机
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
    this.onZoomChange = null;

    this.gpuReleaseTimer = null;
    this.idlePrerenderHandle = null;

    this.initWindowResizeListener();
    this.initDualChannelGestures();
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

  enableGpuLayer() {
    if (this.gpuReleaseTimer) {
      clearTimeout(this.gpuReleaseTimer);
      this.gpuReleaseTimer = null;
    }
    this.container.classList.add('gpu-accelerated-layer');
  }

  scheduleGpuLayerRelease(delayMs = 200) {
    if (this.gpuReleaseTimer) clearTimeout(this.gpuReleaseTimer);
    this.gpuReleaseTimer = setTimeout(() => {
      this.container.classList.remove('gpu-accelerated-layer');
      this.gpuReleaseTimer = null;
    }, delayMs);
  }

  initDualChannelGestures() {
    const activePointers = new Map();
    let initialPinchDistance = 0;
    let initialPinchScale = 1.0;
    let isPinching = false;

    let swipeStartX = 0, swipeStartY = 0;
    let swipeCurrentX = 0, swipeCurrentY = 0;
    let isSwiping = false;

    const getDistance = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

    const onPointerDown = (e) => {
      if (appState.get('currentView') !== 'reader') return;
      if (e.pointerType === 'pen') return;

      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const count = activePointers.size;

      if (count >= 2) {
        isPinching = true;
        isSwiping = false;
        this.enableGpuLayer(); // 动态激活 GPU 硬件合成层
        const pts = Array.from(activePointers.values());
        initialPinchDistance = getDistance(pts[0], pts[1]);
        initialPinchScale = this.zoomScale;
        this.container.style.transition = 'none';
        return;
      }

      if (count === 1) {
        isPinching = false;
        isSwiping = true;
        swipeStartX = e.clientX;
        swipeStartY = e.clientY;
        swipeCurrentX = swipeStartX;
        swipeCurrentY = swipeStartY;
        this.container.style.transition = 'none';
      }
    };

    const onPointerMove = (e) => {
      if (appState.get('currentView') !== 'reader') return;
      if (e.pointerType === 'pen') return;

      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      const count = activePointers.size;

      // 1. 双指 Pinch-to-Zoom 动态缩放
      if (count >= 2) {
        this.enableGpuLayer();
        const pts = Array.from(activePointers.values());
        const currentDist = getDistance(pts[0], pts[1]);

        if (!isPinching || initialPinchDistance <= 0) {
          isPinching = true;
          isSwiping = false;
          initialPinchDistance = currentDist;
          initialPinchScale = this.zoomScale;
          return;
        }

        if (initialPinchDistance > 0 && currentDist > 0) {
          const ratio = currentDist / initialPinchDistance;
          const targetScale = Math.min(Math.max(initialPinchScale * ratio, 0.5), 2.8);
          this.zoomScale = targetScale;
          this.container.style.transform = `scale(${targetScale})`;
          this.container.style.transformOrigin = 'top center';

          if (this.onZoomChange) {
            this.onZoomChange(this.zoomScale);
          }
        }
        return;
      }

      // 2. 单指滑动手势阻尼位移
      if (isSwiping && count === 1 && !appState.get('isPenActive')) {
        swipeCurrentX = e.clientX;
        swipeCurrentY = e.clientY;
        const deltaX = swipeCurrentX - swipeStartX;
        const deltaY = swipeCurrentY - swipeStartY;

        if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
          this.enableGpuLayer();
        }

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          if (Math.abs(deltaX) > 12) {
            const dampedX = deltaX * 0.32;
            this.container.style.transform = `scale(${this.zoomScale}) translateX(${dampedX}px)`;
          }
        } else {
          if (Math.abs(deltaY) > 12) {
            const dampedY = deltaY * 0.32;
            this.container.style.transform = `scale(${this.zoomScale}) translateY(${dampedY}px)`;
          }
        }
      }
    };

    const onPointerUp = (e) => {
      if (appState.get('currentView') !== 'reader') return;
      activePointers.delete(e.pointerId);
      const remainingCount = activePointers.size;

      if (isPinching) {
        if (remainingCount < 2) {
          isPinching = false;
          initialPinchDistance = 0;
          this.scheduleGpuLayerRelease(200); // 手势结束，释放 GPU 常驻层
          if (this.onZoomChange) {
            this.onZoomChange(this.zoomScale);
          }
        }
        return;
      }

      if (isSwiping && remainingCount === 0 && !appState.get('isPenActive')) {
        isSwiping = false;
        const deltaX = swipeCurrentX - swipeStartX;
        const deltaY = swipeCurrentY - swipeStartY;
        const threshold = 45;

        this.container.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)';

        // 横向滑动手势
        if (Math.abs(deltaX) >= Math.abs(deltaY)) {
          if (deltaX < -threshold) {
            this.container.style.transform = `scale(${this.zoomScale}) translateX(-70px)`;
            setTimeout(async () => {
              await this.nextPage();
              this.container.style.transition = 'none';
              this.container.style.transform = `scale(${this.zoomScale}) translateX(0)`;
              this.scheduleGpuLayerRelease(150);
            }, 140);
            return;
          } else if (deltaX > threshold) {
            this.container.style.transform = `scale(${this.zoomScale}) translateX(70px)`;
            setTimeout(async () => {
              await this.prevPage();
              this.container.style.transition = 'none';
              this.container.style.transform = `scale(${this.zoomScale}) translateX(0)`;
              this.scheduleGpuLayerRelease(150);
            }, 140);
            return;
          }
        } 
        // 垂直滑动手势
        else {
          if (deltaY < -threshold) {
            this.container.style.transform = `scale(${this.zoomScale}) translateY(-70px)`;
            setTimeout(async () => {
              await this.nextPage();
              this.container.style.transition = 'none';
              this.container.style.transform = `scale(${this.zoomScale}) translateY(0)`;
              this.scheduleGpuLayerRelease(150);
            }, 140);
            return;
          } else if (deltaY > threshold) {
            this.container.style.transform = `scale(${this.zoomScale}) translateY(70px)`;
            setTimeout(async () => {
              await this.prevPage();
              this.container.style.transition = 'none';
              this.container.style.transform = `scale(${this.zoomScale}) translateY(0)`;
              this.scheduleGpuLayerRelease(150);
            }, 140);
            return;
          }
        }

        // 未达阈值回弹
        this.container.style.transform = `scale(${this.zoomScale}) translate(0, 0)`;
        this.scheduleGpuLayerRelease(250);
      }
    };

    window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
    window.addEventListener('pointerup', onPointerUp, { capture: true, passive: true });
    window.addEventListener('pointercancel', onPointerUp, { capture: true, passive: true });
  }

  setZoom(scale) {
    this.zoomScale = Math.min(Math.max(scale, 0.5), 2.8);
    this.container.style.transform = `scale(${this.zoomScale})`;
    this.container.style.transformOrigin = 'top center';
    if (this.onZoomChange) {
      this.onZoomChange(this.zoomScale);
    }
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
      this.container.style.transition = 'none';
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

      // 在当前页光栅化完毕后，利用系统空闲时间触发相邻页离屏预加载
      this.scheduleIdlePrerender(containerWidth);
    } finally {
      this.isRendering = false;
    }
  }

  scheduleIdlePrerender(containerWidth) {
    if (this.idlePrerenderHandle) {
      if (typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(this.idlePrerenderHandle);
      } else {
        clearTimeout(this.idlePrerenderHandle);
      }
      this.idlePrerenderHandle = null;
    }

    const runPrerender = () => {
      if (this.currentScore?.format === 'pdf' && this.renderer?.prerenderPage) {
        const targetWidth = this.layoutMode === 'double' 
          ? Math.floor((containerWidth - 32) / 2) 
          : Math.min(containerWidth, 980);

        // 1. 优先预加载下一页
        const nextPage = this.currentPage + 1 + 1; // 1-based
        if (nextPage <= this.totalPages) {
          this.renderer.prerenderPage(nextPage, targetWidth);
        }

        // 2. 其次预加载前一页
        const prevPage = this.currentPage - 1 + 1;
        if (prevPage >= 1 && prevPage <= this.totalPages) {
          this.renderer.prerenderPage(prevPage, targetWidth);
        }
      }
    };

    if (typeof window.requestIdleCallback === 'function') {
      this.idlePrerenderHandle = window.requestIdleCallback(runPrerender, { timeout: 1200 });
    } else {
      this.idlePrerenderHandle = setTimeout(runPrerender, 150);
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

      penCanvas.width = renderInfo.rawWidth || renderInfo.width;
      penCanvas.height = renderInfo.rawHeight || renderInfo.height;
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
