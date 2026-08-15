/**
 * 手写笔专业浮动工具箱 (PenToolbox)
 * 具备：
 * 1. 极致半透明水晶毛玻璃悬浮胶囊
 * 2. 全屏自由拖拽任意移动位置
 * 3. 智能视口边界避让算法 (Smart Viewport Collision Avoidance)：无论停在任何边缘，展开面板 100% 完整可见
 */

import { MUSICAL_STAMPS } from '../core/penEngine/stamps.js';
import { appState } from '../core/state.js';

export class PenToolbox {
  constructor(containerElement, scoreReader) {
    this.container = containerElement;
    this.reader = scoreReader;
    this.isExpanded = false;
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
    this.initDraggable();

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

    // 智能视口边界避让：展开时确保面板完整容纳在屏幕中
    if (this.isExpanded) {
      this.adjustPositionForExpandedPanel();
    }

    appState.set({ isPenActive: this.isExpanded });
    this.reader.syncPenToolToRenderers();
  }

  adjustPositionForExpandedPanel() {
    requestAnimationFrame(() => {
      const container = this.container;
      const rect = container.getBoundingClientRect();
      const panelWidth = 340;
      const panelHeight = 230;

      let newLeft = rect.left;
      let newTop = rect.top;

      // 右边缘溢出检测
      if (newLeft + panelWidth > window.innerWidth - 12) {
        newLeft = window.innerWidth - panelWidth - 12;
      }
      // 左边缘溢出检测
      if (newLeft < 12) {
        newLeft = 12;
      }
      // 下边缘溢出检测
      if (newTop + panelHeight > window.innerHeight - 12) {
        newTop = window.innerHeight - panelHeight - 12;
      }
      // 上边缘溢出检测 (留出顶部工具栏高度)
      if (newTop < 56) {
        newTop = 56;
      }

      container.style.left = `${Math.round(newLeft)}px`;
      container.style.top = `${Math.round(newTop)}px`;
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    });
  }

  render() {
    const activeTool = appState.get('activePenTool');
    const activeColor = appState.get('penColor');

    this.container.innerHTML = `
      <div class="pen-toolbox ${this.isExpanded ? 'expanded' : 'collapsed'}" id="penToolboxWidget">
        <!-- 极致半透明可移动手柄胶囊 -->
        <button class="toolbox-toggle-btn draggable-pill" id="toolboxToggleBtn" title="按住可拖动位置，轻触展开批注">
          <span class="tool-icon">🖊️</span>
          <span class="pill-text">${this.isExpanded ? '收起' : '批注'}</span>
        </button>

        <div class="toolbox-content">
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

  initDraggable() {
    const pillBtn = this.container.querySelector('#toolboxToggleBtn');
    const container = this.container;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;
    let hasMoved = false;

    const onPointerDown = (e) => {
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = container.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      container.style.bottom = 'auto';
      container.style.right = 'auto';
      container.style.left = `${initialLeft}px`;
      container.style.top = `${initialTop}px`;

      pillBtn.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMoved = true;
      }

      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

      newLeft = Math.max(8, Math.min(newLeft, window.innerWidth - container.offsetWidth - 8));
      newTop = Math.max(52, Math.min(newTop, window.innerHeight - container.offsetHeight - 8));

      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      pillBtn.releasePointerCapture(e.pointerId);

      if (!hasMoved) {
        this.toggle();
      }
    };

    pillBtn?.addEventListener('pointerdown', onPointerDown);
    pillBtn?.addEventListener('pointermove', onPointerMove);
    pillBtn?.addEventListener('pointerup', onPointerUp);
    pillBtn?.addEventListener('pointercancel', onPointerUp);
  }

  bindEvents() {
    this.container.querySelector('#toolboxMinimizeBtn')?.addEventListener('click', () => {
      this.toggle(false);
    });

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

      const colorBtn = e.target.closest('.color-dot');
      if (colorBtn) {
        const color = colorBtn.dataset.color;
        appState.set({ penColor: color });
        this.reader.syncPenToolToRenderers();
      }

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

    this.container.querySelector('#strokeSizeSlider')?.addEventListener('input', (e) => {
      const size = parseInt(e.target.value, 10);
      appState.set({ penSize: size });
      this.reader.syncPenToolToRenderers();
    });

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
      toggleBtnText.textContent = this.isExpanded ? '收起' : '批注';
    }
  }
}
