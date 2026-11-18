// Keyboard and mouse state. The game reads `keys` (held) and consumes
// one-shot presses through `pressed()`; the camera reads accumulated mouse
// deltas through `takeMouseDelta()`. Pointer lock is requested on canvas
// click and released on Escape; dragging also orbits, so the game is fully
// playable without pointer lock.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = Object.create(null);
    this.pressedKeys = new Set();
    this.mouseDown = false;
    this.mouseClicked = false;
    this.dx = 0;
    this.dy = 0;
    this.locked = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.pressedKeys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    window.addEventListener('blur', () => {
      this.keys = Object.create(null);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.mouseClicked = true;
      if (!this.locked) canvas.requestPointerLock?.();
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      } else if (this.mouseDown) {
        // Drag to orbit when pointer lock is off (menus, touchpads, screenshots).
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code) {
    return !!this.keys[code];
  }

  // True once, on the frame the key went down.
  pressed(code) {
    return this.pressedKeys.has(code);
  }

  // True once, on the frame the mouse button went down.
  clicked() {
    return this.mouseClicked;
  }

  takeMouseDelta() {
    const d = { x: this.dx, y: this.dy };
    this.dx = 0;
    this.dy = 0;
    return d;
  }

  // Call at the end of each frame.
  endFrame() {
    this.pressedKeys.clear();
    this.mouseClicked = false;
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
