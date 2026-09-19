#!/usr/bin/env node
/**
 * 无头冒烟测试。
 *
 * 用一套最小化的假浏览器环境（假的 DOM / Canvas / localStorage）加载全部游戏脚本，
 * 然后像真人一样驱动若干帧，检查：
 *   1. 所有脚本语法正确、初始化不报错；
 *   2. 菜单 → 发球 → 对局的状态流转正确；
 *   3. 挡板自动跟球时能真的打碎砖块并推进关卡；
 *   4. 不接球时生命会递减，最终进入 gameover。
 *   5. 本地双人对战：两块挡板、镜像道具、漏球扣命、胜负判定。
 *
 * 用法：npm test   （或者 node tools/smoke-test.js）
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const UTILS = 'src/utils.js';
const SCRIPTS = [
  'src/config.js',
  'src/levels.js',
  'src/storage.js',
  'src/audio.js',
  'src/particles.js',
  'src/entities.js',
  'src/input.js',
  'src/game.js',
  'src/main.js',
];

// 固定种子的 mulberry32：让每次冒烟测试跑出完全一样的过程和结果
const SEED_SOURCE = `
  NB.Utils.setRandom((function () {
    var seed = 0x9e3779b9;
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })());
`;

let failures = 0;

function check(label, condition, extra) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  const mark = ok ? '  ✓' : '  ✗';
  const tail = extra === undefined ? '' : `  （${extra}）`;
  console.log(`${mark} ${label}${tail}`);
}

/* ------------------------------ 假浏览器环境 ------------------------------ */

function createContext2D() {
  const gradient = { addColorStop() {} };
  return new Proxy(
    {},
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
        if (prop === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    }
  );
}

function createElement(id) {
  const listeners = new Map();
  const element = {
    id,
    textContent: '',
    hidden: false,
    dataset: {},
    style: {},
    width: 900,
    height: 600,
    classList: {
      _set: new Set(),
      add(name) {
        this._set.add(name);
      },
      remove(name) {
        this._set.delete(name);
      },
      contains(name) {
        return this._set.has(name);
      },
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type);
      if (!list) return;
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    setAttribute() {},
    getContext() {
      return createContext2D();
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 900, height: 600, right: 900, bottom: 600 };
    },
    dispatch(type, event) {
      for (const handler of listeners.get(type) || []) handler(event || {});
    },
  };
  return element;
}

const elements = new Map();
const documentListeners = new Map();
let rafQueue = [];

const sandbox = {
  console,
  Math,
  Date,
  Number,
  String,
  Boolean,
  Object,
  Array,
  JSON,
  Error,
  isFinite,
  Infinity,
  NaN,
  setTimeout: () => 0,
  clearTimeout: () => {},
  performance: { now: () => 0 },
  devicePixelRatio: 1,
  requestAnimationFrame(callback) {
    rafQueue.push(callback);
    return rafQueue.length;
  },
  localStorage: (() => {
    const store = new Map();
    return {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    };
  })(),
  document: {
    hidden: false,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    },
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(handler);
    },
  },
  addEventListener() {},
  removeEventListener() {},
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;

function element(id) {
  return sandbox.document.getElementById(id);
}

/* -------------------------------- 加载脚本 -------------------------------- */

const context = vm.createContext(sandbox);

function load(relative) {
  const file = path.join(ROOT, relative);
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, context, { filename: relative });
}

// utils.js 先单独加载，装上固定种子后再加载其余模块
load(UTILS);
vm.runInContext(SEED_SOURCE, context, { filename: 'seeded-rng' });
for (const relative of SCRIPTS) load(relative);

const NB = sandbox.NB;

/* --------------------------------- 驱动 --------------------------------- */

const FIXED_STEP = 1000 / 60; // 一秒 60 帧
let clock = 0;

/** 跑一帧：取出主循环排队的回调，用递增的时间戳调用它 */
function tick() {
  const pending = rafQueue;
  rafQueue = [];
  clock += FIXED_STEP;
  sandbox.performance.now = () => clock;
  for (const callback of pending) callback(clock);
}

function runFrames(count) {
  for (let i = 0; i < count; i++) tick();
}

/* --------------------------------- 断言 --------------------------------- */

console.log('霓虹打砖块 · 无头冒烟测试\n');

check(`${SCRIPTS.length + 1} 个脚本全部加载完成`, Boolean(NB && NB.Game && NB.Levels && NB.Input));

const game = NB.game;
check('主循环把游戏实例挂到了 window.NB.game 上', Boolean(game));

const rowsValid = Array.from({ length: NB.Levels.count }, (_, i) => NB.Levels.get(i)).every((level) =>
  level.rows.every((row) => row.length === NB.Config.BRICK.cols)
);
const levels = Array.from({ length: NB.Levels.count }, (_, i) => NB.Levels.get(i));
const everyLevelClearable = levels.every(
  (level) => level.rows.join('').split('').some((char) => char !== '.' && char !== 'X')
);
check('每一关的地图行宽都与砖块列数一致', rowsValid, `列数 = ${NB.Config.BRICK.cols}`);
check('每一关都至少有一块可打碎的砖', everyLevelClearable, `共 ${NB.Levels.count} 关`);

runFrames(30);
check('初始状态是菜单', game.state === 'menu', game.state);
check('菜单里已经铺好了第一关的砖', game.bricks.length > 0, `${game.bricks.length} 块`);
check('菜单氛围粒子在生成', game.particles.items.length > 0, `${game.particles.items.length} 个`);

element('panel-action').dispatch('click');
check('点击开始后进入待发球状态', game.state === 'ready', game.state);
check('待发球时球粘在挡板上', game.balls.length === 1 && game.balls[0].stuck);

element('panel-action').dispatch('click');
check('再次点击后进入对局', game.state === 'playing', game.state);
check('球已经发射', !game.balls[0].stuck);

/* --- 自动对局：挡板始终追着球，看看能不能真的打通关 --- */

const startBricks = game.bricks.filter((brick) => !brick.unbreakable).length;
let clearedLevels = 0;
let lastLevelIndex = game.levelIndex;
let maxScore = 0;
let sawParticles = false;
let sawPowerups = false;

for (let frame = 0; frame < 60 * 240; frame++) {
  const ball = game.balls[0];
  if (ball) {
    // 故意让球打在挡板偏左 / 偏右的位置，模拟真人控球（只在正中间打会一直垂直往返）
    const aim = frame % 300 < 150 ? 0.7 : -0.7;
    game.paddle.setPointer(ball.x - aim * game.paddle.width * 0.5);
  }

  // 需要玩家出手的状态就自动按一下空格，顺便覆盖发球与激光逻辑
  if (game.state === 'ready' || game.state === 'levelclear') {
    game.launch();
  } else if (frame % 90 === 0) {
    game.launch();
  }

  tick();

  maxScore = Math.max(maxScore, game.score);
  if (game.particles.items.length > 0) sawParticles = true;
  if (game.powerups.length > 0) sawPowerups = true;
  if (game.levelIndex !== lastLevelIndex) {
    clearedLevels += 1;
    lastLevelIndex = game.levelIndex;
  }
  if (game.state === 'gameover' || game.state === 'win') break;
}

check('自动对局没有抛异常', true);
check('挡板追球能真正打碎砖块', game.bricks.some((brick) => brick.dead) || maxScore > 0, `得分 ${maxScore}`);
check('击碎砖块会累加得分', maxScore > 0, `最高得分 ${maxScore}`);
check(
  '砖块被击碎后会掉落道具或产生粒子',
  sawParticles || sawPowerups,
  `粒子 ${sawParticles ? '有' : '无'} / 道具 ${sawPowerups ? '有' : '无'}`
);
check('球始终留在球场范围内', game.balls.every((b) => b.y > -80 && b.y < NB.Config.HEIGHT + 80));

const progress = clearedLevels > 0 || game.state === 'win';
check(
  '可以推进关卡（AI 接球下通关）',
  progress,
  `推进 ${clearedLevels} 关，当前第 ${game.levelIndex + 1} 关 / 状态 ${game.state}`
);

/* --- 故意不接球，验证掉命与结算 --- */

if (game.state !== 'gameover') {
  game.startRun();
  const livesBefore = game.lives;
  let sawLifeLoss = false;

  for (let frame = 0; frame < 60 * 120; frame++) {
    if (game.state === 'ready') game.launch();

    // 把挡板瞬移到球的另一侧，保证漏球
    const ball = game.balls[0];
    if (ball) {
      game.paddle.x = ball.x < NB.Config.WIDTH / 2 ? NB.Config.WIDTH - game.paddle.width : 0;
      game.paddle.targetX = game.paddle.x;
      game.paddle.pointerActive = true;
    }

    tick();
    if (game.lives < livesBefore) sawLifeLoss = true;
    if (game.state === 'gameover') break;
  }

  check('漏球会扣掉一条命', sawLifeLoss);
  check('生命耗尽后进入结算界面', game.state === 'gameover', game.state);
  check('本局得分被记录为最高分', game.best >= game.score, `最高分 ${game.best}`);
}

/* -------------------------------- 双人对战 -------------------------------- */

console.log('');

game.startRun('versus');
check('切到双人对战会多出一块上方挡板', game.mode === 'versus' && Boolean(game.paddle2));
check(
  '两块挡板分守上下两端',
  game.paddle.y > NB.Config.HEIGHT / 2 && game.paddle2.y < NB.Config.HEIGHT / 2,
  `P1 y=${game.paddle.y} / P2 y=${game.paddle2.y}`
);
check(
  '对战里砖墙被摆到球场正中间',
  game.bricks.length > 0 && game.bricks.every((brick) => brick.y > 150 && brick.y < 420),
  `${game.bricks.length} 块`
);
check(
  '待发球时球贴在发球方挡板内侧',
  game.balls.length === 1 && game.balls[0].stuck && game.balls[0].y < game.paddle.y,
  `球 y=${Math.round(game.balls[0].y)}`
);

// 两块挡板都追着球跑，看对战能不能真打起来
game.launch(1);
let sawP2Hit = false;
let maxScore2 = 0;
for (let frame = 0; frame < 60 * 240; frame++) {
  const ball = game.balls[0];
  if (ball) {
    const aim = frame % 240 < 120 ? 0.6 : -0.6;
    game.paddle.setPointer(ball.x - aim * game.paddle.width * 0.5);
    game.paddle2.setPointer(ball.x - aim * game.paddle2.width * 0.5);
  }
  if (game.state === 'ready' || game.state === 'levelclear') game.launch();
  tick();

  if (game.lastHitter === 2) sawP2Hit = true;
  maxScore2 = Math.max(maxScore2, game.score2);
  if (game.state === 'gameover') break;
}

check('两个玩家来回对打（上方挡板能把球打回去）', sawP2Hit);
check('砖块得分记在最后击球者名下', maxScore2 > 0, `P2 得分 ${maxScore2}`);

// 对战没有终点：清空砖墙应该进入下一关
game.startRun('versus');
game.bricks.forEach((brick) => {
  if (!brick.unbreakable) brick.dead = true;
});
game.checkLevelClear();
check('对战中清空砖墙进入下一关而不是通关', game.state === 'levelclear', game.state);

// 镜像道具
game.startRun('versus');
game.powerups.length = 0;
let dropGuard = 0;
while (game.powerups.length === 0 && dropGuard++ < 300) game.maybeDropPowerUp(450, 300);
const upward = game.powerups.filter((item) => item.dir < 0);
const downward = game.powerups.filter((item) => item.dir > 0);
check('对战里掉落道具会朝上下两侧各生成一个', upward.length === 1 && downward.length === 1, `${game.powerups.length} 个`);

const mirrorUp = new NB.PowerUp(450, 300, 'expand', -1);
const mirrorDown = new NB.PowerUp(450, 300, 'expand', 1);
for (let i = 0; i < 60; i++) {
  mirrorUp.update(1 / 60);
  mirrorDown.update(1 / 60);
}
check('镜像道具分别朝上下离开', mirrorUp.y < 300 && mirrorDown.y > 300, `上 ${Math.round(mirrorUp.y)} / 下 ${Math.round(mirrorDown.y)}`);

// 漏球判定：把球直接放到挡板身后，看它飞出去之后算谁漏
function forceExit(side) {
  game.startRun('versus');
  game.state = 'playing';
  const ball = game.balls[0];
  ball.stuck = false;
  ball.trail.length = 0;
  ball.x = NB.Config.WIDTH / 2;
  ball.vx = 0;
  if (side === 'top') {
    ball.y = 20;
    ball.vy = -520;
  } else {
    ball.y = NB.Config.HEIGHT - 20;
    ball.vy = 520;
  }
}

forceExit('top');
const p2LivesBefore = game.lives2;
runFrames(24);
check('球从顶端飞出去算上方玩家漏球', game.lives2 === p2LivesBefore - 1, `P2 生命 ${p2LivesBefore} → ${game.lives2}`);
check('漏球之后由漏球方发球', game.state === 'ready' && game.server === 2, `状态 ${game.state} / server ${game.server}`);
check(
  '上方玩家发球时球粘在上方挡板下沿',
  game.balls[0].y > game.paddle2.y && game.balls[0].y < game.paddle2.y + 40,
  `球 y=${Math.round(game.balls[0].y)}`
);

forceExit('bottom');
const p1LivesBefore = game.lives;
runFrames(24);
check('球从底端飞出去算下方玩家漏球', game.lives === p1LivesBefore - 1, `P1 生命 ${p1LivesBefore} → ${game.lives}`);

forceExit('top');
game.lives2 = 1;
runFrames(24);
check('上方玩家命耗尽时对手获胜', game.state === 'gameover' && game.winner === 1, `状态 ${game.state} / 胜者 P${game.winner}`);

forceExit('bottom');
game.lives = 1;
runFrames(24);
check('下方玩家命耗尽时上方玩家获胜', game.state === 'gameover' && game.winner === 2, `状态 ${game.state} / 胜者 P${game.winner}`);

// 回到单人模式应该收掉上方挡板，避免旧状态残留
game.startRun('solo');
check('切回单人模式会收掉上方挡板', game.mode === 'solo' && game.paddle2 === null, `mode=${game.mode}`);

// 真实的按钮路径：菜单里点「本地双人对战」直接开局，再点一次切回单人
game.startRun('solo');
tick(); // HUD 是每帧同步的，推进一帧让它反映当前模式
check('单人模式下 P2 的 HUD 不显示', element('stat-score2-wrap').hidden && element('stat-lives2-wrap').hidden);

element('panel-versus').dispatch('click');
tick();
check(
  '点菜单里的「本地双人对战」能直接开一局对战',
  game.mode === 'versus' && game.state === 'ready' && Boolean(game.paddle2),
  `mode=${game.mode} / 状态 ${game.state}`
);
check('对战时 P2 的得分与生命会显示在 HUD 上', !element('stat-score2-wrap').hidden && !element('stat-lives2-wrap').hidden);

element('panel-versus').dispatch('click');
tick();
check(
  '再点一次切回单人闯关',
  game.mode === 'solo' && game.state === 'ready' && game.paddle2 === null,
  `mode=${game.mode}`
);
check('切回单人后 P2 的 HUD 会隐藏', element('stat-score2-wrap').hidden);

/* --------------------------------- 汇总 --------------------------------- */

console.log('');
if (failures === 0) {
  console.log('全部检查通过 ✅');
  process.exit(0);
} else {
  console.log(`有 ${failures} 项检查未通过 ❌`);
  process.exit(1);
}
