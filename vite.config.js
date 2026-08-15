import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';
import fs from 'fs';
import path from 'path';

// 自定义后置处理插件：移除 crossorigin 属性以兼容 Android 本地 file:/// 协议
function removeCrossOriginPlugin() {
  return {
    name: 'remove-crossorigin',
    closeBundle() {
      const htmlPath = path.resolve(__dirname, 'dist/index.html');
      if (fs.existsSync(htmlPath)) {
        let html = fs.readFileSync(htmlPath, 'utf-8');
        // 移除 script 标签上的 crossorigin 属性
        html = html.replace(/\scrossorigin(="[^"]*")?/g, '');
        fs.writeFileSync(htmlPath, html, 'utf-8');
        console.log('[LyraScore Build] Cleaned crossorigin attributes for local file:// protocol');
      }
    }
  };
}

export default defineConfig({
  root: './',
  base: './',
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11', 'Android >= 7', 'Chrome >= 60'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      renderModernChunks: false // 纯 Legacy 模式，输出标准 System/script 标签，消除 file:/// 模块跨域拦截
    }),
    removeCrossOriginPlugin()
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 4000
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: false
  }
});
