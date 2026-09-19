/*!
 * config.js —— 所有可调参数集中在这里，方便调手感。
 */
(function (global) {
  'use strict';

  const NB = (global.NB = global.NB || {});

  NB.Config = {
    // 逻辑分辨率（渲染时会按屏幕像素比缩放，判定始终用这套坐标）
    WIDTH: 900,
    HEIGHT: 600,

    PADDLE: {
      width: 132,
      height: 16,
      y: 552,
      yTop: 32,              // 双人对战：上方玩家的挡板高度
      followLerp: 20,        // 鼠标跟随的平滑系数，越大越跟手
      keyAccel: 5400,        // 键盘加速度 px/s²
      keyMaxSpeed: 980,
      keyFriction: 14,
      wideWidth: 196,
      laserDuration: 9000,   // 激光持续时间（毫秒）
      laserCooldown: 240,
    },

    BALL: {
      radius: 8,
      baseSpeed: 430,
      maxSpeed: 820,
      speedUpPerBreak: 2.4,  // 每打碎一块砖的加速量
      trail: 16,
      maxCount: 8,
      maxBounceAngle: 60,    // 挡板边缘最多改变多少度
      minBounceAngle: 12,    // 最小反弹角：避免球垂直往返卡死在同一列
    },

    BRICK: {
      cols: 12,
      width: 64,
      height: 26,
      gapX: 6,
      gapY: 8,
      top: 78,
      scoreByHp: { 1: 60, 2: 110, 3: 180 },
    },

    POWERUP: {
      size: 28,
      fallSpeed: 152,
      dropChance: 0.24,
      duration: 11000,
      weights: [
        ['expand', 26],
        ['multi', 24],
        ['slow', 16],
        ['life', 10],
        ['laser', 24],
      ],
    },

    COLORS: {
      brick: { 1: '#22d3ee', 2: '#a855f7', 3: '#f59e0b', 9: '#64748b' },
      paddle: '#38bdf8',
      paddle2: '#f472b6',
      ball: '#f8fafc',
      ballGlow: '#7dd3fc',
      laser: '#fbbf24',
      powerup: {
        expand: '#34d399',
        multi: '#60a5fa',
        slow: '#c084fc',
        life: '#f472b6',
        laser: '#fbbf24',
      },
    },

    // 通用规则
    RULES: {
      lives: 3,
      maxLives: 5,
    },
  };
})(window);
