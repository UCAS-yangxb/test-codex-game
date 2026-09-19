/*!
 * main.js —— 页面装配：画布缩放、输入绑定、HUD 更新与主循环。
 */
(function () {
  'use strict';

  const NB = window.NB;
  const C = NB.Config;
  const U = NB.Utils;

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  const els = {
    score: document.getElementById('stat-score'),
    level: document.getElementById('stat-level'),
    lives: document.getElementById('stat-lives'),
    best: document.getElementById('stat-best'),
    overlay: document.getElementById('overlay'),
    eyebrow: document.getElementById('panel-eyebrow'),
    title: document.getElementById('panel-title'),
    text: document.getElementById('panel-text'),
    keys: document.getElementById('panel-keys'),
    action: document.getElementById('panel-action'),
    toast: document.getElementById('toast'),
    sound: document.getElementById('btn-sound'),
    pause: document.getElementById('btn-pause'),
  };

  /* --------------------------------- 画布缩放 -------------------------------- */

  let dpr = 1;

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(C.WIDTH * dpr);
    canvas.height = Math.round(C.HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------------------------------- 游戏 ---------------------------------- */

  const game = new NB.Game(canvas, {
    onStateChange: renderPanel,
    onToast: showToast,
    onBest(best) {
      els.best.textContent = U.formatScore(best);
    },
  });

  /* --------------------------------- 界面面板 -------------------------------- */

  function renderPanel(state) {
    const panels = {
      menu: {
        eyebrow: 'NEON BREAKER',
        title: '霓虹打砖块',
        text: '控制挡板接住小球，打碎场上全部砖块即可过关。用挡板两侧击球能改变反弹角度。',
        keys: true,
        action: '开始游戏',
      },
      paused: {
        eyebrow: 'PAUSED',
        title: '暂停中',
        text: '喘口气，随时继续。',
        keys: false,
        action: '继续游戏',
      },
      levelclear: {
        eyebrow: `第 ${game.levelIndex + 1} 关 · ${game.levelName}`,
        title: '关卡完成',
        text: `当前得分 ${U.formatScore(game.score)}，准备进入第 ${game.levelIndex + 2} 关。`,
        keys: false,
        action: '进入下一关',
      },
      gameover: {
        eyebrow: 'GAME OVER',
        title: '游戏结束',
        text: `本局得分 ${U.formatScore(game.score)}　·　最高分 ${U.formatScore(game.best)}`,
        keys: false,
        action: '再来一局',
      },
      win: {
        eyebrow: 'ALL CLEAR',
        title: '全部通关 🎉',
        text: `五关全部拿下！最终得分 ${U.formatScore(game.score)}　·　最高分 ${U.formatScore(game.best)}`,
        keys: false,
        action: '再玩一次',
      },
    };

    const panel = panels[state];
    if (!panel) {
      els.overlay.classList.add('is-hidden');
      els.pause.textContent = state === 'paused' ? '▶' : '⏸';
      return;
    }

    els.eyebrow.textContent = panel.eyebrow;
    els.title.textContent = panel.title;
    els.text.textContent = panel.text;
    els.keys.hidden = !panel.keys;
    els.action.textContent = panel.action;
    els.overlay.dataset.state = state;
    els.overlay.classList.remove('is-hidden');
    els.pause.textContent = state === 'paused' ? '▶' : '⏸';
  }

  let toastTimer = null;

  function showToast(text) {
    els.toast.textContent = text;
    els.toast.classList.add('is-visible');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 1600);
  }

  /* ---------------------------------- HUD ---------------------------------- */

  const hudCache = {};

  function syncHud() {
    if (hudCache.score !== game.score) {
      hudCache.score = game.score;
      els.score.textContent = U.formatScore(game.score);
    }

    const levelText = `${game.levelIndex + 1} / ${NB.Levels.count}`;
    if (hudCache.level !== levelText) {
      hudCache.level = levelText;
      els.level.textContent = levelText;
    }

    if (hudCache.lives !== game.lives) {
      hudCache.lives = game.lives;
      els.lives.textContent = game.lives > 0 ? '●'.repeat(Math.min(game.lives, 6)) : '○';
    }

    if (hudCache.best !== game.best) {
      hudCache.best = game.best;
      els.best.textContent = U.formatScore(game.best);
    }
  }

  /* --------------------------------- 输入绑定 -------------------------------- */

  NB.Input.attach(stage, canvas, {
    onMove(logicalX) {
      game.paddle.setPointer(logicalX);
    },
    onDirection(direction) {
      game.paddleDir = direction;
    },
    onAction() {
      game.launch();
    },
    onPause() {
      game.togglePause();
    },
    onMute() {
      toggleSound();
    },
  });

  function toggleSound() {
    const enabled = !game.sound.enabled;
    game.sound.setEnabled(enabled);
    NB.Storage.setSoundEnabled(enabled);
    els.sound.textContent = enabled ? '🔊' : '🔇';
    els.sound.setAttribute('aria-pressed', String(enabled));
  }

  els.sound.addEventListener('click', toggleSound);
  els.pause.addEventListener('click', () => game.togglePause());
  els.action.addEventListener('click', () => {
    game.sound.ensure();
    game.launch();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (game.state === 'playing' || game.state === 'ready')) game.togglePause();
  });

  window.addEventListener('resize', resizeCanvas);

  /* --------------------------------- 主循环 --------------------------------- */

  let lastFrame = performance.now();

  function frame(now) {
    // 切到后台再切回来时 dt 会很大，这里做个上限，避免球瞬移穿墙
    const dt = Math.min((now - lastFrame) / 1000, 0.033);
    lastFrame = now;

    game.update(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    game.render();
    syncHud();

    requestAnimationFrame(frame);
  }

  /* --------------------------------- 初始化 --------------------------------- */

  resizeCanvas();

  const soundEnabled = NB.Storage.getSoundEnabled();
  game.sound.setEnabled(soundEnabled);
  els.sound.textContent = soundEnabled ? '🔊' : '🔇';
  els.sound.setAttribute('aria-pressed', String(soundEnabled));

  els.best.textContent = U.formatScore(game.best);
  renderPanel(game.state);

  // 调试挂钩：打开控制台输入 NB.game 就能查看/修改当前对局
  NB.game = game;

  requestAnimationFrame(frame);
})();
