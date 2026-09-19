/*!
 * particles.js —— 轻量粒子系统，负责爆炸、火花和背景尘埃。
 */
(function (global) {
  'use strict';

  const NB = (global.NB = global.NB || {});
  const U = NB.Utils;

  class ParticleSystem {
    constructor(limit) {
      this.limit = limit || 700;
      this.items = [];
    }

    clear() {
      this.items.length = 0;
    }

    /**
     * 在 (x, y) 处喷出一簇粒子。
     * options: speed / life / size / gravity / drag / spread / angle
     */
    burst(x, y, color, count, options) {
      const opts = options || {};
      const speed = opts.speed === undefined ? 220 : opts.speed;
      const life = opts.life === undefined ? 0.6 : opts.life;
      const size = opts.size === undefined ? 3 : opts.size;
      const gravity = opts.gravity === undefined ? 520 : opts.gravity;
      const drag = opts.drag === undefined ? 1.6 : opts.drag;
      const baseAngle = opts.angle === undefined ? 0 : opts.angle;
      const spread = opts.spread === undefined ? Math.PI * 2 : opts.spread;

      for (let i = 0; i < count; i++) {
        if (this.items.length >= this.limit) break;

        const angle = baseAngle + U.rand(-spread / 2, spread / 2);
        const velocity = speed * U.rand(0.35, 1);
        const lifespan = life * U.rand(0.6, 1.25);

        this.items.push({
          x,
          y,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          life: lifespan,
          maxLife: lifespan,
          size: size * U.rand(0.6, 1.3),
          color,
          gravity,
          drag,
        });
      }
    }

    update(dt) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const p = this.items[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.items.splice(i, 1);
          continue;
        }
        const damping = Math.max(0, 1 - p.drag * dt);
        p.vx *= damping;
        p.vy = p.vy * damping + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    render(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.items) {
        const t = p.life / p.maxLife;
        ctx.globalAlpha = Math.max(0, Math.min(1, t));
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  NB.ParticleSystem = ParticleSystem;
})(window);
