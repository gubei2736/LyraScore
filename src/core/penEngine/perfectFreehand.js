/**
 * Perfect Freehand - 高精度矢量笔锋墨水算法
 * 专为平板手写笔优化：完美支持汉字转折点、复杂英文连笔与圆弧笔画
 */

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
 * 获取笔画轮廓多边形点序列
 */
export function getStroke(rawPoints, options = {}) {
  const {
    size = 4,
    thinning = 0.4,
    smoothing = 0.5,
    streamline = 0.25,
    easing = t => t,
    start = {},
    end = {},
    simulatePressure = true
  } = options;

  if (!rawPoints || rawPoints.length === 0) return [];
  if (rawPoints.length === 1) {
    const p = rawPoints[0];
    const r = Math.max(1, (p[2] ?? 0.5) * size);
    return getCirclePoints(p[0], p[1], r);
  }

  // 1. 标准化采样点
  const pts = [];
  let prev = null;

  for (let i = 0; i < rawPoints.length; i++) {
    const raw = rawPoints[i];
    const x = raw[0];
    const y = raw[1];
    let p = raw[2];

    if (p === undefined || isNaN(p) || p <= 0) {
      if (prev && simulatePressure) {
        const d = dist([x, y], [prev.x, prev.y]);
        const speed = clamp(d / 18, 0, 1);
        p = clamp(1 - speed * 0.5, 0.3, 0.85);
      } else {
        p = 0.5;
      }
    }

    const pt = { x, y, p };
    pts.push(pt);
    prev = pt;
  }

  if (pts.length < 2) return [];

  // 2. 适度平滑 (保持汉字拐弯高保真)
  const smoothed = [];
  let sPrev = [pts[0].x, pts[0].y, pts[0].p];
  smoothed.push(sPrev);

  for (let i = 1; i < pts.length; i++) {
    const target = [pts[i].x, pts[i].y, pts[i].p];
    const weight = 1 - streamline * 0.5;
    const nx = lerp(sPrev[0], target[0], weight);
    const ny = lerp(sPrev[1], target[1], weight);
    const np = lerp(sPrev[2], target[2], weight);
    sPrev = [nx, ny, np];
    smoothed.push(sPrev);
  }

  // 3. 计算左右法线轮廓
  const leftPts = [];
  const rightPts = [];
  const total = smoothed.length;

  for (let i = 0; i < total; i++) {
    const curr = smoothed[i];
    const p = curr[2];

    let progress = total > 1 ? i / (total - 1) : 1;
    let taperFactor = 1;

    if (start.taper) {
      // 若 taper >= 1 则视为点数，转换为比例并限制最大不超过 30%
      const taperLen = typeof start.taper === 'number' 
        ? (start.taper >= 1 ? Math.min(0.3, start.taper / Math.max(total, 1)) : start.taper) 
        : 0.15;
      if (progress < taperLen && taperLen > 0) {
        taperFactor = easing(progress / taperLen);
      }
    }
    if (end.taper) {
      const taperLen = typeof end.taper === 'number' 
        ? (end.taper >= 1 ? Math.min(0.3, end.taper / Math.max(total, 1)) : end.taper) 
        : 0.15;
      if (progress > 1 - taperLen && taperLen > 0) {
        taperFactor = easing((1 - progress) / taperLen);
      }
    }

    const pressureScale = 1 + (p - 0.5) * thinning * 1.5;
    const radius = Math.max(0.8, (size / 2) * pressureScale * Math.max(0.15, taperFactor));

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

  return [...leftPts, ...rightPts.reverse()];
}

function getCirclePoints(cx, cy, r, steps = 12) {
  const points = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return points;
}

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
