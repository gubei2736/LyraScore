/**
 * 乐谱与手写笔迹导出合成器 (Score & Annotation Exporter)
 * 将乐谱底层画面与上层矢量笔迹无损合成并导出
 */

export async function exportCurrentPageAsImage(pageWrapperElement, fileName = 'score_with_notes.png') {
  if (!pageWrapperElement) return;

  const baseCanvas = pageWrapperElement.querySelector('.score-base-canvas') || pageWrapperElement.querySelector('canvas');
  const penCanvas = pageWrapperElement.querySelector('.pen-overlay-canvas');

  if (!baseCanvas) return;

  const width = baseCanvas.width;
  const height = baseCanvas.height;

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width;
  exportCanvas.height = height;
  const ctx = exportCanvas.getContext('2d');

  // 1. 绘制底层乐谱
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(baseCanvas, 0, 0, width, height);

  // 2. 绘制顶层笔迹
  if (penCanvas) {
    ctx.drawImage(penCanvas, 0, 0, width, height);
  }

  // 3. 触发下载
  const dataUrl = exportCanvas.toDataURL('image/png', 0.95);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
