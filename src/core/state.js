/**
 * 全局应用状态管理与音乐调式常量
 */

export const KEY_SIGNATURES = [
  { id: 'C_Major', name: 'C 大调 (C Major)', sharpsFlats: '无升降号', mode: 'major' },
  { id: 'a_minor', name: 'a 小调 (a minor)', sharpsFlats: '无升降号', mode: 'minor' },
  { id: 'G_Major', name: 'G 大调 (G Major)', sharpsFlats: '1 升号 (♯F)', mode: 'major' },
  { id: 'e_minor', name: 'e 小调 (e minor)', sharpsFlats: '1 升号 (♯F)', mode: 'minor' },
  { id: 'F_Major', name: 'F 大调 (F Major)', sharpsFlats: '1 降号 (♭B)', mode: 'major' },
  { id: 'd_minor', name: 'd 小调 (d minor)', sharpsFlats: '1 降号 (♭B)', mode: 'minor' },
  { id: 'D_Major', name: 'D 大调 (D Major)', sharpsFlats: '2 升号 (♯F ♯C)', mode: 'major' },
  { id: 'b_minor', name: 'b 小调 (b minor)', sharpsFlats: '2 升号 (♯F ♯C)', mode: 'minor' },
  { id: 'Bb_Major', name: 'B♭ 大调 (B♭ Major)', sharpsFlats: '2 降号 (♭B ♭E)', mode: 'major' },
  { id: 'g_minor', name: 'g 小调 (g minor)', sharpsFlats: '2 降号 (♭B ♭E)', mode: 'minor' },
  { id: 'A_Major', name: 'A 大调 (A Major)', sharpsFlats: '3 升号 (♯F ♯C ♯G)', mode: 'major' },
  { id: 'f_sharp_minor', name: 'f♯ 小调 (f♯ minor)', sharpsFlats: '3 升号 (♯F ♯C ♯G)', mode: 'minor' },
  { id: 'Eb_Major', name: 'E♭ 大调 (E♭ Major)', sharpsFlats: '3 降号 (♭B ♭E ♭A)', mode: 'major' },
  { id: 'c_minor', name: 'c 小调 (c minor)', sharpsFlats: '3 降号 (♭B ♭E ♭A)', mode: 'minor' },
  { id: 'E_Major', name: 'E 大调 (E Major)', sharpsFlats: '4 升号 (♯F ♯C ♯G ♯D)', mode: 'major' },
  { id: 'c_sharp_minor', name: 'c♯ 小调 (c♯ minor)', sharpsFlats: '4 升号 (♯F ♯C ♯G ♯D)', mode: 'minor' },
  { id: 'Ab_Major', name: 'A♭ 大调 (A♭ Major)', sharpsFlats: '4 降号 (♭B ♭E ♭A ♭D)', mode: 'major' },
  { id: 'f_minor', name: 'f 小调 (f minor)', sharpsFlats: '4 降号 (♭B ♭E ♭A ♭D)', mode: 'minor' },
  { id: 'B_Major', name: 'B 大调 (B Major)', sharpsFlats: '5 升号 (♯F ♯C ♯G ♯D ♯A)', mode: 'major' },
  { id: 'g_sharp_minor', name: 'g♯ 小调 (g♯ minor)', sharpsFlats: '5 升号 (♯F ♯C ♯G ♯D ♯A)', mode: 'minor' },
  { id: 'Db_Major', name: 'D♭ 大调 (D♭ Major)', sharpsFlats: '5 降号 (♭B ♭E ♭A ♭D ♭G)', mode: 'major' },
  { id: 'bb_minor', name: 'b♭ 小调 (b♭ minor)', sharpsFlats: '5 降号 (♭B ♭E ♭A ♭D ♭G)', mode: 'minor' }
];

export const DEFAULT_TAGS = [
  '练习中',
  '已掌握',
  '古典',
  '流行',
  '考级',
  '视奏',
  '四手联弹',
  '伴奏',
  '独奏',
  '草稿创作'
];

class AppState {
  constructor() {
    this.state = {
      currentView: 'library', // 'library' | 'reader'
      currentScore: null,
      currentPage: 0,
      totalPages: 1,
      theme: localStorage.getItem('lyra_theme') || 'parchment', // 'parchment' | 'dark' | 'light'
      layoutMode: 'single', // 'single' | 'double' | 'scroll'
      isPenActive: true, // 是否激活手写笔模式
      activePenTool: 'fountain', // 'fountain' | 'ballpoint' | 'highlighter' | 'eraser' | 'stamp' | 'line'
      penColor: '#1a56db',
      penSize: 4,
      currentStamp: null,
      isAutoFlipping: false,
      autoFlipMode: 'flip', // 'flip' | 'scroll'
      flipIntervalSec: 15, // 翻页秒数
      scrollSpeed: 30, // 滚动速度 (px/s)
      isPerformanceMode: false, // 舞台沉浸演奏模式（隐藏所有工具栏）
      searchQuery: '',
      selectedTagFilter: null,
      selectedKeyFilter: null
    };

    this.listeners = new Set();
  }

  get(key) {
    return this.state[key];
  }

  getAll() {
    return { ...this.state };
  }

  set(updates) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...updates };

    if (updates.theme) {
      localStorage.setItem('lyra_theme', updates.theme);
      document.documentElement.setAttribute('data-theme', updates.theme);
    }

    this.notify(this.state, prevState);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(nextState, prevState) {
    for (const listener of this.listeners) {
      try {
        listener(nextState, prevState);
      } catch (err) {
        console.error('State listener error:', err);
      }
    }
  }
}

export const appState = new AppState();
