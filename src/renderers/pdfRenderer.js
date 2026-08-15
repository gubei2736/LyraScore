/**
 * PDF 乐谱渲染引擎 (基于 Mozilla PDF.js)
 * 具备离屏后台预光栅化 (Offscreen Pre-rendering)、LRU 3页高性能位图双缓冲池与 0ms 翻页直通
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

export class PdfScoreRenderer {
  constructor() {
    this.pdfDoc = null;
    // LRU 3页位图缓存池: key = pageNum, value = { bitmap, width, height, rawWidth, rawHeight, targetWidth }
    this.bitmapCache = new Map();
    this.activeRenderTasks = new Map();
  }

  static toUint8Array(data) {
    if (!data) return null;
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    if (typeof data === 'string') {
      let base64 = data;
      if (data.includes(',')) {
        base64 = data.split(',')[1];
      }
      base64 = base64.replace(/[\r\n\s]/g, '');
      const binaryStr = atob(base64);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes;
    }
    return null;
  }

  async load(fileData) {
    this.destroy();

    const uint8 = PdfScoreRenderer.toUint8Array(fileData);
    if (!uint8 || uint8.length === 0) {
      throw new Error('PDF 数据无效或为空');
    }

    try {
      const copyData = new Uint8Array(uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength));
      const loadingTask = pdfjsLib.getDocument({
        data: copyData,
        cMapPacked: true,
        verbosity: 0,
        stopAtErrors: false
      });

      this.pdfDoc = await loadingTask.promise;
      return {
        numPages: this.pdfDoc.numPages
      };
    } catch (err) {
      console.error('PDF 解析失败:', err);
      throw new Error('PDF 乐谱解析失败: ' + (err.message || '文件可能损坏'));
    }
  }

  getNumPages() {
    return this.pdfDoc ? this.pdfDoc.numPages : 0;
  }

  /**
   * 离屏静默预渲染 (仅在系统空闲时刻调用，生成 ImageBitmap 并存入缓存)
   */
  async prerenderPage(pageNum, targetWidth = 800) {
    if (!this.pdfDoc || pageNum < 1 || pageNum > this.pdfDoc.numPages) return null;

    const cached = this.bitmapCache.get(pageNum);
    if (cached && Math.abs(cached.targetWidth - targetWidth) < 20) {
      return cached;
    }

    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const safeWidth = Math.max(targetWidth || 800, 360);
      const baseScale = safeWidth / (unscaledViewport.width || 595);
      const dpr = Math.min(window.devicePixelRatio || 2.0, 2.2);
      const renderScale = baseScale * dpr;

      const viewport = page.getViewport({ scale: renderScale });
      const displayWidth = Math.floor(viewport.width / dpr);
      const displayHeight = Math.floor(viewport.height / dpr);

      const offscreen = document.createElement('canvas');
      offscreen.width = Math.floor(viewport.width);
      offscreen.height = Math.floor(viewport.height);

      const ctx = offscreen.getContext('2d', { alpha: false });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: viewport
      });

      await renderTask.promise;

      let bitmap = null;
      if (typeof window.createImageBitmap === 'function') {
        try {
          bitmap = await window.createImageBitmap(offscreen);
        } catch (_) {
          bitmap = offscreen;
        }
      } else {
        bitmap = offscreen;
      }

      const cacheEntry = {
        bitmap,
        width: displayWidth,
        height: displayHeight,
        rawWidth: viewport.width,
        rawHeight: viewport.height,
        targetWidth: safeWidth
      };

      // 维护 LRU 3页缓存上限，超出平滑释放
      if (this.bitmapCache.size >= 3) {
        const oldestKey = this.bitmapCache.keys().next().value;
        const oldEntry = this.bitmapCache.get(oldestKey);
        if (oldEntry?.bitmap && typeof oldEntry.bitmap.close === 'function') {
          oldEntry.bitmap.close();
        }
        this.bitmapCache.delete(oldestKey);
      }

      this.bitmapCache.set(pageNum, cacheEntry);
      return cacheEntry;
    } catch (_) {
      return null;
    }
  }

  async renderPage(pageNum, canvas, containerWidth = 800) {
    if (!this.pdfDoc || pageNum < 1 || pageNum > this.pdfDoc.numPages || !canvas) {
      return null;
    }

    const safeWidth = Math.max(containerWidth || 800, 360);

    // 1. 快速直通路径 (Fast-Path)：命中离屏预加载缓存，0ms 瞬间贴入
    const cached = this.bitmapCache.get(pageNum);
    if (cached && Math.abs(cached.targetWidth - safeWidth) < 20) {
      canvas.width = cached.rawWidth;
      canvas.height = cached.rawHeight;
      canvas.style.width = `${cached.width}px`;
      canvas.style.height = `${cached.height}px`;

      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.drawImage(cached.bitmap, 0, 0);

      return {
        width: cached.width,
        height: cached.height,
        rawWidth: cached.rawWidth,
        rawHeight: cached.rawHeight
      };
    }

    // 2. 未命中缓存 -> 执行常规光栅化渲染并写入缓存
    if (this.activeRenderTasks.has(pageNum)) {
      try {
        this.activeRenderTasks.get(pageNum).cancel();
      } catch (_) {}
      this.activeRenderTasks.delete(pageNum);
    }

    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const baseScale = safeWidth / (unscaledViewport.width || 595);
      const dpr = Math.min(window.devicePixelRatio || 2.0, 2.2);
      const renderScale = baseScale * dpr;

      const viewport = page.getViewport({ scale: renderScale });
      const displayWidth = Math.floor(viewport.width / dpr);
      const displayHeight = Math.floor(viewport.height / dpr);

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      const renderTask = page.render(renderContext);
      this.activeRenderTasks.set(pageNum, renderTask);

      await renderTask.promise;
      this.activeRenderTasks.delete(pageNum);

      // 异步生成 ImageBitmap 存入缓存
      if (typeof window.createImageBitmap === 'function') {
        window.createImageBitmap(canvas).then(bitmap => {
          if (this.bitmapCache.size >= 3) {
            const oldestKey = this.bitmapCache.keys().next().value;
            const oldEntry = this.bitmapCache.get(oldestKey);
            if (oldEntry?.bitmap && typeof oldEntry.bitmap.close === 'function') {
              oldEntry.bitmap.close();
            }
            this.bitmapCache.delete(oldestKey);
          }
          this.bitmapCache.set(pageNum, {
            bitmap,
            width: displayWidth,
            height: displayHeight,
            rawWidth: viewport.width,
            rawHeight: viewport.height,
            targetWidth: safeWidth
          });
        }).catch(() => {});
      }

      return {
        width: displayWidth,
        height: displayHeight,
        rawWidth: viewport.width,
        rawHeight: viewport.height
      };
    } catch (err) {
      if (err?.name === 'RenderingCancelledException') {
        return null;
      }
      console.error(`渲染 PDF 第 ${pageNum} 页失败:`, err);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#fef2f2';
        ctx.fillRect(0, 0, canvas.width || 400, canvas.height || 300);
        ctx.fillStyle = '#dc2626';
        ctx.font = '16px sans-serif';
        ctx.fillText(`渲染失败 (第 ${pageNum} 页): ${err.message || '未知错误'}`, 20, 50);
      }
      return null;
    }
  }

  async generateThumbnail(maxWidth = 300) {
    if (!this.pdfDoc) return null;
    try {
      const canvas = document.createElement('canvas');
      const info = await this.renderPage(1, canvas, maxWidth);
      if (info) {
        return canvas.toDataURL('image/jpeg', 0.85);
      }
      return null;
    } catch (e) {
      console.warn('生成缩略图失败:', e);
      return null;
    }
  }

  destroy() {
    for (const [_, task] of this.activeRenderTasks.entries()) {
      try { task.cancel(); } catch (_) {}
    }
    this.activeRenderTasks.clear();

    for (const [_, entry] of this.bitmapCache.entries()) {
      if (entry?.bitmap && typeof entry.bitmap.close === 'function') {
        try { entry.bitmap.close(); } catch (_) {}
      }
    }
    this.bitmapCache.clear();

    if (this.pdfDoc) {
      try {
        this.pdfDoc.destroy();
      } catch (e) {
        // ignore
      }
      this.pdfDoc = null;
    }
  }
}
