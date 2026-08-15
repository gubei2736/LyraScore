/**
 * LyraScore 主应用调度中心 (Main Application Controller)
 * 具备全局容错保护、系统侧滑返回拦截与乐谱库/专注阅读台切换
 */

import './styles/base.css';
import './styles/library.css';
import './styles/reader.css';
import './styles/canvas.css';
import './styles/modals.css';

import { appState } from './core/state.js';
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

    this.setupGlobalErrorHandlers();
    this.init();
    this.setupBackNavigation();
  }

  setupGlobalErrorHandlers() {
    window.addEventListener('error', (e) => {
      console.error('[LyraScore Global Error]', e.message, e.filename, e.lineno);
    });
    window.addEventListener('unhandledrejection', (e) => {
      console.error('[LyraScore Unhandled Promise Rejection]', e.reason);
    });
  }

  setupBackNavigation() {
    // 拦截 Android 系统侧滑返回与物理返回键
    window.onAndroidBackPressed = () => {
      if (appState.get('currentView') === 'reader') {
        this.showLibrary();
        return true;
      }
      return false;
    };

    window.addEventListener('popstate', (e) => {
      if (appState.get('currentView') === 'reader') {
        this.showLibrary();
      }
    });
  }

  async init() {
    try {
      const savedTheme = localStorage.getItem('lyra_theme') || 'parchment';
      document.documentElement.setAttribute('data-theme', savedTheme);

      this.appEl.innerHTML = `
        <div id="libraryRoot" class="view-layer active"></div>
        <div id="viewerRoot" class="view-layer hidden"></div>
        <div id="modalRoot"></div>
      `;

      this.libraryContainer = document.getElementById('libraryRoot');
      this.viewerContainer = document.getElementById('viewerRoot');
      this.modalContainer = document.getElementById('modalRoot');

      this.modal = new ScoreModal(this.modalContainer, async (savedScore) => {
        await this.library.loadScores();
        if (appState.get('currentScore')?.id === savedScore.id) {
          appState.set({ currentScore: savedScore });
        }
      });

      this.library = new ScoreLibrary(this.libraryContainer, {
        onOpenScore: (score) => this.openScoreReader(score),
        onEditScore: (score) => this.modal.open(score, false),
        onCopyScore: (score) => this.modal.open(score, true)
      });

      this.viewer = new ScoreViewer(this.viewerContainer, {
        onBackToLibrary: () => this.showLibrary(),
        onEditScore: (score) => this.modal.open(score, false),
        onCopyScore: (score) => this.modal.open(score, true)
      });

    } catch (err) {
      console.error('初始化应用失败:', err);
      if (this.appEl) {
        this.appEl.innerHTML = `
          <div style="padding: 40px; text-align: center; color: #b91c1c; font-family: sans-serif;">
            <h2>LyraScore 启动异常</h2>
            <p style="margin: 16px 0; color: #4b5563;">${err.message || '未知错误'}</p>
            <button onclick="location.reload()" style="padding: 10px 20px; border-radius: 8px; background: #4f46e5; color: #fff; border: none; font-size: 16px; cursor: pointer;">重新加载</button>
          </div>
        `;
      }
    }
  }

  async openScoreReader(score) {
    this.libraryContainer.classList.remove('active');
    this.libraryContainer.classList.add('hidden');

    this.viewerContainer.classList.remove('hidden');
    this.viewerContainer.classList.add('active');

    appState.set({ currentView: 'reader' });
    try {
      history.pushState({ view: 'reader' }, '');
    } catch (_) {}

    await this.viewer.openScore(score);
  }

  showLibrary() {
    if (this.viewer) {
      this.viewer.closeViewer();
    }

    this.viewerContainer.classList.remove('active');
    this.viewerContainer.classList.add('hidden');

    this.libraryContainer.classList.remove('hidden');
    this.libraryContainer.classList.add('active');

    appState.set({ currentView: 'library' });
    this.library.loadScores();
  }
}

// 启动应用
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new LyraScoreApp());
} else {
  new LyraScoreApp();
}
