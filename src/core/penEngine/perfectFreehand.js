/**
 * Perfect Freehand - 矢量笔锋墨水算法
 * 根据手写笔压感 (pressure)、笔速 (velocity) 动态生成平滑的多边形轮廓与自然起笔/收笔笔锋
 */

// 向量计算辅助函数
function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}
function add(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}
function mul(a, n) {
  return [a[0] * n, a[1] * n];
}
function div(a, n) {
  return [a[0] / n, a[1] / n];
}
function per(a) {
  return [-a[1], a[0]];
}
function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function len(a) {
  return Math.hypot(a[0], a[1]);
}
function uni(a) {
  const l = len(a);
  return l === 0 ? [0, 0] : div(a, l);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * 获取笔画轮廓点序列
 * @param {Array<[number, number, number?]>} rawPoints [x, y, pressure]
 * @param {Object} options 配置项
 * @returns {Array<[number, number]>} 多边形轮廓点
 */
export function getStroke(rawPoints, options = {}) {
  const {
    size = 4,
    thinning = 0.5, // 压感与速度对笔粗细的影响幅度 (-1 ~ 1)
    smoothing = 0.6, // 曲线平滑度
    streamline = 0.5, // 动态流线系数 (减震)
    easing = t => t,
    start = {},
    end = {},
    simulatePressure = true
  } = options;

  if (rawPoints.length === 0) return [];
  if (rawPoints.length === 1) {
    const p = rawPoints[0];
    const r = (p[2] ?? 0.5) * size;
    return getCirclePoints(p[0], p[1], r);
  }

  // 1. 标准化点阵与计算速度动力学
  const pts = [];
  let prev = null;
  let runningDist = 0;

  for (let i = 0; i < rawPoints.length; i++) {
    const raw = rawPoints[i];
    const x = raw[0];
    const y = raw[1];
    let p = raw[2];

    if (p === undefined || isNaN(p) || p <= 0) {
      if (prev && simulatePressure) {
        const d = dist([x, y], [prev.x, prev.y]);
        // 速度越快压感越小
        const speed = clamp(d / 16, 0, 1);
        p = clamp(1 - speed * 0.6, 0.2, 0.9);
      } else {
        p = 0.5;
      }
    }

    const pt = { x, y, p, d: 0 };
    if (prev) {
      pt.d = dist([x, y], [prev.x, prev.y]);
      runningDist += pt.d;
    }
    pts.push(pt);
    prev = pt;
  }

  // 2. 减震平滑处理 (Streamline)
  const smoothed = [];
  let sPrev = [pts[0].x, pts[0].y, pts[0].p];
  smoothed.push(sPrev);

  for (let i = 1; i < pts.length; i++) {
    const target = [pts[i].x, pts[i].y, pts[i].p];
    const weight = 1 - streamline * 0.8;
    const nx = lerp(sPrev[0], target[0], weight);
    const ny = lerp(sPrev[1], target[1], weight);
    const np = lerp(sPrev[2], target[2], weight);
    sPrev = [nx, ny, np];
    smoothed.push(sPrev);
  }

  // 3. 计算每一处的左右轮廓法线与半径
  const leftPts = [];
  const rightPts = [];
  const total = smoothed.length;

  for (let i = 0; i < total; i++) {
    const curr = smoothed[i];
    const p = curr[2];

    // 半径计算：结合基础 size、压感以及起笔/收笔过渡
    let progress = total > 1 ? i / (total - 1) : 1;
    let taperFactor = 1;

    // 起笔笔锋 (Taper Start)
    if (start.taper) {
      const taperLen = typeof start.taper === 'number' ? start.taper : 0.2;
      if (progress < taperLen) {
        taperFactor = easing(progress / taperLen);
      }
    }
    // 收笔笔锋 (Taper End)
    if (end.taper) {
      const taperLen = typeof end.taper === 'number' ? end.taper : 0.25;
      if (progress > 1 - taperLen) {
        taperFactor = easing((1 - progress) / taperLen);
      }
    }

    // 压感对半径的影响
    const pressureScale = 1 + (p - 0.5) * thinning * 2;
    const radius = Math.max(0.5, (size / 2) * pressureScale * Math.max(0.05, taperFactor));

    // 计算切线方向与法线向量
    let tangent;
    if (i === 0) {
      tangent = sub(smoothed[1], curr);
    } else if (i === total - 1) {
      tangent = sub(curr, smoothed[i - 1]);
    } else {
      const prevPt = smoothed[i - 1];
      const nextPt = smoothed[i + 1];
      tangent = sub(nextPt, prevPt);
    }

    const normal = uni(per(tangent));
    const offset = mul(normal, radius);

    leftPts.push([curr[0] + offset[0], curr[1] + offset[1]]);
    rightPts.push([curr[0] - offset[0], curr[1] - offset[1]]);
  }

  // 4. 将左侧点阵与反向右侧点阵闭合连接成完整多边形
  return [...leftPts, ...rightPts.reverse()];
}

/**
 * 生成圆点轮廓（单点点击印记）
 */
function getCirclePoints(cx, cy, r, steps = 12) {
  const points = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return points;
}

/**
 * 将多边形点序列转为 SVG Path 命令字符串或直接在 Canvas 上绘制
 * @param {Array<[number, number]>} strokePoints
 * @returns {string} SVG Path d 属性
 */
export function getSvgPathFromStroke(strokePoints) {
  if (!strokePoints || strokePoints.length === 0) return '';
  const d = [];
  const [p0, ...rest] = strokePoints;
  d.push(`M ${p0[0].toFixed(2)} ${p0[1].toFixed(2)}`);

  for (let i = 0; i < rest.length; i++) {
    const pt = rest[i];
    d.push(`L ${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`);
  }
  d.push('Z');
  return d.join(' ');
}

/**
 * 在 2D Canvas 上直接高效填充多边形笔画
 */
export function renderStrokeToContext(ctx, strokePoints, color, compositeOperation = 'source-over') {
  if (!strokePoints || strokePoints.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = compositeOperation;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(strokePoints[0][0], strokePoints[0][1]);
  for (let i = 1; i < strokePoints.length; i++) {
    ctx.lineTo(strokePoints[i][0], strokePoints[i][1]);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
