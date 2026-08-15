/**
 * IndexedDB 乐谱库与笔迹存储服务 (LyraScore DB)
 * 支持大文件 PDF、MusicXML 矢量谱、多页图片乐谱与多图层手写笔迹高速本地存储
 */

const DB_NAME = 'LyraScoreDB';
const DB_VERSION = 1;

class ScoreDatabase {
  constructor() {
    this.db = null;
    this.initPromise = this.open();
  }

  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // 乐谱主表
        if (!db.objectStoreNames.contains('scores')) {
          const scoreStore = db.createObjectStore('scores', { keyPath: 'id' });
          scoreStore.createIndex('format', 'format', { unique: false });
          scoreStore.createIndex('keySignature', 'keySignature', { unique: false });
          scoreStore.createIndex('lastReadTime', 'lastReadTime', { unique: false });
          scoreStore.createIndex('isFavorite', 'isFavorite', { unique: false });
          scoreStore.createIndex('originalScoreId', 'originalScoreId', { unique: false });
        }

        // 笔迹图层表
        if (!db.objectStoreNames.contains('annotations')) {
          const annStore = db.createObjectStore('annotations', { keyPath: 'id' });
          annStore.createIndex('scoreId', 'scoreId', { unique: false });
          annStore.createIndex('scoreId_page', ['scoreId', 'pageIndex'], { unique: true });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.error('IndexedDB 打开失败:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  async ready() {
    if (!this.db) {
      await this.initPromise;
    }
    return this.db;
  }

  // ================= 乐谱 CRUD 操作 =================

  async getAllScores() {
    const db = await this.ready();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('scores', 'readonly');
      const store = tx.objectStore('scores');
      const request = store.getAll();
      request.onsuccess = () => {
        // 默认按最后阅读时间/更新时间降序排序
        const list = request.result || [];
        list.sort((a, b) => (b.lastReadTime || b.updateTime || 0) - (a.lastReadTime || a.updateTime || 0));
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getScoreById(id) {
    const db = await this.ready();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('scores', 'readonly');
      const store = tx.objectStore('scores');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveScore(score) {
    const db = await this.ready();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('scores', 'readwrite');
      const store = tx.objectStore('scores');
      const item = {
        ...score,
        updateTime: Date.now()
      };
      const request = store.put(item);
      request.onsuccess = () => resolve(item);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteScore(id) {
    const db = await this.ready();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['scores', 'annotations'], 'readwrite');
      const scoreStore = tx.objectStore('scores');
      const annStore = tx.objectStore('annotations');

      scoreStore.delete(id);

      // 同时清理对应乐谱的所有手写笔迹
      const annIndex = annStore.index('scoreId');
      const req = annIndex.getAllKeys(id);
      req.onsuccess = () => {
        const keys = req.result || [];
        keys.forEach(k => annStore.delete(k));
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * 创建乐谱副本 (Fork / Clone Score)
   * 副本继承原谱的乐谱数据，但拥有独立的 ID、独立的笔迹与版本说明
   */
  async createScoreCopy(originalScoreId, customTitle = null, copyNote = '个人练习批注版') {
    const original = await this.getScoreById(originalScoreId);
    if (!original) throw new Error('原乐谱不存在');

    const copyId = 'score_copy_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newTitle = customTitle || `${original.title} (副本)`;

    const newScore = {
      ...original,
      id: copyId,
      title: newTitle,
      isCopy: true,
      originalScoreId: originalScoreId,
      copyNote: copyNote,
      tags: [...(original.tags || []), '副本'],
      createTime: Date.now(),
      updateTime: Date.now(),
      lastReadTime: Date.now()
    };

    await this.saveScore(newScore);
    return newScore;
  }

  // ================= 笔迹持久化操作 =================

  async getPageAnnotations(scoreId, pageIndex) {
    const db = await this.ready();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('annotations', 'readonly');
      const store = tx.objectStore('annotations');
      const id = `ann_${scoreId}_p_${pageIndex}`;
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ? request.result.strokes : []);
      request.onerror = () => reject(request.error);
    });
  }

  async savePageAnnotations(scoreId, pageIndex, strokes) {
    const db = await this.ready();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('annotations', 'readwrite');
      const store = tx.objectStore('annotations');
      const id = `ann_${scoreId}_p_${pageIndex}`;
      const item = {
        id,
        scoreId,
        pageIndex,
        strokes: Array.isArray(strokes) ? strokes : [],
        updateTime: Date.now()
      };
      const request = store.put(item);
      request.onsuccess = () => resolve(item);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllAnnotationsForScore(scoreId) {
    const db = await this.ready();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('annotations', 'readonly');
      const store = tx.objectStore('annotations');
      const index = store.index('scoreId');
      const request = index.getAll(scoreId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
}

export const scoreDB = new ScoreDatabase();
