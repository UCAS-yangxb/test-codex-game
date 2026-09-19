/*!
 * game.js —— 游戏主逻辑：状态机、物理、计分与渲染。
 *
 * 状态流转：
 *   menu ──开始──▶ ready ──发球──▶ playing
 *   playing ──球全部掉落──▶ ready（还有命）/ gameover（没命）
 *   playing ──砖块清空──▶ levelclear ──▶ ready（下一关）
 *   playing ──最后一关通过──▶ win
 */
(function (global) {
  'use strict';

  const NB = (global.NB = global.NB || {});
  const U = NB.Utils;
  const C = NB.Config;

  class Game {
    constructor(canvas, hooks) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.hooks = hooks || {};

      this.sound = new NB.Sound();
      this.particles = new NB.ParticleSystem();
      this.paddle = new NB.Paddle();

      this.balls = [];
      this.bricks = [];
      this.powerups = [];
      this.lasers = [];

      this.best = NB.Storage.getBest();
      this.state = 'menu';
      this.time = 0;          // 游戏内计时（毫秒），暂停时不增长
      this.score = 0;
      this.lives = 3;
      this.levelIndex = 0;
      this.levelName = '';
      this.speedBonus = 0;
      this.speedScale = 1;
      this.slowUntil = 0;
      this.shake = 0;
      this.flash = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.paddleDir = 0;
      this.lastLaserAt = -Infinity;
      this.menuTimer = 0;

      this.loadLevel(0);
      this.resetBallOnPaddle();
    }

    /* ------------------------------- 状态与流程 ------------------------------- */

    emitState() {
      if (this.hooks.onStateChange) this.hooks.onStateChange(this.state, this);
    }

    toast(text) {
      if (this.hooks.onToast) this.hooks.onToast(text);
    }

    startRun() {
      this.score = 0;
      this.lives = 3;
      this.time = 0;
      this.speedBonus = 0;
      this.speedScale = 1;
      this.slowUntil = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.shake = 0;
      this.flash = 0;

      this.powerups.length = 0;
      this.lasers.length = 0;
      this.particles.clear();
      this.paddle.reset();
      this.loadLevel(0);
      this.resetBallOnPaddle();

      this.state = 'ready';
      this.sound.play('start');
      this.emitState();
    }

    /** 统一的“主按钮 / 空格”入口，按当前状态决定该做什么 */
    launch() {
      switch (this.state) {
        case 'menu':
        case 'gameover':
        case 'win':
          this.startRun();
          break;
        case 'paused':
          this.togglePause();
          break;
        case 'levelclear':
          this.nextLevel();
          break;
        case 'ready':
          this.releaseBalls();
          break;
        case 'playing':
          this.fireLaser();
          break;
        default:
          break;
      }
    }

    releaseBalls() {
      const speed = this.currentBallSpeed();
      for (const ball of this.balls) {
        if (!ball.stuck) continue;
        ball.launch(speed, U.rand(-0.5, 0.5));
      }
      this.state = 'playing';
      this.sound.play('launch');
      this.emitState();
    }

    togglePause() {
      if (this.state === 'paused') {
        this.state = this.stateBeforePause || 'playing';
      } else if (this.state === 'playing' || this.state === 'ready') {
        this.stateBeforePause = this.state;
        this.state = 'paused';
      } else {
        return;
      }
      this.emitState();
    }

    nextLevel() {
      this.levelIndex += 1;
      this.speedBonus = 0;
      this.speedScale = 1;
      this.slowUntil = 0;
      this.powerups.length = 0;
      this.lasers.length = 0;
      this.loadLevel(this.levelIndex);
      this.resetBallOnPaddle();
      this.state = 'ready';
      this.emitState();
    }

    /* -------------------------------- 关卡构建 -------------------------------- */

    loadLevel(index) {
      const level = NB.Levels.get(index);
      const cfg = C.BRICK;

      this.levelIndex = index;
      this.levelName = level.name;
      this.bricks = [];

      const totalWidth = cfg.cols * cfg.width + (cfg.cols - 1) * cfg.gapX;
      const left = (C.WIDTH - totalWidth) / 2;

      level.rows.forEach((row, r) => {
        for (let c = 0; c < cfg.cols; c++) {
          const char = row[c] || '.';
          if (char === '.') continue;

          const x = left + c * (cfg.width + cfg.gapX);
          const y = cfg.top + r * (cfg.height + cfg.gapY);
          const unbreakable = char === 'X';
          const hp = unbreakable ? 1 : U.clamp(Number(char) || 1, 1, 3);

          this.bricks.push(new NB.Brick(x, y, cfg.width, cfg.height, hp, unbreakable));
        }
      });
    }

    resetBallOnPaddle() {
      const ball = new NB.Ball();
      ball.attach(this.paddle.centerX, this.paddle.y - ball.radius - 2);
      this.balls = [ball];
    }

    /* --------------------------------- 更新 --------------------------------- */

    update(dt) {
      if (this.state === 'menu') {
        this.updateMenuAmbience(dt);
        this.particles.update(dt);
        this.decayEffects(dt);
        return;
      }

      this.decayEffects(dt);
      this.particles.update(dt);

      if (this.state === 'paused' || this.state === 'gameover' || this.state === 'win' || this.state === 'levelclear') {
        return;
      }

      this.time += dt * 1000;

      if (this.slowUntil > 0 && this.time > this.slowUntil) {
        this.slowUntil = 0;
        this.speedScale = 1;
      }
      if (this.paddle.wideUntil > 0 && this.time > this.paddle.wideUntil) {
        this.paddle.resetWidth();
      }
      if (this.paddle.laserUntil > 0 && this.time > this.paddle.laserUntil) {
        this.paddle.laserUntil = 0;
      }
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }

      this.paddle.update(dt, this.paddleDir);

      if (this.state === 'ready') {
        const ball = this.balls[0];
        if (ball) ball.attach(this.paddle.centerX, this.paddle.y - ball.radius - 2);
      }

      this.updateBalls(dt);
      this.updatePowerups(dt);
      this.updateLasers(dt);
    }

    decayEffects(dt) {
      this.shake = Math.max(0, this.shake - dt * 42);
      this.flash = Math.max(0, this.flash - dt * 2.4);
      for (const brick of this.bricks) {
        if (brick.hitFlash > 0) brick.hitFlash = Math.max(0, brick.hitFlash - dt);
      }
    }

    updateMenuAmbience(dt) {
      this.menuTimer -= dt;
      if (this.menuTimer > 0) return;
      this.menuTimer = 0.14;

      this.particles.burst(
        U.rand(0, C.WIDTH),
        C.HEIGHT + 12,
        U.pick(['#22d3ee', '#a855f7', '#f59e0b']),
        1,
        { speed: 70, life: 2.6, size: 2, gravity: -26, drag: 0.2, angle: -Math.PI / 2, spread: 0.8 }
      );
    }

    currentBallSpeed() {
      const base = Math.min(C.BALL.baseSpeed + this.speedBonus, C.BALL.maxSpeed);
      return base * this.speedScale;
    }

    updateBalls(dt) {
      const targetSpeed = this.currentBallSpeed();

      for (let i = this.balls.length - 1; i >= 0; i--) {
        const ball = this.balls[i];
        if (ball.stuck) continue;

        ball.setSpeed(targetSpeed);

        // 把一帧的位移拆成若干小步，避免球速过快时直接穿过砖块
        const travel = ball.speed * dt;
        const steps = Math.max(1, Math.ceil(travel / (ball.radius * 0.8)));
        const stepDt = dt / steps;

        for (let s = 0; s < steps && !ball.dead; s++) {
          ball.update(stepDt);
          this.collideWalls(ball);
          this.collidePaddle(ball);
          this.collideBricks(ball);
          if (ball.y - ball.radius > C.HEIGHT + 30) ball.dead = true;
        }

        ball.pushTrail();
        if (ball.dead) this.balls.splice(i, 1);
      }

      if (this.balls.length === 0 && this.state === 'playing') this.loseLife();
    }

    collideWalls(ball) {
      const r = ball.radius;
      let bounced = false;

      if (ball.x - r < 0) {
        ball.x = r;
        ball.vx = Math.abs(ball.vx);
        bounced = true;
      } else if (ball.x + r > C.WIDTH) {
        ball.x = C.WIDTH - r;
        ball.vx = -Math.abs(ball.vx);
        bounced = true;
      }

      if (ball.y - r < 0) {
        ball.y = r;
        ball.vy = Math.abs(ball.vy);
        bounced = true;
      }

      if (!bounced) return;

      this.sound.play('wall');
      this.particles.burst(ball.x, ball.y, '#7dd3fc', 5, { speed: 130, life: 0.3, size: 2, gravity: 120 });
    }

    collidePaddle(ball) {
      const paddle = this.paddle;
      if (ball.vy <= 0) return;

      const hit = U.circleRect(ball.x, ball.y, ball.radius, paddle.x, paddle.y, paddle.width, paddle.height);
      if (!hit) return;

      ball.y = paddle.y - ball.radius - 0.01;

      const speed = ball.speed || this.currentBallSpeed();
      const offset = U.clamp((ball.x - paddle.centerX) / (paddle.width / 2), -1, 1);

      const maxAngle = C.BALL.maxBounceAngle * Math.PI / 180;
      const minAngle = C.BALL.minBounceAngle * Math.PI / 180;
      let angle = offset * maxAngle;
      // 正中击球时强制带一点角度，否则球会在同一列无限上下弹
      if (Math.abs(angle) < minAngle) angle = (offset >= 0 ? 1 : -1) * minAngle;

      ball.vx = Math.sin(angle) * speed;
      ball.vy = -Math.cos(angle) * speed;

      this.sound.play('paddle');
      this.shake = Math.max(this.shake, 2.5);
      this.particles.burst(ball.x, paddle.y, C.COLORS.paddle, 8, {
        speed: 190,
        life: 0.35,
        size: 2.6,
        gravity: 320,
        angle: -Math.PI / 2,
        spread: 2.4,
      });
    }

    collideBricks(ball) {
      for (const brick of this.bricks) {
        if (brick.dead) continue;

        const hit = U.circleRect(ball.x, ball.y, ball.radius, brick.x, brick.y, brick.w, brick.h);
        if (!hit) continue;

        // 沿碰撞法线反弹（只在球正在撞进去时反射，避免抖动）
        const vn = ball.vx * hit.nx + ball.vy * hit.ny;
        if (vn < 0) {
          ball.vx -= 2 * vn * hit.nx;
          ball.vy -= 2 * vn * hit.ny;
        }

        // 推出去一点点，防止下一帧仍然卡在砖块里
        ball.x += hit.nx * (hit.overlap + 0.5);
        ball.y += hit.ny * (hit.overlap + 0.5);

        this.damageBrick(brick, ball.x, ball.y);
        break; // 一个小步内只处理一次碰撞，手感更稳定
      }
    }

    damageBrick(brick, hitX, hitY) {
      const color = brick.color;

      if (brick.unbreakable) {
        brick.hitFlash = 0.18;
        this.sound.play('steel');
        this.particles.burst(hitX, hitY, color, 6, { speed: 150, life: 0.28, size: 2, gravity: 260 });
        return;
      }

      const destroyed = brick.hit();
      const hx = U.clamp(hitX, brick.x, brick.x + brick.w);
      const hy = U.clamp(hitY, brick.y, brick.y + brick.h);

      if (!destroyed) {
        this.sound.play('brick');
        this.particles.burst(hx, hy, color, 7, { speed: 170, life: 0.3, size: 2.2, gravity: 340 });
        this.score += 8;
        return;
      }

      this.sound.play('break');
      this.particles.burst(brick.x + brick.w / 2, brick.y + brick.h / 2, color, 16, {
        speed: 240,
        life: 0.55,
        size: 3,
        gravity: 520,
      });

      this.combo += 1;
      this.comboTimer = 2.4;
      const multiplier = 1 + Math.min(Math.floor(this.combo / 3), 4) * 0.5; // 最高 3 倍
      this.score += Math.round(brick.score * multiplier);

      if (this.combo > 0 && this.combo % 6 === 0) {
        this.toast(`连击 ×${Math.round(multiplier * 10) / 10}　得分加成中`);
      }

      this.speedBonus = Math.min(this.speedBonus + C.BALL.speedUpPerBreak, 260);
      this.shake = Math.max(this.shake, 2);

      this.maybeDropPowerUp(brick.x + brick.w / 2, brick.y + brick.h / 2);
      this.checkLevelClear();
    }

    maybeDropPowerUp(x, y) {
      if (U.rand(0, 1) > C.POWERUP.dropChance) return;
      const type = U.pickWeighted(C.POWERUP.weights);
      this.powerups.push(new NB.PowerUp(x, y, type));
    }

    checkLevelClear() {
      const remaining = this.bricks.some((brick) => !brick.dead && !brick.unbreakable);
      if (remaining) return;

      this.score += 500 + this.lives * 200;
      this.particles.burst(C.WIDTH / 2, C.HEIGHT / 2, '#7dd3fc', 40, {
        speed: 420,
        life: 1.1,
        size: 3.4,
        gravity: 240,
      });
      this.flash = 0.7;

      if (this.levelIndex >= NB.Levels.count - 1) {
        this.state = 'win';
        this.saveBest();
        this.sound.play('levelclear');
        this.sound.play('gameover');
      } else {
        this.state = 'levelclear';
        this.sound.play('levelclear');
      }
      this.emitState();
    }

    loseLife() {
      this.lives -= 1;
      this.speedBonus = Math.max(0, this.speedBonus - 14);
      this.combo = 0;
      this.comboTimer = 0;
      this.shake = 14;
      this.flash = 1;
      this.sound.play('lose');
      this.powerups.length = 0;

      if (this.lives <= 0) {
        this.state = 'gameover';
        this.saveBest();
        this.sound.play('gameover');
      } else {
        this.state = 'ready';
        this.resetBallOnPaddle();
        this.toast(`球掉下去了，还剩 ${this.lives} 条命`);
      }
      this.emitState();
    }

    saveBest() {
      this.best = NB.Storage.setBest(this.score);
      if (this.hooks.onBest) this.hooks.onBest(this.best);
    }

    /* -------------------------------- 道具与激光 ------------------------------- */

    updatePowerups(dt) {
      const paddle = this.paddle;

      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const item = this.powerups[i];
        item.update(dt);

        const caught =
          item.y + item.size > paddle.y &&
          item.y < paddle.y + paddle.height &&
          item.x + item.size > paddle.x &&
          item.x < paddle.x + paddle.width;

        if (caught) {
          this.collectPowerUp(item);
          this.powerups.splice(i, 1);
        } else if (item.dead) {
          this.powerups.splice(i, 1);
        }
      }
    }

    collectPowerUp(item) {
      this.score += 50;
      this.sound.play('powerup');
      this.toast(item.toast);
      this.particles.burst(item.centerX, item.centerY, item.color, 18, {
        speed: 260,
        life: 0.6,
        size: 3,
        gravity: 120,
      });

      switch (item.type) {
        case 'expand':
          this.paddle.applyWide(this.time);
          break;
        case 'multi':
          this.splitBalls();
          break;
        case 'slow':
          this.speedScale = 0.68;
          this.slowUntil = this.time + C.POWERUP.duration;
          break;
        case 'life':
          this.lives += 1;
          break;
        case 'laser':
          this.paddle.applyLaser(this.time);
          break;
        default:
          break;
      }
    }

    /** 每个球复制成一个额外球，方向左右分开 */
    splitBalls() {
      const extras = [];
      for (const ball of this.balls) {
        if (this.balls.length + extras.length >= C.BALL.maxCount) break;
        if (ball.stuck) continue;

        const clone = new NB.Ball();
        clone.attach(ball.x, ball.y);
        clone.stuck = false;
        clone.vx = -ball.vx;
        clone.vy = ball.vy;
        clone.setSpeed(ball.speed);
        extras.push(clone);
      }
      this.balls.push(...extras);
    }

    fireLaser() {
      const paddle = this.paddle;
      if (!paddle.isLaserActive) return;
      if (this.time - this.lastLaserAt < C.PADDLE.laserCooldown) return;

      this.lastLaserAt = this.time;
      for (const x of paddle.emitterPoints) {
        this.lasers.push({ x, y: paddle.y - 6, vy: -980, w: 4, h: 20, dead: false });
      }
      this.sound.play('laser');
    }

    updateLasers(dt) {
      for (let i = this.lasers.length - 1; i >= 0; i--) {
        const laser = this.lasers[i];
        laser.y += laser.vy * dt;

        if (laser.y + laser.h < 0) {
          this.lasers.splice(i, 1);
          continue;
        }

        let consumed = false;
        for (const brick of this.bricks) {
          if (brick.dead) continue;
          if (laser.x < brick.x || laser.x > brick.x + brick.w) continue;
          if (laser.y > brick.y + brick.h || laser.y + laser.h < brick.y) continue;

          this.damageBrick(brick, laser.x, laser.y);
          consumed = true;
          break;
        }

        if (consumed) this.lasers.splice(i, 1);
      }
    }

    /* --------------------------------- 渲染 --------------------------------- */

    render() {
      const ctx = this.ctx;

      this.drawBackground(ctx);

      ctx.save();
      if (this.shake > 0.3) {
        ctx.translate(U.rand(-this.shake, this.shake), U.rand(-this.shake, this.shake));
      }
      this.drawBricks(ctx);
      this.drawPowerups(ctx);
      this.drawLasers(ctx);
      if (this.state !== 'menu') {
        this.drawPaddle(ctx);
        this.drawBalls(ctx);
      }
      this.particles.render(ctx);
      ctx.restore();

      this.drawBorder(ctx);

      if (this.flash > 0.01) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.5, this.flash * 0.35);
        ctx.fillStyle = '#f87171';
        ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
        ctx.restore();
      }
    }

    drawBackground(ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 0, C.HEIGHT);
      gradient.addColorStop(0, '#0b1224');
      gradient.addColorStop(0.55, '#060913');
      gradient.addColorStop(1, '#04060d');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);

      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.055)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 45; x < C.WIDTH; x += 45) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, C.HEIGHT);
      }
      for (let y = 45; y < C.HEIGHT; y += 45) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(C.WIDTH, y + 0.5);
      }
      ctx.stroke();

      const halo = ctx.createRadialGradient(C.WIDTH / 2, -160, 20, C.WIDTH / 2, -160, 560);
      halo.addColorStop(0, 'rgba(34, 211, 238, 0.18)');
      halo.addColorStop(1, 'rgba(34, 211, 238, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
      ctx.restore();
    }

    drawBorder(ctx) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 2;
      U.roundRect(ctx, 1, 1, C.WIDTH - 2, C.HEIGHT - 2, 14);
      ctx.stroke();
      ctx.restore();
    }

    drawBricks(ctx) {
      const dim = this.state === 'menu' ? 0.32 : 1;

      for (const brick of this.bricks) {
        if (brick.dead) continue;

        const color = brick.color;
        const hpRatio = brick.unbreakable ? 1 : Math.max(0.25, brick.hp / brick.maxHp);

        ctx.save();
        ctx.globalAlpha = dim;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.fillStyle = color;
        U.roundRect(ctx, brick.x, brick.y, brick.w, brick.h, 6);
        ctx.fill();
        ctx.restore();

        // 顶面高光：血量越低越暗，一眼能看出这块砖快碎了
        ctx.save();
        ctx.globalAlpha = dim * (0.16 + hpRatio * 0.28);
        ctx.fillStyle = '#ffffff';
        U.roundRect(ctx, brick.x + 3, brick.y + 3, brick.w - 6, (brick.h - 6) * 0.45, 4);
        ctx.fill();
        ctx.restore();

        if (brick.unbreakable) {
          ctx.save();
          ctx.globalAlpha = dim * 0.5;
          ctx.strokeStyle = 'rgba(226, 232, 240, 0.75)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(brick.x + 8, brick.y + brick.h - 6);
          ctx.lineTo(brick.x + brick.w - 8, brick.y + 6);
          ctx.moveTo(brick.x + brick.w / 2 - 6, brick.y + brick.h - 6);
          ctx.lineTo(brick.x + brick.w / 2 + 6, brick.y + 6);
          ctx.stroke();
          ctx.restore();
        }

        if (brick.hitFlash > 0) {
          ctx.save();
          ctx.globalAlpha = dim * (brick.hitFlash / 0.18) * 0.8;
          ctx.fillStyle = '#ffffff';
          U.roundRect(ctx, brick.x, brick.y, brick.w, brick.h, 6);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    drawPaddle(ctx) {
      const paddle = this.paddle;

      ctx.save();
      ctx.shadowColor = C.COLORS.paddle;
      ctx.shadowBlur = 20;

      const gradient = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.height);
      gradient.addColorStop(0, '#bae6fd');
      gradient.addColorStop(0.5, C.COLORS.paddle);
      gradient.addColorStop(1, '#0369a1');
      ctx.fillStyle = gradient;
      U.roundRect(ctx, paddle.x, paddle.y, paddle.width, paddle.height, paddle.height / 2);
      ctx.fill();
      ctx.restore();

      if (paddle.isLaserActive) {
        ctx.save();
        ctx.shadowColor = C.COLORS.laser;
        ctx.shadowBlur = 14;
        ctx.fillStyle = C.COLORS.laser;
        for (const x of paddle.emitterPoints) {
          ctx.fillRect(x - 2, paddle.y - 7, 4, 8);
        }
        ctx.restore();
      }
    }

    drawBalls(ctx) {
      for (const ball of this.balls) {
        ctx.save();
        for (let i = 0; i < ball.trail.length; i++) {
          const point = ball.trail[i];
          const ratio = (i + 1) / ball.trail.length;
          ctx.globalAlpha = ratio * 0.3;
          ctx.fillStyle = C.COLORS.ballGlow;
          ctx.beginPath();
          ctx.arc(point.x, point.y, ball.radius * ratio * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        ctx.save();
        ctx.shadowColor = C.COLORS.ballGlow;
        ctx.shadowBlur = 22;
        ctx.fillStyle = C.COLORS.ball;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    drawPowerups(ctx) {
      for (const item of this.powerups) {
        const half = item.size / 2;
        ctx.save();
        ctx.translate(item.centerX, item.centerY);
        ctx.rotate(Math.sin(item.spin) * 0.25);
        ctx.shadowColor = item.color;
        ctx.shadowBlur = 16;
        ctx.fillStyle = item.color;
        U.roundRect(ctx, -half, -half, item.size, item.size, 8);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = '#04060d';
        ctx.font = 'bold 15px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, item.centerX, item.centerY + 1);
        ctx.restore();
      }
    }

    drawLasers(ctx) {
      if (this.lasers.length === 0) return;

      ctx.save();
      ctx.shadowColor = C.COLORS.laser;
      ctx.shadowBlur = 18;
      ctx.fillStyle = C.COLORS.laser;
      for (const laser of this.lasers) {
        ctx.fillRect(laser.x - laser.w / 2, laser.y, laser.w, laser.h);
      }
      ctx.restore();
    }
  }

  NB.Game = Game;
})(window);
