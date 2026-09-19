/*!
 * input.js —— 把鼠标、触摸、键盘统一成三个回调：移动、动作、暂停。
 */
(function (global) {
  'use strict';

  const NB = (global.NB = global.NB || {});

  // 单人：WASD 与方向键都控制同一块挡板
  // 双人：上方玩家用 A / D，下方玩家用 ← / →
  const P1_LEFT = ['KeyA'];
  const P1_RIGHT = ['KeyD'];
  const P2_LEFT = ['ArrowLeft'];
  const P2_RIGHT = ['ArrowRight'];
  const DIRECTION_CODES = [...P1_LEFT, ...P1_RIGHT, ...P2_LEFT, ...P2_RIGHT];

  /**
   * handlers: { onMove(logicalX), onAction(player), onPause(), onMute(), onDirection(-1|0|1, player) }
   * 返回一个 detach() 用于解绑全部监听。
   */
  function attach(stage, canvas, handlers) {
    const held = {
      1: { left: false, right: false },
      2: { left: false, right: false },
    };

    function toLogicalX(clientX) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return NB.Config.WIDTH / 2;
      const ratio = (clientX - rect.left) / rect.width;
      return ratio * NB.Config.WIDTH;
    }

    function syncDirection(player) {
      const state = held[player];
      const direction = (state.right ? 1 : 0) - (state.left ? 1 : 0);
      handlers.onDirection(direction, player);
    }

    function handlePointerMove(event) {
      handlers.onMove(toLogicalX(event.clientX));
    }

    function handlePointerDown(event) {
      // 只接管落在画布上的点击，界面按钮交给 DOM 自己处理
      if (event.target !== canvas) return;
      if (event.pointerType !== 'mouse') handlers.onMove(toLogicalX(event.clientX));
      handlers.onAction();
    }

    function handleKeyDown(event) {
      if (event.repeat) {
        // 长按已经在 held 里记录了，这里直接吃掉重复事件
        if (DIRECTION_CODES.includes(event.code) || event.code === 'Space' || event.code === 'Enter') {
          event.preventDefault();
        }
        return;
      }

      if (P1_LEFT.includes(event.code)) {
        held[1].left = true;
        syncDirection(1);
        event.preventDefault();
      } else if (P1_RIGHT.includes(event.code)) {
        held[1].right = true;
        syncDirection(1);
        event.preventDefault();
      } else if (P2_LEFT.includes(event.code)) {
        held[2].left = true;
        syncDirection(2);
        event.preventDefault();
      } else if (P2_RIGHT.includes(event.code)) {
        held[2].right = true;
        syncDirection(2);
        event.preventDefault();
      } else if (event.code === 'Space') {
        handlers.onAction(1);
        event.preventDefault();
      } else if (event.code === 'Enter') {
        handlers.onAction(2);
        event.preventDefault();
      } else if (event.code === 'KeyP' || event.code === 'Escape') {
        handlers.onPause();
        event.preventDefault();
      } else if (event.code === 'KeyM') {
        handlers.onMute();
        event.preventDefault();
      }
    }

    function handleKeyUp(event) {
      if (P1_LEFT.includes(event.code)) {
        held[1].left = false;
        syncDirection(1);
      } else if (P1_RIGHT.includes(event.code)) {
        held[1].right = false;
        syncDirection(1);
      } else if (P2_LEFT.includes(event.code)) {
        held[2].left = false;
        syncDirection(2);
      } else if (P2_RIGHT.includes(event.code)) {
        held[2].right = false;
        syncDirection(2);
      }
    }

    function handleBlur() {
      for (const player of [1, 2]) {
        held[player].left = false;
        held[player].right = false;
        syncDirection(player);
      }
    }

    stage.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerdown', handlePointerDown);
    global.addEventListener('keydown', handleKeyDown);
    global.addEventListener('keyup', handleKeyUp);
    global.addEventListener('blur', handleBlur);

    return function detach() {
      stage.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      global.removeEventListener('keydown', handleKeyDown);
      global.removeEventListener('keyup', handleKeyUp);
      global.removeEventListener('blur', handleBlur);
    };
  }

  NB.Input = { attach };
})(window);
