/**
 * 乐谱常用记号与印章库 (Musical Stamps & Symbols)
 * 支持在乐谱上精准盖印音符、表情记号、升降号、指法等
 */

export const MUSICAL_STAMPS = [
  // 变音记号
  { id: 'sharp', category: 'accidental', name: '升号 ♯', symbol: '♯', fontSize: 28, offsetX: 0, offsetY: 0 },
  { id: 'flat', category: 'accidental', name: '降号 ♭', symbol: '♭', fontSize: 28, offsetX: 0, offsetY: 0 },
  { id: 'natural', category: 'accidental', name: '还原 ♮', symbol: '♮', fontSize: 28, offsetX: 0, offsetY: 0 },
  { id: 'doublesharp', category: 'accidental', name: '重升 𝄪', symbol: '𝄪', fontSize: 28, offsetX: 0, offsetY: 0 },
  { id: 'doubleflat', category: 'accidental', name: '重降 𝄫', symbol: '𝄫', fontSize: 28, offsetX: 0, offsetY: 0 },

  // 强弱力度记号
  { id: 'dyn_p', category: 'dynamics', name: '弱 p', symbol: '𝄠', altText: 'p', italic: true, fontSize: 24 },
  { id: 'dyn_pp', category: 'dynamics', name: '很弱 pp', symbol: '𝄠𝄠', altText: 'pp', italic: true, fontSize: 24 },
  { id: 'dyn_f', category: 'dynamics', name: '强 f', symbol: '𝄡', altText: 'f', italic: true, fontSize: 24 },
  { id: 'dyn_ff', category: 'dynamics', name: '很强 ff', symbol: '𝄡𝄡', altText: 'ff', italic: true, fontSize: 24 },
  { id: 'dyn_mf', category: 'dynamics', name: '中强 mf', symbol: 'mf', italic: true, bold: true, fontSize: 20 },
  { id: 'dyn_mp', category: 'dynamics', name: '中弱 mp', symbol: 'mp', italic: true, bold: true, fontSize: 20 },
  { id: 'crescendo', category: 'dynamics', name: '渐强 <', symbol: '＜', fontSize: 26 },
  { id: 'decrescendo', category: 'dynamics', name: '渐弱 >', symbol: '＞', fontSize: 26 },

  // 演奏法记号
  { id: 'fermata', category: 'articulation', name: '延长记号', symbol: '𝄐', fontSize: 32 },
  { id: 'staccato', category: 'articulation', name: '跳音 ·', symbol: '•', fontSize: 32 },
  { id: 'accent', category: 'articulation', name: '重音 >', symbol: '∧', fontSize: 24 },
  { id: 'tenuto', category: 'articulation', name: '保持音 —', symbol: '—', fontSize: 24 },
  { id: 'trill', category: 'articulation', name: '颤音 tr', symbol: 'tr', italic: true, fontSize: 22 },
  { id: 'pedal_down', category: 'pedal', name: '踩踏板 Ped.', symbol: '𝄮', altText: 'Ped.', fontSize: 24 },
  { id: 'pedal_up', category: 'pedal', name: '放踏板 *', symbol: '𝄯', altText: '✻', fontSize: 24 },
  { id: 'breath', category: 'articulation', name: '呼吸记号 ,', symbol: '’', fontSize: 28 },

  // 钢琴指法
  { id: 'finger_1', category: 'fingering', name: '1指 (大拇指)', symbol: '1', fontSize: 20, isFingering: true },
  { id: 'finger_2', category: 'fingering', name: '2指 (食指)', symbol: '2', fontSize: 20, isFingering: true },
  { id: 'finger_3', category: 'fingering', name: '3指 (中指)', symbol: '3', fontSize: 20, isFingering: true },
  { id: 'finger_4', category: 'fingering', name: '4指 (无名指)', symbol: '4', fontSize: 20, isFingering: true },
  { id: 'finger_5', category: 'fingering', name: '5指 (小拇指)', symbol: '5', fontSize: 20, isFingering: true },

  // 教学与练习记号
  { id: 'check', category: 'annotation', name: '已掌握 ✓', symbol: '✓', fontSize: 26 },
  { id: 'star', category: 'annotation', name: '重点难点 ★', symbol: '★', fontSize: 26 },
  { id: 'repeat_left', category: 'bar', name: '前反复 |:', symbol: '𝄆', altText: '||:', fontSize: 24 },
  { id: 'repeat_right', category: 'bar', name: '后反复 :|', symbol: '𝄇', altText: ':||', fontSize: 24 }
];

/**
 * 绘制单个音乐印章到 Canvas 上
 */
export function renderStampToContext(ctx, stampData) {
  const { x, y, symbol, altText, color = '#1a56db', fontSize = 24, bold = false, italic = false, isFingering = false } = stampData;
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const fontStyle = italic ? 'italic ' : '';
  const fontWeight = bold || isFingering ? 'bold ' : '';
  const fontFamily = isFingering
    ? "'Inter', -apple-system, sans-serif"
    : "'Bravura', 'Noto Music', 'Georgia', serif";

  ctx.font = `${fontStyle}${fontWeight}${fontSize}px ${fontFamily}`;

  // 如果是指法数字，画一个半透明精致小圆圈背景增强辨识度
  if (isFingering) {
    ctx.beginPath();
    ctx.arc(x, y, fontSize * 0.65, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.12;
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = color;
  }

  const textToDraw = symbol || altText || '';
  ctx.fillText(textToDraw, x, y);
  ctx.restore();
}
