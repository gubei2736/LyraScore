/**
 * PDF 乐谱渲染引擎 (基于 Mozilla PDF.js)
 * 具备强壮的离线兼容性、多数据格式容错与高清 DPR 自适应
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
  }

  async load(fileData) {
    this.pageCache.clear();
    if (!fileData) {
      throw new Error('未提供有效的 PDF 文件数据');
    }

    let pdfData = null;

    if (fileData instanceof Blob) {
      const buffer = await fileData.arrayBuffer();
      pdfData = new Uint8Array(buffer);
    } else if (fileData instanceof ArrayBuffer) {
      // 复制一份副本以防止 Detached ArrayBuffer 异常
      pdfData = new Uint8Array(fileData.slice(0));
    } else if (fileData instanceof Uint8Array) {
      pdfData = new Uint8Array(fileData.buffer.slice(0));
    } else if (typeof fileData === 'string' && fileData.startsWith('data:')) {
      const base64 = fileData.split(',')[1];
      const binaryStr = atob(base64);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      pdfData = bytes;
    } else {
      throw new Error('未知的 PDF 数据格式');
    }

    try {
      const loadingTask = pdfjsLib.getDocument({
        data: pdfData,
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
      throw new Error('PDF 乐谱文件解析失败: ' + (err.message || err));
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
    if (!this.pdfDoc || pageNum < 1 || pageNum > this.pdfDoc.numPages) return null;

    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      // 计算安全视口宽度（保证不为 0 或 NaN）
      const safeContainerWidth = Math.max(containerWidth || 800, 320);
      const baseScale = safeContainerWidth / (unscaledViewport.width || 595);
      const dpr = Math.min(window.devicePixelRatio || 2.0, 2.5);
      const renderScale = Math.max(baseScale * dpr, 0.5);

      const viewport = page.getViewport({ scale: renderScale });
      const ctx = canvas.getContext('2d', { alpha: false });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const displayWidth = Math.floor(viewport.width / dpr);
      const displayHeight = Math.floor(viewport.height / dpr);

      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
        background: '#ffffff'
      };

      await page.render(renderContext).promise;

      return {
        width: displayWidth,
        height: displayHeight,
        rawWidth: viewport.width,
        rawHeight: viewport.height
      };
    } catch (err) {
      console.error(`渲染 PDF 第 ${pageNum} 页失败:`, err);
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
      await this.renderPage(1, canvas, maxWidth);
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch (e) {
      console.warn('生成缩略图失败:', e);
      return null;
    }
  }

  destroy() {
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
