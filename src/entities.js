/*!
 * entities.js —— 挡板、球、砖块、道具这四类游戏对象。
 */
(function (global) {
  'use strict';

  const NB = (global.NB = global.NB || {});
  const U = NB.Utils;
  const C = NB.Config;

  /* ---------------------------------- 挡板 ---------------------------------- */

  class Paddle {
    constructor() {
      this.pointerActive = false;
      this.keyboardActive = false;
      this.reset();
    }

    reset() {
      const cfg = C.PADDLE;
      this.width = cfg.width;
      this.height = cfg.height;
      this.y = cfg.y;
      this.x = (C.WIDTH - this.width) / 2;
      this.vx = 0;
      this.targetX = this.x;
      this.laserUntil = 0;
      this.wideUntil = 0;
      this.pointerActive = false;
      this.keyboardActive = false;
    }

    get centerX() {
      return this.x + this.width / 2;
    }

    get isLaserActive() {
      return this.laserUntil > 0;
    }

    setPointer(logicalX) {
      this.pointerActive = true;
      this.keyboardActive = false;
      this.targetX = logicalX - this.width / 2;
    }

    /** 加宽道具：加宽挡板并记录失效时间（gameTime 为游戏内毫秒） */
    applyWide(gameTime) {
      const center = this.centerX;
      this.width = C.PADDLE.wideWidth;
      this.x = center - this.width / 2;
      this.targetX = this.x;
      this.wideUntil = gameTime + C.POWERUP.duration;
    }

    applyLaser(gameTime) {
      this.laserUntil = gameTime + C.PADDLE.laserDuration;
    }

    resetWidth() {
      if (this.width === C.PADDLE.width) return;
      const center = this.centerX;
      this.width = C.PADDLE.width;
      this.x = center - this.width / 2;
      this.targetX = this.x;
      this.wideUntil = 0;
    }

    update(dt, direction) {
      const cfg = C.PADDLE;

      if (direction !== 0) {
        this.vx += direction * cfg.keyAccel * dt;
        this.vx = U.clamp(this.vx, -cfg.keyMaxSpeed, cfg.keyMaxSpeed);
        this.x += this.vx * dt;
        // 让指针目标跟上当前位置，这样松开键盘后挡板不会突然跳回去
        this.targetX = this.x;
      } else {
        this.vx *= Math.max(0, 1 - cfg.keyFriction * dt);
        if (Math.abs(this.vx) < 6) this.vx = 0;

        if (this.pointerActive) {
          const t = 1 - Math.exp(-cfg.followLerp * dt);
          this.x += (this.targetX - this.x) * t;
        } else {
          this.x += this.vx * dt;
        }
      }

      this.x = U.clamp(this.x, 0, C.WIDTH - this.width);
    }

    /** 激光发射口的位置 */
    get emitterPoints() {
      return [this.x + 6, this.x + this.width - 6];
    }
  }

  /* ----------------------------------- 球 ----------------------------------- */

  class Ball {
    constructor() {
      this.radius = C.BALL.radius;
      this.trail = [];
      this.stuck = true;
      this.dead = false;
      this.x = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
    }

    attach(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.stuck = true;
      this.dead = false;
      this.trail.length = 0;
    }

    launch(speed, angle) {
      this.vx = Math.sin(angle) * speed;
      this.vy = -Math.cos(angle) * speed;
      this.stuck = false;
    }

    get speed() {
      return Math.hypot(this.vx, this.vy);
    }

    /** 保持方向不变，把速度大小改成 speed */
    setSpeed(speed) {
      if (this.stuck) return;
      const current = this.speed;
      if (current < 1e-3) return;

      const scale = speed / current;
      this.vx *= scale;
      this.vy *= scale;
    }

    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    pushTrail() {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > C.BALL.trail) this.trail.shift();
    }
  }

  /* ---------------------------------- 砖块 ---------------------------------- */

  class Brick {
    constructor(x, y, w, h, hp, unbreakable) {
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.hp = hp;
      this.maxHp = hp;
      this.unbreakable = Boolean(unbreakable);
      this.dead = false;
      this.hitFlash = 0; // 击打后的白闪计时
    }

    get color() {
      return C.COLORS.brick[this.unbreakable ? 9 : this.hp] || C.COLORS.brick[1];
    }

    get score() {
      return this.unbreakable ? 0 : C.BRICK.scoreByHp[this.maxHp] || 60;
    }

    /** 返回本次击打是否把砖块打碎 */
    hit() {
      if (this.unbreakable) {
        this.hitFlash = 0.18;
        return false;
      }
      this.hp -= 1;
      this.hitFlash = 0.14;
      if (this.hp <= 0) {
        this.dead = true;
        return true;
      }
      return false;
    }
  }

  /* ---------------------------------- 道具 ---------------------------------- */

  const POWERUP_LABEL = {
    expand: '宽',
    multi: '分',
    slow: '慢',
    life: '命',
    laser: '激',
  };

  const POWERUP_TOAST = {
    expand: '挡板加宽',
    multi: '分裂球',
    slow: '时间减速',
    life: '额外生命 +1',
    laser: '激光就绪',
  };

  class PowerUp {
    constructor(x, y, type) {
      this.size = C.POWERUP.size;
      this.x = x - this.size / 2;
      this.y = y - this.size / 2;
      this.type = type;
      this.dead = false;
      this.spin = U.rand(0, Math.PI * 2);
    }

    get centerX() {
      return this.x + this.size / 2;
    }

    get centerY() {
      return this.y + this.size / 2;
    }

    get color() {
      return C.COLORS.powerup[this.type] || '#e2e8f0';
    }

    get label() {
      return POWERUP_LABEL[this.type] || '?';
    }

    get toast() {
      return POWERUP_TOAST[this.type] || '获得道具';
    }

    update(dt) {
      this.y += C.POWERUP.fallSpeed * dt;
      this.spin += dt * 2.4;
      if (this.y > C.HEIGHT + this.size) this.dead = true;
    }
  }

  NB.Paddle = Paddle;
  NB.Ball = Ball;
  NB.Brick = Brick;
  NB.PowerUp = PowerUp;
})(window);
