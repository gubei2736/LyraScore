/**
 * PDF 乐谱渲染引擎 (基于 Mozilla PDF.js)
 * 采用原生二进制流解码，杜绝 Base64 编码损坏，支持自适应高清 DPR 光栅化渲染
 */

import * as pdfjsLib from 'pdfjs-dist';

// 禁用外部 Worker 网络请求，使用稳定可靠的主线程内联解析
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
}

export class PdfScoreRenderer {
  constructor() {
    this.pdfDoc = null;
    this.pageCache = new Map();
    this.activeRenderTasks = new Map(); // pageNum => renderTask
  }

  /**
   * 安全转换各类数据为 Uint8Array
   */
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
      // 清除可能存在的换行符与空格
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
      // 复制一份独立的 ArrayBuffer 副本传递给 PDF.js
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
   * 渲染指定页码到 targetCanvas
   * @param {number} pageNum 1-based
   * @param {HTMLCanvasElement} canvas
   * @param {number} containerWidth 目标显示宽度
   */
  async renderPage(pageNum, canvas, containerWidth = 800) {
    if (!this.pdfDoc || pageNum < 1 || pageNum > this.pdfDoc.numPages || !canvas) {
      return null;
    }

    // 取消正在进行的同一 Canvas 渲染任务
    if (this.activeRenderTasks.has(pageNum)) {
      try {
        this.activeRenderTasks.get(pageNum).cancel();
      } catch (_) {}
      this.activeRenderTasks.delete(pageNum);
    }

    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      // 计算安全视口宽度（根据容器实际宽度与屏幕宽度综合取优）
      const safeWidth = Math.max(containerWidth || 800, 360);
      const baseScale = safeWidth / (unscaledViewport.width || 595);
      const dpr = Math.min(window.devicePixelRatio || 2.0, 2.5);
      const renderScale = baseScale * dpr;

      const viewport = page.getViewport({ scale: renderScale });
      const displayWidth = Math.floor(viewport.width / dpr);
      const displayHeight = Math.floor(viewport.height / dpr);

      // 设置物理像素与 CSS 显示像素
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      const ctx = canvas.getContext('2d', { alpha: false });
      // 预填纯白背景，避免透明背景显示为黑色/白板
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
      // 在 Canvas 上绘制醒目的错误提示
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

  /**
   * 生成封面缩略图 DataURL
   */
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
