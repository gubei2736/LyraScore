/**
 * MusicXML 乐谱矢量渲染引擎 (基于 OpenSheetMusicDisplay - OSMD)
 * 健壮容错版：支持纯文本/二进制/离线预解析与动态 DOM 容器渲染
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

  /**
   * 加载 XML / MusicXML 内容
   * @param {string|ArrayBuffer|Blob} xmlInput 
   * @param {HTMLElement} [containerElement] 可选容器
   */
  async load(xmlInput, containerElement) {
    let xmlText = '';

    if (typeof xmlInput === 'string') {
      xmlText = xmlInput;
    } else if (xmlInput instanceof Blob) {
      xmlText = await xmlInput.text();
    } else if (xmlInput instanceof ArrayBuffer) {
      const decoder = new TextDecoder('utf-8');
      xmlText = decoder.decode(xmlInput);
    }

    this.xmlString = xmlText;

    // 如果传入了容器或者已经有容器，进行 OSMD 实装渲染
    if (containerElement) {
      this.init(containerElement);
    }

    if (!this.osmd && !this.container) {
      // 离线预解析阶段：创建一个虚拟容器预载以获取元数据
      const tempDiv = document.createElement('div');
      tempDiv.style.display = 'none';
      document.body.appendChild(tempDiv);
      this.init(tempDiv);

      try {
        await this.osmd.load(this.xmlString);
        this.isLoaded = true;
      } catch (err) {
        console.warn('离线预加载 OSMD 失败，回退到 DOMParser 解析:', err);
      } finally {
        if (tempDiv.parentNode) {
          tempDiv.parentNode.removeChild(tempDiv);
        }
      }
    } else if (this.osmd) {
      await this.osmd.load(this.xmlString);
      this.isLoaded = true;
      this.osmd.render();
    }

    // 提取标题与作曲家
    let title = 'MusicXML 乐谱';
    let composer = '未知作曲家';

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(this.xmlString, 'text/xml');
      const titleNode = doc.querySelector('work-title') || doc.querySelector('movement-title');
      if (titleNode && titleNode.textContent.trim()) {
        title = titleNode.textContent.trim();
      }
      const composerNode = doc.querySelector('creator[type="composer"]') || doc.querySelector('creator');
      if (composerNode && composerNode.textContent.trim()) {
        composer = composerNode.textContent.trim();
      }
    } catch (_) {}

    return {
      title,
      composer,
      numPages: 1
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
