import { defineConfig } from 'vite';

export default defineConfig({
  root: './',
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          osmd: ['opensheetmusicdisplay'],
          pdfjs: ['pdfjs-dist']
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: false
  }
});
