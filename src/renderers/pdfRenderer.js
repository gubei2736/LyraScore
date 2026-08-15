/**
 * PDF 乐谱渲染引擎 (基于 Mozilla PDF.js)
 * 采用打包构建的本地独立 Worker 线程，彻底解决 GlobalWorkerOptions.workerSrc 缺失问题
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';

// 绑定本地打包的 Worker 脚本相对路径
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

export class PdfScoreRenderer {
  constructor() {
    this.pdfDoc = null;
    this.pageCache = new Map();
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

  async renderPage(pageNum, canvas, containerWidth = 800) {
    if (!this.pdfDoc || pageNum < 1 || pageNum > this.pdfDoc.numPages || !canvas) {
      return null;
    }

    if (this.activeRenderTasks.has(pageNum)) {
      try {
        this.activeRenderTasks.get(pageNum).cancel();
      } catch (_) {}
      this.activeRenderTasks.delete(pageNum);
    }

    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const safeWidth = Math.max(containerWidth || 800, 360);
      const baseScale = safeWidth / (unscaledViewport.width || 595);
      const dpr = Math.min(window.devicePixelRatio || 2.0, 2.5);
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

    if (this.pdfDoc) {
      try {
        this.pdfDoc.destroy();
      } catch (e) {
        // ignore
      }
      this.pdfDoc = null;
    }
    this.pageCache.clear();
  }
}
