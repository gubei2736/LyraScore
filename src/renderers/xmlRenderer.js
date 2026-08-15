/**
 * MusicXML 乐谱矢量渲染引擎 (基于 OpenSheetMusicDisplay - OSMD)
 * 具备 JSZip 预解压、XML 自愈清洗 (去除 DTD/BOM 阻断) 与自适应矢量渲染
 */

import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import JSZip from 'jszip';

export class XmlScoreRenderer {
  constructor() {
    this.osmd = null;
    this.container = null;
    this.isLoaded = false;
    this.cleanXmlString = '';
    this.scoreInfo = {
      title: 'MusicXML 乐谱',
      composer: '未知作曲家',
      numPages: 1
    };
  }

  /**
   * 从各种输入 (MXL Zip / 纯文本 XML / ArrayBuffer / Blob) 提取并清洗出绝对合法的 XML 字符串
   */
  static async extractAndSanitizeXml(input) {
    if (!input) throw new Error('未提供乐谱文件数据');

    let rawBuffer = null;
    let rawString = null;

    if (input instanceof Blob) {
      rawBuffer = await input.arrayBuffer();
    } else if (input instanceof ArrayBuffer) {
      rawBuffer = input;
    } else if (input instanceof Uint8Array) {
      rawBuffer = input.buffer;
    } else if (typeof input === 'string') {
      if (input.startsWith('PK')) {
        // 字符串形式的 Zip 数据转为二进制
        const len = input.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = input.charCodeAt(i) & 0xff;
        }
        rawBuffer = bytes.buffer;
      } else {
        rawString = input;
      }
    }

    // 1. 如果是 Zip / MXL 压缩包，使用 JSZip 进行高精度解包
    if (rawBuffer) {
      const u8 = new Uint8Array(rawBuffer);
      const isZip = u8.length >= 2 && u8[0] === 0x50 && u8[1] === 0x4B;

      if (isZip) {
        try {
          const zip = await JSZip.loadAsync(rawBuffer);
          let targetPath = null;

          // 优先通过 META-INF/container.xml 查找乐谱主文件路径
          const containerFile = zip.file('META-INF/container.xml');
          if (containerFile) {
            const containerXml = await containerFile.async('text');
            const match = containerXml.match(/full-path="([^"]+)"/i);
            if (match && match[1]) {
              targetPath = match[1];
            }
          }

          if (targetPath && zip.file(targetPath)) {
            rawString = await zip.file(targetPath).async('text');
          } else {
            // 遍历查找首个非 MACOSX 的 xml 文件
            const xmlFiles = Object.keys(zip.files).filter(k => 
              k.toLowerCase().endsWith('.xml') && !k.startsWith('__MACOSX') && !k.startsWith('META-INF')
            );
            if (xmlFiles.length > 0) {
              rawString = await zip.file(xmlFiles[0]).async('text');
            }
          }
        } catch (zipErr) {
          console.warn('JSZip 解包 MXL 出现警告:', zipErr);
        }
      }

      if (!rawString && rawBuffer) {
        rawString = new TextDecoder('utf-8').decode(rawBuffer);
      }
    }

    if (!rawString) {
      throw new Error('无法从文件中提取有效的 MusicXML 数据');
    }

    // 2. 自愈清洗 XML 字符串 (消除 Android WebView DOMParser 阻断)
    return XmlScoreRenderer.sanitizeXml(rawString);
  }

  /**
   * XML 自愈与格式净化
   */
  static sanitizeXml(xml) {
    if (!xml) return '';

    // 去除 UTF-8 BOM
    let clean = xml.replace(/^\uFEFF/, '').trim();

    // 剔除可能导致离线解析卡死的外部 DTD 实体引用
    clean = clean.replace(/<!DOCTYPE\s+[^>]+>/gi, '');

    // 提取起始 XML 或根节点
    const rootIndex = clean.search(/<(\?xml|score-partwise|score-timewise|opus)/i);
    if (rootIndex > 0) {
      clean = clean.substring(rootIndex);
    }

    return clean;
  }

  /**
   * 初始化 OSMD
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
   * 解析并渲染 MusicXML
   */
  async load(xmlInput, containerElement) {
    // 1. 提取并自愈清洗出纯净 XML 文本
    const cleanXml = await XmlScoreRenderer.extractAndSanitizeXml(xmlInput);
    this.cleanXmlString = cleanXml;

    // 2. 提取标题与作曲家元数据
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(cleanXml, 'text/xml');
      const titleNode = doc.querySelector('work-title') || doc.querySelector('movement-title');
      if (titleNode?.textContent?.trim()) {
        this.scoreInfo.title = titleNode.textContent.trim();
      }
      const composerNode = doc.querySelector('creator[type="composer"]') || doc.querySelector('creator');
      if (composerNode?.textContent?.trim()) {
        this.scoreInfo.composer = composerNode.textContent.trim();
      }
    } catch (_) {}

    // 3. 若提供了容器，立即装载并渲染
    if (containerElement) {
      this.init(containerElement);
      await this.osmd.load(this.cleanXmlString);
      this.isLoaded = true;
      this.osmd.render();

      if (this.osmd.sheet?.title?.text) {
        this.scoreInfo.title = this.osmd.sheet.title.text;
      }
      if (this.osmd.sheet?.composer?.text) {
        this.scoreInfo.composer = this.osmd.sheet.composer.text;
      }
    }

    return this.scoreInfo;
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
