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

/* --------------------------------- 汇总 --------------------------------- */

console.log('');
if (failures === 0) {
  console.log('全部检查通过 ✅');
  process.exit(0);
} else {
  console.log(`有 ${failures} 项检查未通过 ❌`);
  process.exit(1);
}
