/**
 * 手写笔专业浮动工具箱 (PenToolbox)
 * 与节拍器面板 (Metronome) 采用完全一致的 Popover 视觉方案与卡片分区架构：
 * 1. 极致半透明水晶毛玻璃悬浮胶囊 (全屏自由拖拽 + 屏幕旋转比例记忆)
 * 2. 与节拍器统一风格的 Popover 卡片面板 (精致标题头、卡片分区、小节圆角容器、步进微调器)
 * 3. 笔刷类型选择卡片 (钢笔、圆珠、荧光、直线、印章、橡皮)
 * 4. 颜色与粗细卡片 (双层光圈调色盘 + 粗细滑动条与数值步进按钮)
 * 5. 纯汉字操作卡片 (撤销 / 回退 / 清空)
 * 6. 支持点击外部与右上角 ✕ 自动关闭，手写功能始终常驻
 * 7. 完备的调试日志输出 (Logcat: LyraScore-JS)
 */

import { MUSICAL_STAMPS } from '../core/penEngine/stamps.js';
import { appState } from '../core/state.js';
import { showConfirmDialog } from './ConfirmModal.js';

export class PenToolbox {
  constructor(containerElement, scoreReader) {
    this.container = containerElement;
    this.reader = scoreReader;
    this.isExpanded = false;
    this.isStampPickerOpen = false;

    // 记录用户是否手动拖拽过及相对屏幕比例 (Percent Coordinates)
    this.hasUserMoved = false;
    this.anchorRatioX = null;
    this.anchorRatioY = null;
    this.userAnchorLeft = null;
    this.userAnchorTop = null;

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
    this.initOrientationWatcher();

    appState.subscribe(() => {
      this.syncActiveState();
    });

    console.log('[PenToolbox] Initialized successfully with Metronome-style architecture.');
  }

  initOrientationWatcher() {
    window.addEventListener('resize', () => {
      this.handleScreenResize();
    });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.handleScreenResize(), 150);
    });
  }

  handleScreenResize() {
    if (!this.hasUserMoved || this.anchorRatioX === null) {
      if (!this.isExpanded) {
        this.container.style.left = '';
        this.container.style.top = '';
        this.container.style.right = '';
        this.container.style.bottom = '';
      } else {
        this.adjustPositionForExpandedPanel();
      }
      return;
    }

    const maxLeft = Math.max(8, window.innerWidth - (this.isExpanded ? 330 : 76));
    const maxTop = Math.max(56, window.innerHeight - (this.isExpanded ? 380 : 56));

    let newLeft = this.anchorRatioX * window.innerWidth;
    let newTop = this.anchorRatioY * window.innerHeight;

    newLeft = Math.min(Math.max(8, newLeft), maxLeft);
    newTop = Math.min(Math.max(56, newTop), maxTop);

    this.userAnchorLeft = newLeft;
    this.userAnchorTop = newTop;

    if (this.isExpanded) {
      this.adjustPositionForExpandedPanel();
    } else {
      this.restoreUserAnchorPosition();
    }
  }

  toggle(visible) {
    if (typeof visible === 'boolean') {
      this.isExpanded = visible;
    } else {
      this.isExpanded = !this.isExpanded;
    }

    const popover = this.container.querySelector('#penToolboxPopover');
    const pillBtn = this.container.querySelector('#toolboxToggleBtn');

    if (popover) {
      popover.classList.toggle('open', this.isExpanded);
    }
    if (pillBtn) {
      pillBtn.classList.toggle('active', this.isExpanded);
    }

    if (this.isExpanded) {
      if (this.userAnchorLeft === null) {
        const r = this.container.getBoundingClientRect();
        this.userAnchorLeft = r.left;
        this.userAnchorTop = r.top;
      }
      this.adjustPositionForExpandedPanel();
    } else {
      this.isStampPickerOpen = false;
      this.container.querySelector('#stampPopover')?.classList.remove('open');
      this.restoreUserAnchorPosition();
    }

    // 手写批注模式始终保持激活，与面板展开/收起状态完全解耦
    appState.set({ isPenActive: true });
    this.reader.syncPenToolToRenderers();
    console.log(`[PenToolbox] toggle -> isExpanded:${this.isExpanded}, isPenActive:true, currentTool:${appState.get('activePenTool')}, size:${appState.get('penSize')}`);
  }

  adjustPositionForExpandedPanel() {
    requestAnimationFrame(() => {
      const container = this.container;
      const rect = container.getBoundingClientRect();
      const panelWidth = 320;
      const panelHeight = 360;

      let safeLeft = this.userAnchorLeft !== null ? this.userAnchorLeft : rect.left;
      let safeTop = this.userAnchorTop !== null ? this.userAnchorTop : rect.top;

      if (safeLeft + panelWidth > window.innerWidth - 12) {
        safeLeft = window.innerWidth - panelWidth - 12;
      }
      if (safeLeft < 12) {
        safeLeft = 12;
      }
      if (safeTop + panelHeight > window.innerHeight - 12) {
        safeTop = window.innerHeight - panelHeight - 12;
      }
      if (safeTop < 56) {
        safeTop = 56;
      }

      container.style.left = `${Math.round(safeLeft)}px`;
      container.style.top = `${Math.round(safeTop)}px`;
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    });
  }

  restoreUserAnchorPosition() {
    if (this.hasUserMoved && this.userAnchorLeft !== null && this.userAnchorTop !== null) {
      const maxLeft = Math.max(8, window.innerWidth - 76);
      const maxTop = Math.max(56, window.innerHeight - 56);
      const safeLeft = Math.min(Math.max(8, this.userAnchorLeft), maxLeft);
      const safeTop = Math.min(Math.max(56, this.userAnchorTop), maxTop);

      this.container.style.left = `${Math.round(safeLeft)}px`;
      this.container.style.top = `${Math.round(safeTop)}px`;
      this.container.style.right = 'auto';
      this.container.style.bottom = 'auto';
    } else if (!this.hasUserMoved) {
      this.container.style.left = '';
      this.container.style.top = '';
      this.container.style.right = '';
      this.container.style.bottom = '';
    }
  }

  render() {
    const activeTool = appState.get('activePenTool') || 'fountain';
    const activeColor = appState.get('penColor') || '#1a56db';
    const currentSize = appState.get('penSize') || 4;

    this.container.innerHTML = `
      <div class="pen-toolbox-wrapper" id="penToolboxWidget">
        <!-- 悬浮水晶毛玻璃胶囊 (与节拍器顶部胶囊质感统一，可自由拖拽) -->
        <button class="toolbox-toggle-btn draggable-pill ${this.isExpanded ? 'active' : ''}" id="toolboxToggleBtn" title="轻触展开批注面板，按住可任意拖动位置">
          <span class="tool-icon">🖊️</span>
          <span class="pill-text">${this.isExpanded ? '收起' : '批注'}</span>
        </button>

        <!-- 与节拍器面板一脉相承的水晶毛玻璃 Popover 面板 -->
        <div class="pen-metro-popover ${this.isExpanded ? 'open' : ''}" id="penToolboxPopover">
          <div class="pen-popover-header">
            <span class="popover-title">✍️ 乐谱手写批注</span>
            <button class="stamp-close-btn" id="toolboxCloseBtn" title="关闭批注面板">✕</button>
          </div>

          <!-- 1. 笔刷类型选择卡片 (与节拍器重拍自定义卡片分区一致) -->
          <div class="pen-section-card">
            <div class="section-card-header">
              <span class="section-title">笔刷类型</span>
            </div>
            <div class="tool-group-grid">
              <button class="tool-btn ${activeTool === 'fountain' ? 'active' : ''}" data-tool="fountain" title="压感墨水笔 (带笔锋)">
                <span class="tool-icon">✒️</span>
                <span class="tool-label">钢笔</span>
              </button>
              <button class="tool-btn ${activeTool === 'ballpoint' ? 'active' : ''}" data-tool="ballpoint" title="平滑圆珠笔 (等宽)">
                <span class="tool-icon">✏️</span>
                <span class="tool-label">圆珠</span>
              </button>
              <button class="tool-btn ${activeTool === 'highlighter' ? 'active' : ''}" data-tool="highlighter" title="荧光高亮笔 (半透明)">
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
          </div>

          <!-- 2. 调色盘与粗细控制卡片 (与节拍器 BPM 仪表核心调节区结构一致) -->
          <div class="pen-section-card">
            <div class="section-card-header">
              <span class="section-title">颜色选择</span>
            </div>
            <div class="color-palette-row">
              ${this.colors.map(c => `
                <button class="color-dot ${activeColor === c ? 'active' : ''}" data-color="${c}" style="background-color: ${c};" title="选择颜色"></button>
              `).join('')}
            </div>

            <div class="section-card-divider"></div>

            <div class="section-card-header" style="margin-top: 4px;">
              <span class="section-title">粗细调节</span>
              <div class="size-stepper-box">
                <button class="stepper-step-btn" id="penMinusSizeBtn" title="细一些">-</button>
                <span class="size-badge-text" id="penSizeValueText">${currentSize} px</span>
                <button class="stepper-step-btn" id="penPlusSizeBtn" title="粗一些">+</button>
              </div>
            </div>
            <div class="pen-slider-row">
              <input type="range" class="size-slider" id="strokeSizeSlider" min="2" max="20" step="1" value="${currentSize}">
            </div>
          </div>

          <!-- 3. 历史记录与清空操作区 (纯汉字无图标) -->
          <div class="pen-actions-card">
            <button class="action-btn" id="undoBtn" title="撤销上一笔">撤销</button>
            <button class="action-btn" id="redoBtn" title="回退恢复笔迹">回退</button>
            <button class="action-btn btn-clear-danger" id="clearBtn" title="清空本页全部笔迹">清空</button>
          </div>
        </div>

        <!-- 弹出式音乐印章选择面板 (挂载在 Popover 旁边) -->
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

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        hasMoved = true;
        this.hasUserMoved = true;
      }

      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

      newLeft = Math.max(8, Math.min(newLeft, window.innerWidth - container.offsetWidth - 8));
      newTop = Math.max(52, Math.min(newTop, window.innerHeight - container.offsetHeight - 8));

      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;

      this.userAnchorLeft = newLeft;
      this.userAnchorTop = newTop;
      this.anchorRatioX = newLeft / window.innerWidth;
      this.anchorRatioY = newTop / window.innerHeight;
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
    // 1. 关闭按钮
    this.container.querySelector('#toolboxCloseBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle(false);
    });

    // 2. 点击工具与颜色
    this.container.addEventListener('click', (e) => {
      const toolBtn = e.target.closest('.tool-btn');
      if (toolBtn) {
        const tool = toolBtn.dataset.tool;
        console.log(`[PenToolbox] tool selected: ${tool}`);
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
        console.log(`[PenToolbox] color selected: ${color}`);
        appState.set({ penColor: color });
        this.reader.syncPenToolToRenderers();
      }

      const stampItemBtn = e.target.closest('.stamp-item-btn');
      if (stampItemBtn) {
        const stampId = stampItemBtn.dataset.stampId;
        const stampObj = MUSICAL_STAMPS.find(s => s.id === stampId);
        if (stampObj) {
          console.log(`[PenToolbox] stamp selected: ${stampObj.name}`);
          appState.set({ activePenTool: 'stamp', currentStamp: stampObj, isPenActive: true });
          this.isStampPickerOpen = false;
          this.container.querySelector('#stampPopover')?.classList.remove('open');
          this.reader.syncPenToolToRenderers();
        }
      }
    });

    // 3. 粗细滑块与步进按钮
    const slider = this.container.querySelector('#strokeSizeSlider');
    const updateSize = (newSize) => {
      const clamped = Math.max(2, Math.min(20, newSize));
      appState.set({ penSize: clamped });
      if (slider) slider.value = clamped;
      const sizeText = this.container.querySelector('#penSizeValueText');
      if (sizeText) sizeText.textContent = `${clamped} px`;
      this.reader.syncPenToolToRenderers();
      console.log(`[PenToolbox] penSize updated -> ${clamped} px (activeTool:${appState.get('activePenTool')})`);
    };

    slider?.addEventListener('input', (e) => {
      updateSize(parseInt(e.target.value, 10));
    });

    this.container.querySelector('#penMinusSizeBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      updateSize((appState.get('penSize') || 4) - 1);
    });

    this.container.querySelector('#penPlusSizeBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      updateSize((appState.get('penSize') || 4) + 1);
    });

    // 4. 撤销 / 回退 / 清空
    this.container.querySelector('#undoBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('[PenToolbox] undo triggered');
      this.reader.undoCurrentPage();
    });

    this.container.querySelector('#redoBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('[PenToolbox] redo triggered');
      this.reader.redoCurrentPage();
    });

    this.container.querySelector('#clearBtn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      console.log('[PenToolbox] clear confirmation opened');
      const confirmed = await showConfirmDialog({
        title: '清空当前页批注',
        message: '确认清空当前页的所有手写笔迹吗？此操作无法撤销。',
        confirmText: '确认清空',
        cancelText: '取消',
        isDanger: true
      });
      if (confirmed) {
        console.log('[PenToolbox] clear confirmed for page', this.reader.currentPage);
        this.reader.clearCurrentPage();
      }
    });

    // 5. 印章关闭按钮
    this.container.querySelector('#stampCloseBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isStampPickerOpen = false;
      this.container.querySelector('#stampPopover')?.classList.remove('open');
    });

    // 6. 点击外部自动收起 Popover
    document.addEventListener('pointerdown', (e) => {
      if (this.isExpanded && !this.container.contains(e.target)) {
        // 若点击的是确认弹窗则不收起
        if (e.target.closest('.confirm-dialog-overlay')) return;
        this.toggle(false);
      }
    });
  }

  syncActiveState() {
    const activeTool = appState.get('activePenTool');
    const activeColor = appState.get('penColor');
    const currentSize = appState.get('penSize') || 4;

    this.container.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === activeTool);
    });

    this.container.querySelectorAll('.color-dot').forEach(dot => {
      dot.classList.toggle('active', dot.dataset.color === activeColor);
    });

    const sizeText = this.container.querySelector('#penSizeValueText');
    if (sizeText) {
      sizeText.textContent = `${currentSize} px`;
    }

    const slider = this.container.querySelector('#strokeSizeSlider');
    if (slider && parseInt(slider.value, 10) !== currentSize) {
      slider.value = currentSize;
    }

    const toggleBtnText = this.container.querySelector('.pill-text');
    if (toggleBtnText) {
      toggleBtnText.textContent = this.isExpanded ? '收起' : '批注';
    }
  }
}
