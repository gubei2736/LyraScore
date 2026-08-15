/**
 * 手写笔专业浮动工具箱 (PenToolbox)
 * 适配平板大屏触控与笔尖操作，包含压感笔、荧光笔、音乐印章、橡皮擦、撤销重做与调色盘
 * 支持完全收起与最小化至屏幕边缘，彻底避免遮挡乐谱
 */

import { MUSICAL_STAMPS } from '../core/penEngine/stamps.js';
import { appState } from '../core/state.js';

export class PenToolbox {
  constructor(containerElement, scoreReader) {
    this.container = containerElement;
    this.reader = scoreReader;
    this.isExpanded = false; // 默认收起为微型胶囊，给乐谱最大阅读空间
    this.isStampPickerOpen = false;

    this.colors = [
      '#1a56db', // 经典天琴蓝
      '#111827', // 炭黑
      '#dc2626', // 朱红
      '#fbbf24', // 荧光琥珀黄
      '#059669', // 翡翠绿
      '#7c3aed'  // 高雅紫
    ];

    this.render();
    this.bindEvents();

    appState.subscribe(() => {
      this.syncActiveState();
    });
  }

  toggle(visible) {
    if (typeof visible === 'boolean') {
      this.isExpanded = visible;
    } else {
      this.isExpanded = !this.isExpanded;
    }
    const box = this.container.querySelector('.pen-toolbox');
    if (box) {
      box.classList.toggle('expanded', this.isExpanded);
      box.classList.toggle('collapsed', !this.isExpanded);
    }
    appState.set({ isPenActive: this.isExpanded });
    this.reader.syncPenToolToRenderers();
  }

  show() {
    this.container.style.display = 'block';
  }

  hide() {
    this.container.style.display = 'none';
    appState.set({ isPenActive: false });
    this.reader.syncPenToolToRenderers();
  }

  render() {
    const activeTool = appState.get('activePenTool');
    const activeColor = appState.get('penColor');

    this.container.innerHTML = `
      <div class="pen-toolbox ${this.isExpanded ? 'expanded' : 'collapsed'}">
        <!-- 工具箱手柄 / 收起展开悬浮微型胶囊 -->
        <button class="toolbox-toggle-btn" id="toolboxToggleBtn" title="展开/收起手写笔工具箱">
          <span class="tool-icon">🖊️</span>
          <span class="pill-text">${this.isExpanded ? '收起批注' : '手写批注'}</span>
        </button>

        <div class="toolbox-content">
          <!-- 顶部工具箱标题与收起按钮 -->
          <div class="toolbox-header-row">
            <span class="toolbox-title">✍️ 乐谱手写批注</span>
            <button class="toolbox-minimize-btn" id="toolboxMinimizeBtn" title="最小化到边缘">✕</button>
          </div>

          <!-- 笔刷工具选择区 -->
          <div class="tool-group">
            <button class="tool-btn ${activeTool === 'fountain' ? 'active' : ''}" data-tool="fountain" title="压感墨水笔 (带笔锋)">
              <span class="tool-icon">✒️</span>
              <span class="tool-label">钢笔</span>
            </button>
            <button class="tool-btn ${activeTool === 'ballpoint' ? 'active' : ''}" data-tool="ballpoint" title="平滑圆珠笔 (等宽)">
              <span class="tool-icon">✏️</span>
              <span class="tool-label">圆珠</span>
            </button>
            <button class="tool-btn ${activeTool === 'highlighter' ? 'active' : ''}" data-tool="highlighter" title="荧光高亮记号笔 (半透明)">
              <span class="tool-icon">🖍️</span>
              <span class="tool-label">荧光</span>
            </button>
            <button class="tool-btn ${activeTool === 'line' ? 'active' : ''}" data-tool="line" title="小节线 / 直线标尺">
              <span class="tool-icon">📏</span>
              <span class="tool-label">直线</span>
            </button>
            <button class="tool-btn ${activeTool === 'stamp' ? 'active' : ''}" id="stampPickerToggleBtn" data-tool="stamp" title="音乐记号与指法印章">
              <span class="tool-icon">♯</span>
              <span class="tool-label">印章</span>
            </button>
            <button class="tool-btn ${activeTool === 'eraser' ? 'active' : ''}" data-tool="eraser" title="橡皮擦">
              <span class="tool-icon">🧹</span>
              <span class="tool-label">橡皮</span>
            </button>
          </div>

          <div class="tool-divider"></div>

          <!-- 调色盘与粗细控制 -->
          <div class="color-palette-group">
            ${this.colors.map(c => `
              <button class="color-dot ${activeColor === c ? 'active' : ''}" data-color="${c}" style="background-color: ${c};" title="选择颜色"></button>
            `).join('')}
          </div>

          <div class="stroke-size-group">
            <span class="size-label">粗细</span>
            <input type="range" class="size-slider" id="strokeSizeSlider" min="2" max="16" step="1" value="${appState.get('penSize') || 4}">
          </div>

          <div class="tool-divider"></div>

          <!-- 历史撤销与清屏 -->
          <div class="history-group">
            <button class="action-btn" id="undoBtn" title="撤销笔迹">
              <span class="tool-icon">↩️</span>
              <span>撤销</span>
            </button>
            <button class="action-btn" id="redoBtn" title="重做笔迹">
              <span class="tool-icon">↪️</span>
              <span>重做</span>
            </button>
            <button class="action-btn btn-clear-danger" id="clearBtn" title="清空本页全部笔迹">
              <span class="tool-icon">🗑️</span>
              <span>清空</span>
            </button>
          </div>
        </div>

        <!-- 弹出式音乐印章选择面板 -->
        <div class="stamp-popover ${this.isStampPickerOpen ? 'open' : ''}" id="stampPopover">
          <div class="stamp-popover-header">
            <span>常用五线谱记号 &amp; 钢琴指法</span>
            <button class="stamp-close-btn" id="stampCloseBtn">✕</button>
          </div>
          <div class="stamp-grid">
            ${MUSICAL_STAMPS.map(st => `
              <button class="stamp-item-btn" data-stamp-id="${st.id}" title="${st.name}">
                <span class="stamp-symbol">${st.symbol || st.altText}</span>
                <span class="stamp-name">${st.name}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // 展开/收起手柄
    this.container.querySelector('#toolboxToggleBtn')?.addEventListener('click', () => {
      this.toggle();
    });

    // 最小化按钮
    this.container.querySelector('#toolboxMinimizeBtn')?.addEventListener('click', () => {
      this.toggle(false);
    });

    // 笔刷切换
    this.container.addEventListener('click', (e) => {
      const toolBtn = e.target.closest('.tool-btn');
      if (toolBtn) {
        const tool = toolBtn.dataset.tool;
        if (tool === 'stamp') {
          this.isStampPickerOpen = !this.isStampPickerOpen;
          this.container.querySelector('#stampPopover')?.classList.toggle('open', this.isStampPickerOpen);
          if (!appState.get('currentStamp')) {
            appState.set({ currentStamp: MUSICAL_STAMPS[0] });
          }
        } else {
          this.isStampPickerOpen = false;
          this.container.querySelector('#stampPopover')?.classList.remove('open');
        }

        appState.set({ activePenTool: tool, isPenActive: true });
        this.reader.syncPenToolToRenderers();
      }

      // 颜色切换
      const colorBtn = e.target.closest('.color-dot');
      if (colorBtn) {
        const color = colorBtn.dataset.color;
        appState.set({ penColor: color });
        this.reader.syncPenToolToRenderers();
      }

      // 印章选择
      const stampItemBtn = e.target.closest('.stamp-item-btn');
      if (stampItemBtn) {
        const stampId = stampItemBtn.dataset.stampId;
        const stampObj = MUSICAL_STAMPS.find(s => s.id === stampId);
        if (stampObj) {
          appState.set({
            activePenTool: 'stamp',
            currentStamp: stampObj,
            isPenActive: true
          });
          this.isStampPickerOpen = false;
          this.container.querySelector('#stampPopover')?.classList.remove('open');
          this.reader.syncPenToolToRenderers();
        }
      }
    });

    // 粗细滑块
    this.container.querySelector('#strokeSizeSlider')?.addEventListener('input', (e) => {
      const size = parseInt(e.target.value, 10);
      appState.set({ penSize: size });
      this.reader.syncPenToolToRenderers();
    });

    // 撤销 / 重做 / 清屏
    this.container.querySelector('#undoBtn')?.addEventListener('click', () => {
      this.reader.undoCurrentPage();
    });
    this.container.querySelector('#redoBtn')?.addEventListener('click', () => {
      this.reader.redoCurrentPage();
    });
    this.container.querySelector('#clearBtn')?.addEventListener('click', () => {
      if (confirm('确认清空当前页的所有手写笔迹吗？')) {
        this.reader.clearCurrentPage();
      }
    });

    this.container.querySelector('#stampCloseBtn')?.addEventListener('click', () => {
      this.isStampPickerOpen = false;
      this.container.querySelector('#stampPopover')?.classList.remove('open');
    });
  }

  syncActiveState() {
    const activeTool = appState.get('activePenTool');
    const activeColor = appState.get('penColor');

    this.container.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === activeTool);
    });

    this.container.querySelectorAll('.color-dot').forEach(dot => {
      dot.classList.toggle('active', dot.dataset.color === activeColor);
    });

    const toggleBtnText = this.container.querySelector('.pill-text');
    if (toggleBtnText) {
      toggleBtnText.textContent = this.isExpanded ? '收起批注' : '手写批注';
    }
  }
}
