/**
 * LyraScore 主应用调度中心 (Main Application Controller)
 */

import './styles/base.css';
import './styles/library.css';
import './styles/reader.css';
import './styles/canvas.css';
import './styles/modals.css';

import { appState } from './core/state.js';
import { initDefaultScoresIfEmpty } from './utils/demoScores.js';
import { ScoreLibrary } from './components/ScoreLibrary.js';
import { ScoreViewer } from './components/ScoreViewer.js';
import { ScoreModal } from './components/ScoreModal.js';

class LyraScoreApp {
  constructor() {
    this.appEl = document.getElementById('app');
    this.libraryContainer = null;
    this.viewerContainer = null;
    this.modalContainer = null;

    this.library = null;
    this.viewer = null;
    this.modal = null;

    this.init();
  }

  async init() {
    // 1. 初始化主题
    const savedTheme = localStorage.getItem('lyra_theme') || 'parchment';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // 2. 构建 DOM 骨架
    this.appEl.innerHTML = `
      <div id="libraryRoot" class="view-layer active"></div>
      <div id="viewerRoot" class="view-layer hidden"></div>
      <div id="modalRoot"></div>
    `;

    this.libraryContainer = document.getElementById('libraryRoot');
    this.viewerContainer = document.getElementById('viewerRoot');
    this.modalContainer = document.getElementById('modalRoot');

    // 3. 检查并注入初始示范乐谱
    await initDefaultScoresIfEmpty();

    // 4. 初始化弹窗管理器
    this.modal = new ScoreModal(this.modalContainer, async (savedScore) => {
      await this.library.loadScores();
      if (appState.get('currentScore')?.id === savedScore.id) {
        appState.set({ currentScore: savedScore });
      }
    });

    // 5. 初始化乐谱库组件
    this.library = new ScoreLibrary(this.libraryContainer, {
      onOpenScore: (score) => this.openScoreReader(score),
      onEditScore: (score) => this.modal.open(score, false),
      onCopyScore: (score) => this.modal.open(score, true)
    });

    // 6. 初始化乐谱阅读器组件
    this.viewer = new ScoreViewer(this.viewerContainer, {
      onBackToLibrary: () => this.showLibrary(),
      onEditScore: (score) => this.modal.open(score, false),
      onCopyScore: (score) => this.modal.open(score, true)
    });

    // 7. 注册 PWA Service Worker (若支持)
    if ('serviceWorker' in navigator && !window.location.host.includes('localhost')) {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('SW registration skipped:', err);
      });
    }
  }

  async openScoreReader(score) {
    this.libraryContainer.classList.remove('active');
    this.libraryContainer.classList.add('hidden');

    this.viewerContainer.classList.remove('hidden');
    this.viewerContainer.classList.add('active');

    appState.set({ currentView: 'reader' });
    await this.viewer.openScore(score);
  }

  showLibrary() {
    this.viewerContainer.classList.remove('active');
    this.viewerContainer.classList.add('hidden');

    this.libraryContainer.classList.remove('hidden');
    this.libraryContainer.classList.add('active');

    appState.set({ currentView: 'library' });
    this.library.loadScores();
  }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  new LyraScoreApp();
});
