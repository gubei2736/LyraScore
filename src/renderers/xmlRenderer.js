/**
 * MusicXML 乐谱矢量渲染引擎 (基于 OpenSheetMusicDisplay - OSMD)
 * 支持 MusicXML / XML 格式的矢量五线谱排版与动态视口缩放
 */

import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

export class XmlScoreRenderer {
  constructor() {
    this.osmd = null;
    this.container = null;
    this.isLoaded = false;
    this.xmlString = '';
  }

  /**
   * 初始化 OSMD 到指定容器元素
   */
  init(containerElement) {
    this.container = containerElement;
    this.container.innerHTML = '';

    this.osmd = new OpenSheetMusicDisplay(this.container, {
      autoResize: true,
      backend: 'svg',
      drawTitle: true,
      drawSubtitle: true,
      drawComposer: true,
      drawLyricist: true,
      drawCredits: true,
      drawPartNames: true,
      drawFingerings: true,
      renderSingleHorizontalStaffline: false
    });
  }

  async load(xmlContent, containerElement) {
    if (containerElement) {
      this.init(containerElement);
    }
    if (!this.osmd && this.container) {
      this.init(this.container);
    }

    this.xmlString = xmlContent;
    await this.osmd.load(xmlContent);
    this.isLoaded = true;

    // 初次渲染
    this.osmd.render();

    const title = this.osmd.sheet?.title?.text || '未命名 MusicXML 乐谱';
    const composer = this.osmd.sheet?.composer?.text || '未知作曲家';

    return {
      title,
      composer,
      numPages: 1 // OSMD 默认按整谱或页面排版
    };
  }

  setZoom(zoomFactor) {
    if (this.osmd && this.isLoaded) {
      this.osmd.zoom = zoomFactor;
      this.osmd.render();
    }
  }

  render() {
    if (this.osmd && this.isLoaded) {
      this.osmd.render();
    }
  }

  /**
   * 生成缩略图
   */
  async generateThumbnail() {
    if (!this.container) return null;
    const svgEl = this.container.querySelector('svg');
    if (!svgEl) return null;

    return new Promise((resolve) => {
      const xml = new XMLSerializer().serializeToString(svgEl);
      const svg64 = btoa(unescape(encodeURIComponent(xml)));
      const image64 = 'data:image/svg+xml;base64,' + svg64;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = (img.height / img.width) * 300 || 400;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(null);
      img.src = image64;
    });
  }

  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.osmd = null;
    this.isLoaded = false;
  }
}
