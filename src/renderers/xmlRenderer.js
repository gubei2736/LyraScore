/**
 * MusicXML 乐谱矢量渲染引擎 (基于 OpenSheetMusicDisplay - OSMD)
 * 深度适配 MusicXML 纯文本 (.xml / .musicxml) 与 Zip 压缩二进制 (.mxl) 格式
 */

import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

export class XmlScoreRenderer {
  constructor() {
    this.osmd = null;
    this.container = null;
    this.isLoaded = false;
    this.rawContent = null;
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
   * 判断数据是否为 Zip/MXL 压缩格式 (Magic Bytes: 0x50, 0x4B)
   */
  isZipData(data) {
    if (!data) return false;
    if (data instanceof ArrayBuffer) {
      const u8 = new Uint8Array(data);
      return u8.length >= 2 && u8[0] === 0x50 && u8[1] === 0x4B;
    }
    if (data instanceof Uint8Array) {
      return data.length >= 2 && data[0] === 0x50 && data[1] === 0x4B;
    }
    if (typeof data === 'string') {
      return data.startsWith('PK');
    }
    return false;
  }

  /**
   * 加载 XML / MusicXML / MXL 内容
   * @param {string|ArrayBuffer|Uint8Array|Blob} xmlInput 
   * @param {HTMLElement} [containerElement] 可选容器
   */
  async load(xmlInput, containerElement) {
    let loadPayload = xmlInput;

    if (xmlInput instanceof Blob) {
      loadPayload = await xmlInput.arrayBuffer();
    }

    // 区分处理：Zip/MXL 保持二进制，非 Zip 转为文本字符串
    let xmlText = '';
    const isMxl = this.isZipData(loadPayload);

    if (!isMxl) {
      if (typeof loadPayload === 'string') {
        xmlText = loadPayload;
      } else if (loadPayload instanceof ArrayBuffer || loadPayload instanceof Uint8Array) {
        try {
          xmlText = new TextDecoder('utf-8').decode(loadPayload);
          loadPayload = xmlText;
        } catch (_) {}
      }
    }

    this.rawContent = loadPayload;

    // 挂载到容器并渲染
    if (containerElement) {
      this.init(containerElement);
    }

    if (!this.osmd && !this.container) {
      // 离线预解析阶段：建立临时离线节点加载元数据
      const tempDiv = document.createElement('div');
      tempDiv.style.display = 'none';
      document.body.appendChild(tempDiv);
      this.init(tempDiv);

      try {
        await this.osmd.load(loadPayload);
        this.isLoaded = true;
      } catch (err) {
        console.warn('离线预加载 OSMD 失败:', err);
      } finally {
        if (tempDiv.parentNode) {
          tempDiv.parentNode.removeChild(tempDiv);
        }
      }
    } else if (this.osmd) {
      await this.osmd.load(loadPayload);
      this.isLoaded = true;
      this.osmd.render();
    }

    // 提取乐谱元数据 (从 OSMD sheet 获取或 DOMParser 回退)
    let title = this.osmd?.sheet?.title?.text || 'MusicXML 乐谱';
    let composer = this.osmd?.sheet?.composer?.text || '未知作曲家';

    if ((!title || title === 'MusicXML 乐谱') && xmlText) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'text/xml');
        const titleNode = doc.querySelector('work-title') || doc.querySelector('movement-title');
        if (titleNode?.textContent?.trim()) {
          title = titleNode.textContent.trim();
        }
        const composerNode = doc.querySelector('creator[type="composer"]') || doc.querySelector('creator');
        if (composerNode?.textContent?.trim()) {
          composer = composerNode.textContent.trim();
        }
      } catch (_) {}
    }

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
