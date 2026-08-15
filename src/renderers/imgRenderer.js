/**
 * 图片乐谱渲染引擎 (PNG, JPG, WEBP, SVG)
 * 支持单张或多页图片乐谱的高清排版与视口自适应
 */

export class ImageScoreRenderer {
  constructor() {
    this.images = []; // Array of Image objects
    this.isLoaded = false;
  }

  /**
   * 加载图片数据 (可以是单张 DataURL/Blob 或 DataURL 数组)
   */
  async load(imageData) {
    this.images = [];
    const urls = Array.isArray(imageData) ? imageData : [imageData];

    const loadPromises = urls.map(urlOrBlob => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);

        if (urlOrBlob instanceof Blob) {
          img.src = URL.createObjectURL(urlOrBlob);
        } else if (typeof urlOrBlob === 'string') {
          img.src = urlOrBlob;
        } else {
          reject(new Error('不支持的图片类型'));
        }
      });
    });

    this.images = await Promise.all(loadPromises);
    this.isLoaded = true;

    return {
      numPages: this.images.length
    };
  }

  getNumPages() {
    return this.images.length;
  }

  /**
   * 渲染指定页码到 targetCanvas
   * @param {number} pageNum 1-based
   * @param {HTMLCanvasElement} canvas
   * @param {number} containerWidth
   */
  async renderPage(pageNum, canvas, containerWidth = 800) {
    if (!this.isLoaded || pageNum < 1 || pageNum > this.images.length) return null;

    const img = this.images[pageNum - 1];
    const aspect = img.naturalHeight / img.naturalWidth;
    const targetWidth = containerWidth;
    const targetHeight = containerWidth * aspect;

    const dpr = window.devicePixelRatio || 2.0;

    canvas.width = targetWidth * dpr;
    canvas.height = targetHeight * dpr;
    canvas.style.width = `${targetWidth}px`;
    canvas.style.height = `${targetHeight}px`;

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return {
      width: targetWidth,
      height: targetHeight,
      rawWidth: canvas.width,
      rawHeight: canvas.height
    };
  }

  /**
   * 生成缩略图
   */
  async generateThumbnail(maxWidth = 300) {
    if (!this.isLoaded || this.images.length === 0) return null;
    const canvas = document.createElement('canvas');
    await this.renderPage(1, canvas, maxWidth);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  destroy() {
    this.images = [];
    this.isLoaded = false;
  }
}
