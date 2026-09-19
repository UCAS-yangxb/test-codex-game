/*!
 * audio.js —— 用 Web Audio API 现场合成音效，不需要任何音频文件。
 */
(function (global) {
  'use strict';

  const NB = (global.NB = global.NB || {});

  class Sound {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
    }

    /** 首次播放时才创建 AudioContext（浏览器要求由用户操作触发） */
    ensure() {
      if (!this.enabled) return null;

      if (!this.ctx) {
        const AudioCtor = global.AudioContext || global.webkitAudioContext;
        if (!AudioCtor) {
          this.enabled = false;
          return null;
        }
        try {
          this.ctx = new AudioCtor();
        } catch (err) {
          this.enabled = false;
          return null;
        }
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.26;
        this.master.connect(this.ctx.destination);
      }

      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
      if (!this.enabled && this.ctx && this.ctx.state === 'running') this.ctx.suspend();
      if (this.enabled) this.ensure();
    }

    /** 播放一个带包络的振荡器音符 */
    tone(options) {
      const ctx = this.ensure();
      if (!ctx) return;

      const opts = options || {};
      const freq = opts.freq || 440;
      const duration = opts.duration || 0.12;
      const volume = opts.volume || 0.3;
      const delay = opts.delay || 0;
      const start = ctx.currentTime + delay;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(freq, start);
      if (opts.sweepTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.sweepTo), start + duration);
      }

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(this.master);
      osc.start(start);
      osc.stop(start + duration + 0.03);
    }

    play(name) {
      if (!this.enabled) return;

      switch (name) {
        case 'paddle':
          this.tone({ freq: 300, sweepTo: 520, type: 'square', duration: 0.07, volume: 0.24 });
          break;
        case 'wall':
          this.tone({ freq: 220, sweepTo: 180, type: 'triangle', duration: 0.05, volume: 0.16 });
          break;
        case 'brick':
          this.tone({ freq: 700, sweepTo: 940, type: 'square', duration: 0.05, volume: 0.18 });
          break;
        case 'break':
          this.tone({ freq: 880, sweepTo: 1320, type: 'triangle', duration: 0.1, volume: 0.2 });
          this.tone({ freq: 1320, sweepTo: 1760, type: 'sine', duration: 0.08, volume: 0.1, delay: 0.03 });
          break;
        case 'steel':
          this.tone({ freq: 160, sweepTo: 120, type: 'sawtooth', duration: 0.08, volume: 0.18 });
          break;
        case 'launch':
          this.tone({ freq: 420, sweepTo: 880, type: 'triangle', duration: 0.14, volume: 0.2 });
          break;
        case 'powerup':
          [523, 659, 784, 1047].forEach((freq, i) => {
            this.tone({ freq, type: 'triangle', duration: 0.1, volume: 0.16, delay: i * 0.055 });
          });
          break;
        case 'laser':
          this.tone({ freq: 1100, sweepTo: 220, type: 'sawtooth', duration: 0.12, volume: 0.14 });
          break;
        case 'lose':
          this.tone({ freq: 320, sweepTo: 70, type: 'sawtooth', duration: 0.5, volume: 0.24 });
          break;
        case 'levelclear':
          [523, 659, 784, 1047, 1319].forEach((freq, i) => {
            this.tone({ freq, type: 'triangle', duration: 0.18, volume: 0.18, delay: i * 0.09 });
          });
          break;
        case 'gameover':
          [400, 320, 250, 170].forEach((freq, i) => {
            this.tone({ freq, type: 'sawtooth', duration: 0.3, volume: 0.2, delay: i * 0.16 });
          });
          break;
        case 'start':
          [392, 523, 659].forEach((freq, i) => {
            this.tone({ freq, type: 'triangle', duration: 0.14, volume: 0.18, delay: i * 0.07 });
          });
          break;
        default:
          break;
      }
    }
  }

  NB.Sound = Sound;
})(window);
