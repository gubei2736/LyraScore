/**
 * 示范曲目与初始工具模块
 * （注：用户已配置不需要默认示范曲目，乐谱库保持纯净空白，由用户自主导入管理）
 */

import { scoreDB } from '../core/db.js';

export async function initDefaultScoresIfEmpty() {
  // 不再自动注入任何示范乐谱，保持乐谱库干净
  const allScores = await scoreDB.getAllScores();
  return allScores;
}
