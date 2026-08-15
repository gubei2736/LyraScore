/**
 * 平板演奏防息屏管理 (Screen Wake Lock API)
 */

class ScreenWakeLockManager {
  constructor() {
    this.wakeLock = null;
    this.isRequested = false;

    // 页面可见性改变时重新请求
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', async () => {
        if (this.isRequested && document.visibilityState === 'visible') {
          await this.request();
        }
      });
    }
  }

  async request() {
    this.isRequested = true;
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
        return true;
      } catch (err) {
        console.warn('Wake Lock 请求失败:', err);
        return false;
      }
    }
    return false;
  }

  async release() {
    this.isRequested = false;
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
      } catch (err) {
        console.warn('Wake Lock 释放失败:', err);
      }
    }
  }
}

export const wakeLockManager = new ScreenWakeLockManager();
