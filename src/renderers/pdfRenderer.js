/**
 * PDF 乐谱渲染引擎 (基于 Mozilla PDF.js)
 * 支持多页高清渲染、平板视网膜 DPR 自适应缩放，完全离线运行
 */

import * as pdfjsLib from 'pdfjs-dist';

export class PdfScoreRenderer {
  constructor() {
    this.pdfDoc = null;
    this.pageCache = new Map();
  }

  async load(fileData) {
    this.pageCache.clear();
    let data = fileData;
    if (fileData instanceof Blob) {
      data = await fileData.arrayBuffer();
    } else if (typeof fileData === 'string' && fileData.startsWith('data:')) {
      // DataURL 转 Uint8Array
      const base64 = fileData.split(',')[1];
      const binaryStr = atob(base64);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      data = bytes.buffer;
    }

    try {
      const loadingTask = pdfjsLib.getDocument({
        data: data,
        verbosity: 0,
        stopAtErrors: false
      });

      this.pdfDoc = await loadingTask.promise;
      return {
        numPages: this.pdfDoc.numPages
      };
    } catch (err) {
      console.error('PDF 解析失败:', err);
      throw new Error('PDF 乐谱文件解析失败，请检查文件是否损坏');
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

    const page = await this.pdfDoc.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    // 计算缩放比例适应容器宽度
    const baseScale = containerWidth / unscaledViewport.width;
    const dpr = Math.min(window.devicePixelRatio || 2.0, 2.5); // 限制最大 2.5 倍以保障大图性能
    const renderScale = baseScale * dpr;

    const viewport = page.getViewport({ scale: renderScale });
    const ctx = canvas.getContext('2d', { alpha: false });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / dpr}px`;
    canvas.style.height = `${viewport.height / dpr}px`;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
      background: '#ffffff'
    };

    await page.render(renderContext).promise;

    return {
      width: viewport.width / dpr,
      height: viewport.height / dpr,
      rawWidth: viewport.width,
      rawHeight: viewport.height
    };
  }

  /**
   * 生成封面缩略图 DataURL
   */
  async generateThumbnail(maxWidth = 300) {
    if (!this.pdfDoc) return null;
    const canvas = document.createElement('canvas');
    await this.renderPage(1, canvas, maxWidth);
    return canvas.toDataURL('image/jpeg', 0.85);
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
