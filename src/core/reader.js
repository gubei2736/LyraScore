/**
 * 乐谱阅读器调度中心 (ScoreReader Core)
 * 具备智能空闲预渲染 (0ms 翻页)、动态 GPU 合成纹理加速、双通道多点触控与超丝滑横竖屏无缝切换
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
    this.strokesMemoryCache = new Map(); // 内存热缓存笔迹，加速横竖屏切换

    this.currentPage = 0; // 0-based
    this.totalPages = 1;
    this.layoutMode = 'single';
    this.zoomScale = 1.0;
    this.lastRenderedWidth = 0;
    this.isRendering = false;
    this.onZoomChange = null;

    this.gpuReleaseTimer = null;
    this.idlePrerenderHandle = null;
    this.scrollObserverHandle = null;

    this.initSmoothOrientationListener();
    this.initDualChannelGestures();
    this.initViewportScrollWatcher();
  }

  /**
   * 监听连续滚动视口位置，动态同步顶部页码指示器 (如 3 / 10)
   */
  initViewportScrollWatcher() {
    if (!this.viewportEl) return;

    this.viewportEl.addEventListener('scroll', () => {
      if (this.layoutMode !== 'scroll' || !this.currentScore || this.isRendering) return;

      if (this.scrollObserverHandle) return;
      this.scrollObserverHandle = requestAnimationFrame(() => {
        this.scrollObserverHandle = null;
        const pageWrappers = this.container.querySelectorAll('.score-page-wrapper');
        if (!pageWrappers.length) return;

        const viewportCenter = this.viewportEl.scrollTop + this.viewportEl.clientHeight * 0.45;
        let bestPage = 0;
        let minDistance = Infinity;

        pageWrappers.forEach((el) => {
          const pIdx = parseInt(el.dataset.pageIndex, 10);
          const top = el.offsetTop;
          const height = el.offsetHeight;
          const center = top + height / 2;
          const dist = Math.abs(viewportCenter - center);

          if (dist < minDistance) {
            minDistance = dist;
            bestPage = pIdx;
          }
        });

        if (bestPage !== this.currentPage && bestPage >= 0 && bestPage < this.totalPages) {
          this.currentPage = bestPage;
          appState.set({ currentPage: bestPage });
        }
      });
    }, { passive: true });
  }

  /**
   * 极速丝滑横竖屏旋转监听器 (0ms 即时几何过渡 + 60ms 无缝交叉淡入)
   */
  initSmoothOrientationListener() {
    let resizeTimer = null;

    const handleOrientationOrResize = () => {
      if (!this.currentScore || this.isRendering) return;

      const currentWidth = this.viewportEl?.clientWidth || window.innerWidth;
      if (Math.abs(currentWidth - this.lastRenderedWidth) < 20) return;

      // 1. 瞬时几何平滑过渡：利用 CSS transform 在 0ms 瞬间顺滑贴合新宽度，消除呆滞空白
      if (this.lastRenderedWidth > 0 && currentWidth > 0 && this.layoutMode !== 'scroll') {
        const ratio = currentWidth / this.lastRenderedWidth;
        this.container.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease';
        this.container.style.transform = `scale(${this.zoomScale * ratio})`;
        this.container.style.transformOrigin = 'top center';
      }

      // 2. 60ms 极速防抖，在后台无感完成高清重绘
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this.renderCurrentLayout(true); // smoothTransition = true
      }, 60);
    };

    window.addEventListener('resize', handleOrientationOrResize, { passive: true });
    if (window.screen && window.screen.orientation) {
      window.screen.orientation.addEventListener('change', handleOrientationOrResize);
    }
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
    let isPinching = false;
    let initialPinchDistance = 0;
    let initialPinchScale = 1;
    let isSwiping = false;
    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeCurrentX = 0;
    let swipeCurrentY = 0;
    let scrollStartTop = 0;

    const getDistance = (p1, p2) => {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.hypot(dx, dy);
    };

    const onPointerDown = (e) => {
      if (appState.get('currentView') !== 'reader') return;
      if (e.pointerType === 'pen') return;

      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const count = activePointers.size;

      if (count === 2) {
        isPinching = true;
        isSwiping = false;
        this.enableGpuLayer();
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
        if (this.viewportEl) {
          scrollStartTop = this.viewportEl.scrollTop;
        }
        if (this.layoutMode !== 'scroll') {
          this.container.style.transition = 'none';
        }
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

      // 2. 连续滚动模式 (scroll)：直接接管视口上下滑动，确保手势绝对顺滑且永不卡死
      if (isSwiping && count === 1 && this.layoutMode === 'scroll' && this.viewportEl) {
        const deltaY = e.clientY - swipeStartY;
        this.viewportEl.scrollTop = Math.max(0, scrollStartTop - deltaY);
        return;
      }

      // 3. 单页/双页模式：单指滑动阻尼位移
      if (isSwiping && count === 1 && this.layoutMode !== 'scroll') {
        swipeCurrentX = e.clientX;
        swipeCurrentY = e.clientY;
        const deltaX = swipeCurrentX - swipeStartX;
        const deltaY = swipeCurrentY - swipeStartY;

        if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
          this.enableGpuLayer();
        }

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          if (Math.abs(deltaX) > 8) {
            const dampedX = deltaX * 0.35;
            this.container.style.transform = `scale(${this.zoomScale}) translateX(${dampedX}px)`;
          }
        } else {
          if (Math.abs(deltaY) > 8) {
            const dampedY = deltaY * 0.35;
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
          this.scheduleGpuLayerRelease(200);
          if (this.onZoomChange) {
            this.onZoomChange(this.zoomScale);
          }
        }
        return;
      }

      if (isSwiping && remainingCount === 0 && this.layoutMode !== 'scroll') {
        isSwiping = false;
        const deltaX = swipeCurrentX - swipeStartX;
        const deltaY = swipeCurrentY - swipeStartY;
        const threshold = 30; // 轻扫灵敏度阈值

        const vp = this.viewportEl;
        const isScrollable = vp && (vp.scrollHeight > vp.clientHeight + 15);
        const isAtBottom = vp ? (vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 15) : true;
        const isAtTop = vp ? (vp.scrollTop <= 15) : true;

        // 横向滑动手势：纯粹的整页翻页 (左滑下一页，右滑上一页)
        if (Math.abs(deltaX) >= Math.abs(deltaY)) {
          this.container.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)';
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
        // 垂直滑动手势：智能滚动与触底/到顶分段翻页
        else {
          if (deltaY < -threshold) {
            // 手指向上推 (想查看下方内容)
            if (isScrollable && !isAtBottom) {
              // 1. 如果当前页面未触底，先平滑滚动显示下半页
              const scrollStep = Math.min(vp.clientHeight * 0.65, vp.scrollHeight - vp.scrollTop - vp.clientHeight);
              vp.scrollBy({ top: scrollStep, behavior: 'smooth' });
              return;
            } else {
              // 2. 如果已经到达底部或不可滚动，触发翻到下一页
              this.container.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)';
              this.container.style.transform = `scale(${this.zoomScale}) translateY(-70px)`;
              setTimeout(async () => {
                await this.nextPage();
                this.container.style.transition = 'none';
                this.container.style.transform = `scale(${this.zoomScale}) translateY(0)`;
                this.scheduleGpuLayerRelease(150);
              }, 140);
              return;
            }
          } else if (deltaY > threshold) {
            // 手指向下拉 (想查看上方内容)
            if (isScrollable && !isAtTop) {
              // 1. 如果当前页面未到顶，先平滑向上滚动显示上半页
              const scrollStep = Math.min(vp.clientHeight * 0.65, vp.scrollTop);
              vp.scrollBy({ top: -scrollStep, behavior: 'smooth' });
              return;
            } else {
              // 2. 如果已经在顶部或不可滚动，触发翻到上一页
              this.container.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)';
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
        }

        // 未达到阈值，弹性复位
        this.container.style.transform = `scale(${this.zoomScale}) translate(0, 0)`;
        this.scheduleGpuLayerRelease(200);
      }
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
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
    this.strokesMemoryCache.clear();

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

    await this.renderCurrentLayout(false);
  }

  /**
   * 核心布局渲染 (支持无缝平滑交叉淡入 smoothTransition)
   */
  async renderCurrentLayout(smoothTransition = false) {
    if (!this.currentScore || !this.renderer || this.isRendering) return;
    this.isRendering = true;

    // 缓存当前正在编辑的笔迹到内存
    for (const [pageIdx, sr] of this.strokeRenderers.entries()) {
      if (sr.strokes && sr.strokes.length > 0) {
        this.strokesMemoryCache.set(pageIdx, [...sr.strokes]);
      }
    }
    // 清理旧渲染器（在创建新页面前执行，确保不覆盖新注册的实例）
    this.clearStrokes();

    try {
      const vpWidth = this.viewportEl?.clientWidth || window.innerWidth;
      const vpHeight = this.viewportEl?.clientHeight || window.innerHeight;
      const isLandscape = vpWidth > vpHeight;
      this.lastRenderedWidth = vpWidth;
      const mode = this.layoutMode;

      // 创建离屏临时容器，构建新排版
      const newStage = document.createElement('div');
      newStage.className = 'score-stage-content';

      if (this.currentScore.format === 'xml') {
        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'score-page-wrapper xml-page-wrapper';
        const xmlContainer = document.createElement('div');
        xmlContainer.className = 'xml-music-container';
        pageWrapper.appendChild(xmlContainer);

        const penCanvas = document.createElement('canvas');
        penCanvas.className = 'pen-overlay-canvas';
        pageWrapper.appendChild(penCanvas);
        newStage.appendChild(pageWrapper);

        this.applyNewStage(newStage, smoothTransition);
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
              this.strokesMemoryCache.set(0, strokes);
              scoreDB.savePageAnnotations(this.currentScore.id, 0, strokes);
            }
          });

          const cachedStrokes = this.strokesMemoryCache.get(0) || await scoreDB.getPageAnnotations(this.currentScore.id, 0);
          strokeRenderer.loadStrokes(cachedStrokes);
          this.strokeRenderers.set(0, strokeRenderer);
          this.syncPenToolToRenderers();
        }, 80);
        return;
      }

      // 统一单页乐谱尺寸 (定时整页翻页模式与匀速平滑滚动完全一致)
      const standardPageWidth = isLandscape 
        ? Math.min(vpWidth - 32, 1150) 
        : Math.max(340, vpWidth - 16);

      // 1. 连续纵向流式排版 (Scroll Mode / 匀速平滑滚动)
      if (mode === 'scroll') {
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'score-scroll-container';

        for (let i = 0; i < this.totalPages; i++) {
          const pageEl = await this.createPageElement(i, standardPageWidth);
          if (pageEl) scrollContainer.appendChild(pageEl);
        }
        newStage.appendChild(scrollContainer);
      } 
      // 2. 双页并排排版 (Double Mode) 智能自适应
      else if (mode === 'double' && this.totalPages > 1) {
        const doubleContainer = document.createElement('div');
        doubleContainer.className = 'score-double-container';

        const leftPageIndex = this.currentPage % 2 === 0 ? this.currentPage : this.currentPage - 1;
        const rightPageIndex = leftPageIndex + 1;
        
        // 横屏双页平分视口宽度，精准贴合
        const pageWidth = Math.max(340, Math.floor((vpWidth - 36) / 2));

        const leftPageEl = await this.createPageElement(leftPageIndex, pageWidth);
        if (leftPageEl) doubleContainer.appendChild(leftPageEl);

        if (rightPageIndex < this.totalPages) {
          const rightPageEl = await this.createPageElement(rightPageIndex, pageWidth);
          if (rightPageEl) doubleContainer.appendChild(rightPageEl);
        }

        newStage.appendChild(doubleContainer);
      } 
      // 3. 单页排版 (Single Mode / 定时整页翻页)
      else {
        const singleContainer = document.createElement('div');
        singleContainer.className = 'score-single-container';

        const pageEl = await this.createPageElement(this.currentPage, standardPageWidth);
        if (pageEl) singleContainer.appendChild(pageEl);
        newStage.appendChild(singleContainer);
      }

      // 将构建好的新舞台无缝交叉淡入替换到主容器
      this.applyNewStage(newStage, smoothTransition);
      this.syncPenToolToRenderers();

      // 在单页/双页模式下切换页面后，自动将视口平滑复位到顶部
      if (mode !== 'scroll' && this.viewportEl) {
        this.viewportEl.scrollTop = 0;
        this.viewportEl.scrollLeft = 0;
      }

      // 在连续滚动模式下，自动平滑就位到当前页
      if (mode === 'scroll' && this.currentPage > 0) {
        setTimeout(() => {
          this.scrollToPage(this.currentPage, false);
        }, 30);
      }

      // 在当前页光栅化完毕后，利用系统空闲时间触发相邻页离屏预加载
      if (mode !== 'scroll') {
        this.scheduleIdlePrerender(containerWidth);
      }
    } finally {
      this.isRendering = false;
    }
  }

  /**
   * 连续滚动模式下平滑滚动到指定页面
   */
  scrollToPage(pageIndex, smooth = true) {
    if (this.layoutMode !== 'scroll' || !this.viewportEl) return;
    const pageWrapper = this.container.querySelector(`.score-page-wrapper[data-page-index="${pageIndex}"]`);
    if (pageWrapper) {
      const targetTop = pageWrapper.offsetTop - 16;
      this.viewportEl.scrollTo({
        top: Math.max(0, targetTop),
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }

  /**
   * 无缝平滑替换舞台内容 (Cross-Fade 交叉淡入淡出，彻底消除白屏闪烁)
   */
  applyNewStage(newStageElement, smoothTransition) {
    // clearStrokes() 已在 renderCurrentLayout 开头执行，此处不再重复清理

    if (smoothTransition) {
      newStageElement.style.opacity = '0';
      newStageElement.style.transition = 'opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1)';

      this.container.innerHTML = '';
      this.container.appendChild(newStageElement);

      this.container.style.transition = 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)';
      this.container.style.transform = `scale(${this.zoomScale})`;
      this.container.style.transformOrigin = 'top center';

      requestAnimationFrame(() => {
        newStageElement.style.opacity = '1';
      });
    } else {
      this.container.innerHTML = '';
      this.container.appendChild(newStageElement);
      this.container.style.transition = 'none';
      this.container.style.transform = `scale(${this.zoomScale})`;
      this.container.style.transformOrigin = 'top center';
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
          this.strokesMemoryCache.set(pageIndex, strokes);
          scoreDB.savePageAnnotations(this.currentScore.id, pageIndex, strokes);
        }
      });

      // 优先从内存热缓存恢复笔迹，极速秒出
      const savedStrokes = this.strokesMemoryCache.get(pageIndex) || await scoreDB.getPageAnnotations(this.currentScore.id, pageIndex);
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
      sr.setBrush({ tool, color, size, stamp });
    }
  }

  async nextPage() {
    if (this.layoutMode === 'scroll') {
      if (this.currentPage + 1 < this.totalPages) {
        this.currentPage += 1;
        appState.set({ currentPage: this.currentPage });
        this.scrollToPage(this.currentPage, true);
        return true;
      }
      return false;
    }

    const step = (this.layoutMode === 'double' && this.totalPages > 1) ? 2 : 1;
    if (this.currentPage + step < this.totalPages) {
      this.currentPage += step;
      appState.set({ currentPage: this.currentPage });
      await this.renderCurrentLayout(false);
      return true;
    }
    return false;
  }

  async prevPage() {
    if (this.layoutMode === 'scroll') {
      if (this.currentPage - 1 >= 0) {
        this.currentPage -= 1;
        appState.set({ currentPage: this.currentPage });
        this.scrollToPage(this.currentPage, true);
        return true;
      }
      return false;
    }

    const step = (this.layoutMode === 'double' && this.totalPages > 1) ? 2 : 1;
    if (this.currentPage - step >= 0) {
      this.currentPage = Math.max(0, this.currentPage - step);
      appState.set({ currentPage: this.currentPage });
      await this.renderCurrentLayout(false);
      return true;
    }
    return false;
  }

  async goToPage(pageIndex) {
    if (pageIndex >= 0 && pageIndex < this.totalPages) {
      this.currentPage = pageIndex;
      appState.set({ currentPage: this.currentPage });
      if (this.layoutMode === 'scroll') {
        this.scrollToPage(this.currentPage, true);
      } else {
        await this.renderCurrentLayout(false);
      }
      return true;
    }
    return false;
  }

  setLayoutMode(mode) {
    if (['single', 'double', 'scroll'].includes(mode)) {
      if (this.layoutMode === mode) return;
      this.layoutMode = mode;
      appState.set({ layoutMode: mode });
      this.renderCurrentLayout(true);
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
