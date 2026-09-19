/*!
 * input.js —— 把鼠标、触摸、键盘统一成三个回调：移动、动作、暂停。
 */
(function (global) {
  'use strict';

  const NB = (global.NB = global.NB || {});

  const LEFT_KEYS = ['ArrowLeft', 'KeyA'];
  const RIGHT_KEYS = ['ArrowRight', 'KeyD'];

  /**
   * handlers: { onMove(logicalX), onAction(), onPause(), onMute(), onDirection(-1|0|1) }
   * 返回一个 detach() 用于解绑全部监听。
   */
  function attach(stage, canvas, handlers) {
    const held = { left: false, right: false };

    function toLogicalX(clientX) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return NB.Config.WIDTH / 2;
      const ratio = (clientX - rect.left) / rect.width;
      return ratio * NB.Config.WIDTH;
    }

    function syncDirection() {
      const direction = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      handlers.onDirection(direction);
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
        // 长按方向键已经在 held 里记录了，这里直接吃掉重复事件
        if (LEFT_KEYS.includes(event.code) || RIGHT_KEYS.includes(event.code) || event.code === 'Space') {
          event.preventDefault();
        }
        return;
      }

      if (LEFT_KEYS.includes(event.code)) {
        held.left = true;
        syncDirection();
        event.preventDefault();
      } else if (RIGHT_KEYS.includes(event.code)) {
        held.right = true;
        syncDirection();
        event.preventDefault();
      } else if (event.code === 'Space' || event.code === 'Enter') {
        handlers.onAction();
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
      if (LEFT_KEYS.includes(event.code)) {
        held.left = false;
        syncDirection();
      } else if (RIGHT_KEYS.includes(event.code)) {
        held.right = false;
        syncDirection();
      }
    }

    function handleBlur() {
      held.left = false;
      held.right = false;
      syncDirection();
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
