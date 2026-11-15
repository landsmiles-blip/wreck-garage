// Unified One-Handed Floating Drag Joystick (Rule 1.6.6) + Desktop WASD/Arrows (Rule 1.5.1)
// Never binds or calls preventDefault on Escape (Rule 1.5.2 & Google Design §2).

export class InputController {
  constructor(canvas, onFirstGesture) {
    this.canvas = canvas;
    this.onFirstGesture = onFirstGesture;
    this.keys = new Set();
    this.activePointerId = null;
    this.originX = 0;
    this.originY = 0;
    this.curX = 0;
    this.curY = 0;
    this.maxRadius = 56;
    this.movedSinceStart = false;

    this.joyEl = document.createElement('div');
    this.joyEl.className = 'joy-ring hidden';
    this.knobEl = document.createElement('div');
    this.knobEl.className = 'joy-knob';
    this.joyEl.appendChild(this.knobEl);
    document.body.appendChild(this.joyEl);

    this.bind();
  }

  bind() {
    const markStart = () => {
      if (!this.movedSinceStart) {
        this.movedSinceStart = true;
        this.onFirstGesture?.();
      }
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.activePointerId !== null) return;
      this.activePointerId = e.pointerId;
      this.canvas.setPointerCapture?.(e.pointerId);
      this.originX = e.clientX;
      this.originY = e.clientY;
      this.curX = e.clientX;
      this.curY = e.clientY;
      this.joyEl.style.left = `${this.originX}px`;
      this.joyEl.style.top = `${this.originY}px`;
      this.knobEl.style.transform = 'translate(-50%, -50%)';
      this.joyEl.classList.remove('hidden');
      markStart();
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.activePointerId) return;
      this.curX = e.clientX;
      this.curY = e.clientY;
      const dx = this.curX - this.originX;
      const dy = this.curY - this.originY;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, this.maxRadius);
      const ang = Math.atan2(dy, dx);
      const kx = Math.cos(ang) * clamped;
      const ky = Math.sin(ang) * clamped;
      this.knobEl.style.transform = `translate(calc(-50% + ${kx.toFixed(1)}px), calc(-50% + ${ky.toFixed(1)}px))`;
    });

    const release = (e) => {
      if (e.pointerId !== this.activePointerId) return;
      this.activePointerId = null;
      this.joyEl.classList.add('hidden');
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);

    window.addEventListener('keydown', (e) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        this.keys.add(e.code);
        markStart();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.activePointerId = null;
      this.joyEl.classList.add('hidden');
    });
  }

  clearPointer() {
    this.activePointerId = null;
    this.keys.clear();
    this.joyEl.classList.add('hidden');
  }

  // Returns desired world-space XZ drive vector { x, z, magnitude }
  getVector() {
    let kx = 0;
    let kz = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) kz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) kz += 1;

    if (kx !== 0 || kz !== 0) {
      const len = Math.hypot(kx, kz);
      return { x: kx / len, z: kz / len, magnitude: 1 };
    }

    if (this.activePointerId !== null) {
      const dx = this.curX - this.originX;
      const dy = this.curY - this.originY;
      const dist = Math.hypot(dx, dy);
      if (dist > 6) {
        const mag = Math.min(1, dist / this.maxRadius);
        return { x: dx / dist, z: dy / dist, magnitude: mag };
      }
      return { x: 0, z: 0, magnitude: 0.25 };
    }

    return { x: 0, z: 0, magnitude: 0 };
  }
}
