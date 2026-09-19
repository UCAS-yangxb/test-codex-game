/*!
 * 霓虹打砖块 · NEON BREAKER
 * utils.js —— 通用数学与几何工具
 */
(function (global) {
  'use strict';

  const NB = (global.NB = global.NB || {});

  // 随机数发生器做成可替换的，测试时可以注入固定种子，让结果可复现
  let rng = Math.random;

  const Utils = {
    /** 替换随机数发生器；传入非函数则恢复 Math.random */
    setRandom(fn) {
      rng = typeof fn === 'function' ? fn : Math.random;
    },

    /** 把 value 限制在 [min, max] 区间内 */
    clamp(value, min, max) {
      return value < min ? min : value > max ? max : value;
    },

    /** 线性插值 */
    lerp(a, b, t) {
      return a + (b - a) * t;
    },

    /** [min, max) 之间的随机浮点数 */
    rand(min, max) {
      return min + rng() * (max - min);
    },

    /** [min, max] 之间的随机整数 */
    randInt(min, max) {
      return Math.floor(min + rng() * (max - min + 1));
    },

    /** 从数组里随机取一个元素 */
    pick(list) {
      return list[Math.floor(rng() * list.length)];
    },

    /**
     * 加权随机。
     * entries 形如 [[值, 权重], ...]，权重越大概率越高。
     */
    pickWeighted(entries) {
      let total = 0;
      for (const entry of entries) total += entry[1];

      let roll = rng() * total;
      for (const entry of entries) {
        roll -= entry[1];
        if (roll <= 0) return entry[0];
      }
      return entries[entries.length - 1][0];
    },

    /**
     * 圆与轴对齐矩形相交检测。
     * 命中时返回 { nx, ny, overlap }：nx/ny 是指向圆心的单位法线，overlap 是穿透深度。
     * 未命中返回 null。
     */
    circleRect(cx, cy, radius, rx, ry, rw, rh) {
      const nearestX = Utils.clamp(cx, rx, rx + rw);
      const nearestY = Utils.clamp(cy, ry, ry + rh);
      const dx = cx - nearestX;
      const dy = cy - nearestY;
      const distSq = dx * dx + dy * dy;

      if (distSq > radius * radius) return null;

      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        return { nx: dx / dist, ny: dy / dist, overlap: radius - dist };
      }

      // 圆心恰好落在矩形内部：沿最近的那条边把球推出去
      const toLeft = cx - rx;
      const toRight = rx + rw - cx;
      const toTop = cy - ry;
      const toBottom = ry + rh - cy;
      const min = Math.min(toLeft, toRight, toTop, toBottom);

      if (min === toLeft) return { nx: -1, ny: 0, overlap: toLeft + radius };
      if (min === toRight) return { nx: 1, ny: 0, overlap: toRight + radius };
      if (min === toTop) return { nx: 0, ny: -1, overlap: toTop + radius };
      return { nx: 0, ny: 1, overlap: toBottom + radius };
    },

    /** 圆角矩形路径（不依赖 ctx.roundRect，兼容性更好） */
    roundRect(ctx, x, y, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    },

    /** 给分数加千分位，例如 12345 -> 12,345 */
    formatScore(value) {
      return String(Math.max(0, Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
  };

  NB.Utils = Utils;
})(window);
