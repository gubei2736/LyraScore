/**
 * 乐谱库与分类中心 (ScoreLibrary Component)
 * 包含现代乐谱网格、调式分类、标签云过滤、搜索、副本克隆与文件导入
 */

import { scoreDB } from '../core/db.js';
import { KEY_SIGNATURES } from '../core/state.js';
import { PdfScoreRenderer } from '../renderers/pdfRenderer.js';

export class ScoreLibrary {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.onOpenScore = options.onOpenScore || (() => {});
    this.onEditScore = options.onEditScore || (() => {});
    this.onCopyScore = options.onCopyScore || (() => {});

    this.scores = [];
    this.searchQuery = '';
    this.selectedTag = null;
    this.selectedKey = null;
    this.selectedFormat = 'all'; // 'all' | 'pdf' | 'xml' | 'image'
    this.onlyFavorites = false;

    this.render();
    this.loadScores();
  }

  async loadScores() {
    this.scores = await scoreDB.getAllScores();
    this.renderScoreGrid();
    this.renderTagCloud();
  }

  render() {
    this.container.innerHTML = `
      <div class="library-container">
        <!-- 隐藏的全局文件选择器 -->
        <input type="file" id="scoreFileInput" accept=".pdf,.xml,.musicxml,.mxl,image/*" multiple style="display: none;">

        <!-- 侧边分类与标签导航栏 (平板大屏分栏) -->
        <aside class="library-sidebar">
          <div class="brand-header">
            <div class="brand-logo">🎼</div>
            <div class="brand-info">
              <h1 class="brand-title">LyraScore</h1>
              <span class="brand-subtitle">平板乐谱工作站</span>
            </div>
          </div>

          <!-- 快速导入按钮 -->
          <div class="import-section">
            <button class="btn btn-primary import-btn" id="btnImportSidebar">
              <span class="btn-icon">➕</span>
              <span>导入新乐谱</span>
            </button>
            <p class="import-tip">支持 PDF / MusicXML / 图片</p>
          </div>

          <!-- 导航分类 -->
          <nav class="sidebar-nav">
            <button class="nav-item ${!this.onlyFavorites && !this.selectedKey && !this.selectedTag ? 'active' : ''}" id="navAllScores">
              <span class="nav-icon">📚</span>
              <span>全部乐谱</span>
              <span class="nav-badge" id="badgeAllCount">0</span>
            </button>
            <button class="nav-item ${this.onlyFavorites ? 'active' : ''}" id="navFavorites">
              <span class="nav-icon">⭐</span>
              <span>星标收藏</span>
            </button>
          </nav>

          <!-- 调式快速分类 -->
          <div class="sidebar-section">
            <div class="section-title">调式分类 (Key)</div>
            <select class="form-select sidebar-select" id="keyFilterSelect">
              <option value="">全部调式 (24 大小调)</option>
              ${KEY_SIGNATURES.map(k => `
                <option value="${k.id}" ${this.selectedKey === k.id ? 'selected' : ''}>
                  ${k.name}
                </option>
              `).join('')}
            </select>
          </div>

          <!-- 自定义标签云 -->
          <div class="sidebar-section">
            <div class="section-title">标签分类</div>
            <div class="tag-cloud" id="sidebarTagCloud"></div>
          </div>

          <div class="sidebar-footer">
            <div class="system-theme-switcher">
              <button class="theme-btn" data-theme="parchment" title="羊皮纸护眼主题">📜 羊皮纸</button>
              <button class="theme-btn" data-theme="dark" title="夜间演奏深色主题">🌙 演奏厅</button>
              <button class="theme-btn" data-theme="light" title="极简纯白主题">☀️ 纯白</button>
            </div>
          </div>
        </aside>

        <!-- 主内容区：搜索、过滤与书架网格 -->
        <main class="library-main">
          <!-- 顶部搜索与过滤条 -->
          <header class="library-header">
            <div class="search-bar-box">
              <span class="search-icon">🔍</span>
              <input type="text" class="search-input" id="scoreSearchInput" placeholder="搜索乐谱标题、作曲家或标签...">
            </div>

            <!-- 格式快速过滤 -->
            <div class="format-filters">
              <button class="filter-pill ${this.selectedFormat === 'all' ? 'active' : ''}" data-format="all">全部</button>
              <button class="filter-pill ${this.selectedFormat === 'pdf' ? 'active' : ''}" data-format="pdf">PDF</button>
              <button class="filter-pill ${this.selectedFormat === 'xml' ? 'active' : ''}" data-format="xml">MusicXML</button>
              <button class="filter-pill ${this.selectedFormat === 'image' ? 'active' : ''}" data-format="image">图片谱</button>
            </div>
          </header>

          <!-- 拖拽上传覆盖提示区 -->
          <div class="dropzone-area" id="dropzoneArea">
            <div class="dropzone-text">📂 将 PDF、MusicXML 或图片拖放至此处即可极速导入</div>
          </div>

          <!-- 乐谱网格列表 -->
          <div class="score-grid" id="scoreGridContainer"></div>
        </main>
      </div>
    `;

    this.bindEvents();
  }

  triggerFileImport() {
    const fileInput = this.container.querySelector('#scoreFileInput');
    if (fileInput) {
      fileInput.click();
    }
  }

  bindEvents() {
    // 导入按钮点击
    this.container.querySelector('#btnImportSidebar')?.addEventListener('click', () => {
      this.triggerFileImport();
    });

    // 搜索
    const searchInput = this.container.querySelector('#scoreSearchInput');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.renderScoreGrid();
    });

    // 调式选择
    const keySelect = this.container.querySelector('#keyFilterSelect');
    keySelect?.addEventListener('change', (e) => {
      this.selectedKey = e.target.value || null;
      this.renderScoreGrid();
    });

    // 格式过滤
    this.container.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedFormat = btn.dataset.format;
        this.container.querySelectorAll('.filter-pill').forEach(b => b.classList.toggle('active', b === btn));
        this.renderScoreGrid();
      });
    });

    // 导航分类切换
    this.container.querySelector('#navAllScores')?.addEventListener('click', () => {
      this.onlyFavorites = false;
      this.selectedKey = null;
      this.selectedTag = null;
      const ks = this.container.querySelector('#keyFilterSelect');
      if (ks) ks.value = '';
      this.container.querySelector('#navAllScores')?.classList.add('active');
      this.container.querySelector('#navFavorites')?.classList.remove('active');
      this.renderScoreGrid();
      this.renderTagCloud();
    });

    this.container.querySelector('#navFavorites')?.addEventListener('click', () => {
      this.onlyFavorites = true;
      this.container.querySelector('#navFavorites')?.classList.add('active');
      this.container.querySelector('#navAllScores')?.classList.remove('active');
      this.renderScoreGrid();
    });

    // 文件选择监听
    const fileInput = this.container.querySelector('#scoreFileInput');
    fileInput?.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        await this.handleImportFiles(files);
        fileInput.value = '';
      }
    });

    // 拖拽上传
    const dropzone = this.container.querySelector('#dropzoneArea');
    const mainEl = this.container.querySelector('.library-main');

    mainEl?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone?.classList.add('active');
    });
    mainEl?.addEventListener('dragleave', (e) => {
      if (!mainEl.contains(e.relatedTarget)) {
        dropzone?.classList.remove('active');
      }
    });
    mainEl?.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone?.classList.remove('active');
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length > 0) {
        await this.handleImportFiles(files);
      }
    });

    // 主题切换
    this.container.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('lyra_theme', theme);
      });
    });
  }

  renderTagCloud() {
    const cloudEl = this.container.querySelector('#sidebarTagCloud');
    if (!cloudEl) return;

    const tagSet = new Set();
    this.scores.forEach(s => (s.tags || []).forEach(t => tagSet.add(t)));

    if (tagSet.size === 0) {
      cloudEl.innerHTML = `<span style="font-size: 12px; color: var(--text-muted, #9ca3af);">暂无标签</span>`;
      return;
    }

    cloudEl.innerHTML = `
      <button class="tag-chip ${!this.selectedTag ? 'selected' : ''}" data-tag="">全部</button>
      ${Array.from(tagSet).map(tag => `
        <button class="tag-chip ${this.selectedTag === tag ? 'selected' : ''}" data-tag="${escapeHtml(tag)}">
          #${escapeHtml(tag)}
        </button>
      `).join('')}
    `;

    cloudEl.querySelectorAll('.tag-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedTag = btn.dataset.tag || null;
        this.renderTagCloud();
        this.renderScoreGrid();
      });
    });
  }

  renderScoreGrid() {
    const gridEl = this.container.querySelector('#scoreGridContainer');
    const badgeAll = this.container.querySelector('#badgeAllCount');
    if (badgeAll) badgeAll.textContent = this.scores.length;

    if (!gridEl) return;

    // 筛选乐谱
    const filtered = this.scores.filter(s => {
      if (this.onlyFavorites && !s.isFavorite) return false;
      if (this.selectedFormat !== 'all' && s.format !== this.selectedFormat) return false;
      if (this.selectedKey && s.keySignature !== this.selectedKey) return false;
      if (this.selectedTag && !(s.tags || []).includes(this.selectedTag)) return false;

      if (this.searchQuery) {
        const titleMatch = (s.title || '').toLowerCase().includes(this.searchQuery);
        const composerMatch = (s.composer || '').toLowerCase().includes(this.searchQuery);
        const tagsMatch = (s.tags || []).some(t => t.toLowerCase().includes(this.searchQuery));
        if (!titleMatch && !composerMatch && !tagsMatch) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      gridEl.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 60px 20px; text-align: center;">
          <div class="empty-icon" style="font-size: 56px; margin-bottom: 16px;">🎼</div>
          <h3 style="font-size: 22px; margin-bottom: 10px; color: var(--text-main, #1f2937);">
            ${this.scores.length === 0 ? '乐谱书架为空' : '未找到匹配的乐谱'}
          </h3>
          <p style="color: var(--text-muted, #6b7280); max-width: 480px; margin: 0 auto 24px; line-height: 1.6;">
            ${this.scores.length === 0 
              ? '点击下方按钮或从平板文件中选择并导入您的第一本乐谱（支持 PDF / MusicXML / 高清乐谱图片）。' 
              : '请尝试更换搜索词或清除筛选条件。'}
          </p>
          <button class="btn btn-primary btn-lg" id="btnEmptyStateImport" style="padding: 12px 28px; font-size: 16px; border-radius: 12px; cursor: pointer;">
            📥 立即导入乐谱文件
          </button>
        </div>
      `;

      gridEl.querySelector('#btnEmptyStateImport')?.addEventListener('click', () => {
        this.triggerFileImport();
      });
      return;
    }

    gridEl.innerHTML = filtered.map(s => {
      const keyObj = KEY_SIGNATURES.find(k => k.id === s.keySignature);
      const keyLabel = keyObj ? keyObj.name.split(' (')[0] : '';
      const formatBadge = s.format.toUpperCase();

      return `
        <div class="score-card ${s.isCopy ? 'is-copy-card' : ''}" data-score-id="${s.id}">
          <div class="card-cover-box">
            ${s.coverUrl ? `
              <img class="card-cover-img" src="${s.coverUrl}" alt="封面">
            ` : `
              <div class="card-cover-placeholder">
                <span class="cover-music-icon">${s.format === 'xml' ? '𝄞' : '📄'}</span>
                <span class="cover-format-tag">${formatBadge}</span>
              </div>
            `}

            <!-- 格式徽标 -->
            <span class="badge-format badge-${s.format}">${formatBadge}</span>

            <!-- 收藏按钮 -->
            <button class="favorite-star-btn ${s.isFavorite ? 'favorited' : ''}" data-action="toggle-fav" title="收藏">
              ${s.isFavorite ? '★' : '☆'}
            </button>
          </div>

          <div class="card-info">
            <h3 class="card-title" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</h3>
            <p class="card-composer">${escapeHtml(s.composer || '未知作曲家')}</p>

            ${s.isCopy ? `
              <div class="card-copy-badge" title="独立手写批注副本">
                🌿 副本: ${escapeHtml(s.copyNote || '练习版')}
              </div>
            ` : ''}

            <!-- 调式与标签 -->
            <div class="card-meta-row">
              ${keyLabel ? `<span class="meta-key-badge">${keyLabel}</span>` : ''}
              ${(s.tags || []).slice(0, 3).map(t => `
                <span class="meta-tag-pill">#${escapeHtml(t)}</span>
              `).join('')}
            </div>

            <!-- 卡片操作动作条 -->
            <div class="card-actions">
              <button class="btn btn-sm btn-primary action-open-btn" data-action="open">
                📖 开始阅读
              </button>
              <button class="btn btn-sm btn-outline" data-action="copy" title="创建独立练习/手写笔记副本">
                🌿 副本
              </button>
              <button class="btn-icon-more" data-action="edit" title="编辑元数据">
                ✏️
              </button>
              <button class="btn-icon-more btn-delete" data-action="delete" title="删除乐谱">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 绑定卡片交互事件
    gridEl.querySelectorAll('.score-card').forEach(card => {
      const scoreId = card.dataset.scoreId;
      const score = this.scores.find(s => s.id === scoreId);
      if (!score) return;

      // 打开阅读
      card.querySelector('[data-action="open"]')?.addEventListener('click', () => {
        this.onOpenScore(score);
      });
      card.querySelector('.card-cover-box')?.addEventListener('click', () => {
        this.onOpenScore(score);
      });

      // 创建副本
      card.querySelector('[data-action="copy"]')?.addEventListener('click', () => {
        this.onCopyScore(score);
      });

      // 编辑元数据
      card.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
        this.onEditScore(score);
      });

      // 收藏切换
      card.querySelector('[data-action="toggle-fav"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        score.isFavorite = !score.isFavorite;
        await scoreDB.saveScore(score);
        this.renderScoreGrid();
      });

      // 删除
      card.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`确定要删除乐谱《${score.title}》吗？其所有手写笔迹也将被移除。`)) {
          await scoreDB.deleteScore(score.id);
          await this.loadScores();
        }
      });
    });
  }

  async handleImportFiles(files) {
    for (const file of files) {
      const name = file.name;
      const ext = name.split('.').pop().toLowerCase();

      let format = 'image';
      let title = name.replace(/\.[^/.]+$/, '');
      let composer = '未知';
      let fileData = null;
      let coverUrl = null;
      let pageCount = 1;

      if (ext === 'pdf') {
        format = 'pdf';
        const arrayBuf = await file.arrayBuffer();
        fileData = arrayBuf;

        // 生成 PDF 缩略图
        try {
          const pdfR = new PdfScoreRenderer();
          const info = await pdfR.load(arrayBuf);
          pageCount = info.numPages;
          coverUrl = await pdfR.generateThumbnail(300);
          pdfR.destroy();
        } catch (err) {
          console.warn('生成 PDF 封面失败:', err);
        }
      } else if (['xml', 'musicxml', 'mxl'].includes(ext)) {
        format = 'xml';
        const text = await file.text();
        fileData = text;

        const titleMatch = text.match(/<work-title>([^<]+)<\/work-title>/i) || text.match(/<movement-title>([^<]+)<\/movement-title>/i);
        if (titleMatch) title = titleMatch[1];
        const composerMatch = text.match(/<creator type="composer">([^<]+)<\/creator>/i);
        if (composerMatch) composer = composerMatch[1];
      } else if (file.type.startsWith('image/')) {
        format = 'image';
        const reader = new FileReader();
        const dataUrl = await new Promise((res) => {
          reader.onload = () => res(reader.result);
          reader.readAsDataURL(file);
        });
        fileData = [dataUrl];
        coverUrl = dataUrl;
      }

      const newScore = {
        id: 'score_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        title,
        composer,
        format,
        keySignature: '',
        tags: ['练习中'],
        fileData,
        pageCount,
        coverUrl,
        isFavorite: false,
        createTime: Date.now(),
        updateTime: Date.now(),
        lastReadTime: Date.now()
      };

      await scoreDB.saveScore(newScore);
    }

    await this.loadScores();
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
