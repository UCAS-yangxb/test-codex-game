/*!
 * storage.js —— 最高分与设置的本地持久化。
 * 在无痕模式或被禁用 localStorage 的环境里会自动降级为纯内存。
 */
(function (global) {
  'use strict';

  const NB = (global.NB = global.NB || {});

  const KEY_BEST = 'neon-breaker:best';
  const KEY_SOUND = 'neon-breaker:sound';

  function readRaw(key) {
    try {
      return global.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      global.localStorage.setItem(key, value);
    } catch (err) {
      /* 忽略：写不进去也不影响游戏进行 */
    }
  }

  NB.Storage = {
    getBest() {
      const value = Number(readRaw(KEY_BEST));
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    },

    setBest(score) {
      const next = Math.max(0, Math.floor(score));
      if (next > this.getBest()) writeRaw(KEY_BEST, String(next));
      return this.getBest();
    },

    getSoundEnabled() {
      return readRaw(KEY_SOUND) !== 'off';
    },

    setSoundEnabled(enabled) {
      writeRaw(KEY_SOUND, enabled ? 'on' : 'off');
    },
  };
})(window);
