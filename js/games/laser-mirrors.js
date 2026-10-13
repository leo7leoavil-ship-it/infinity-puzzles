/**
 * Laser & Mirrors (Reflexión Óptica)
 * Real-time 2D optical raycasting puzzle with rotatable 45-degree mirrors and photon glow.
 */
import { PRNG } from '../prng.js';
import { sound } from '../audio.js';
import { haptics } from '../haptics.js';

export class LaserMirrorsGame {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.difficulty = options.difficulty || 'medium';
    this.seed = options.seed || 'LASER1';
    this.onMove = options.onMove || (() => {});
    this.onWin = options.onWin || (() => {});

    this.rows = 7;
    this.cols = 7;
    this.grid = []; // 2D array: null | { type: 'emitter'|'sensor'|'mirror'|'wall', ... }
    this.emitter = null;
    this.sensors = [];
    this.mirrors = [];
    this.laserPath = []; // list of {x, y} canvas points
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;

    this.init();
  }

  init() {
    this.container.innerHTML = `
      <div class="laser-wrapper">
        <div class="game-instruction">Toca los espejos a 45° para reflejar el láser y activar los sensores cuánticos.</div>
        <div class="laser-board-container" id="laser-container">
          <canvas id="laser-canvas"></canvas>
          <div class="laser-board-grid" id="laser-grid"></div>
        </div>
      </div>
    `;
    this.containerEl = this.container.querySelector('#laser-container');
    this.canvas = this.container.querySelector('#laser-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.gridEl = this.container.querySelector('#laser-grid');

    this.newLevel(this.seed, this.difficulty);
  }

  getDifficultyConfig() {
    switch (this.difficulty) {
      case 'easy': return { rows: 6, cols: 6, mirrorCount: 3 };
      case 'hard': return { rows: 8, cols: 8, mirrorCount: 6 };
      case 'medium':
      default: return { rows: 7, cols: 7, mirrorCount: 4 };
    }
  }

  newLevel(seed, difficulty) {
    this.seed = seed;
    this.difficulty = difficulty || this.difficulty;
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;

    const prng = new PRNG(this.seed);
    const { rows, cols, mirrorCount } = this.getDifficultyConfig();
    this.rows = rows;
    this.cols = cols;

    // Reset grid
    this.grid = Array(rows).fill(null).map(() => Array(cols).fill(null));
    this.mirrors = [];
    this.sensors = [];

    // Reverse raycasting generator:
    // Place emitter at (1, 0) shooting right (dr: 0, dc: 1)
    this.emitter = { r: 1, c: 0, dir: { dr: 0, dc: 1 } };
    this.grid[1][0] = { type: 'emitter', dir: this.emitter.dir };

    let curR = 1;
    let curC = 0;
    let curDr = 0;
    let curDc = 1;

    const solutionMirrors = [];

    for (let m = 0; m < mirrorCount; m++) {
      // Advance 1 to 3 steps in current direction
      const stepLimit = curDr !== 0 ? (curDr > 0 ? rows - 1 - curR : curR) : (curDc > 0 ? cols - 1 - curC : curC);
      const steps = Math.min(stepLimit - 1, prng.randInt(2, 4));

      if (steps <= 0) break;
      curR += curDr * steps;
      curC += curDc * steps;

      // Choose next orthogonal turn: 90 deg clockwise or counterclockwise
      const turnClockwise = prng.next() < 0.5;
      let nextDr = 0, nextDc = 0;

      if (curDr === 0 && curDc === 1) { // moving Right
        nextDr = turnClockwise ? 1 : -1;
      } else if (curDr === 0 && curDc === -1) { // moving Left
        nextDr = turnClockwise ? -1 : 1;
      } else if (curDr === 1 && curDc === 0) { // moving Down
        nextDc = turnClockwise ? -1 : 1;
      } else if (curDr === -1 && curDc === 0) { // moving Up
        nextDc = turnClockwise ? 1 : -1;
      }

      // Check bounds for turn
      if (curR + nextDr < 1 || curR + nextDr >= rows - 1 || curC + nextDc < 1 || curC + nextDc >= cols - 1) {
        nextDr = -nextDr;
        nextDc = -nextDc;
      }

      // Determine mirror orientation ('/' or '\') that performs this deflection
      // '/' deflects: (0,1)->(-1,0), (0,-1)->(1,0), (1,0)->(0,-1), (-1,0)->(0,1)
      // '\' deflects: (0,1)->(1,0), (0,-1)->(-1,0), (1,0)->(0,1), (-1,0)->(0,-1)
      let mirrorType = '/';
      if ((curDc === 1 && nextDr === 1) || (curDc === -1 && nextDr === -1) || (curDr === 1 && nextDc === 1) || (curDr === -1 && nextDc === -1)) {
        mirrorType = '\\';
      }

      const mirrorObj = {
        type: 'mirror',
        r: curR,
        c: curC,
        mirrorType,
        solvedType: mirrorType
      };
      this.grid[curR][curC] = mirrorObj;
      solutionMirrors.push(mirrorObj);

      curDr = nextDr;
      curDc = nextDc;
    }

    // Place sensor after one or two more steps in curDr, curDc
    const sensorR = Math.max(0, Math.min(rows - 1, curR + curDr * 2));
    const sensorC = Math.max(0, Math.min(cols - 1, curC + curDc * 2));
    this.sensors = [{ r: sensorR, c: sensorC, active: false }];
    this.grid[sensorR][sensorC] = { type: 'sensor' };

    // Scramble mirrors by flipping their 45 deg angle
    for (let m of solutionMirrors) {
      if (prng.next() < 0.65) {
        m.mirrorType = (m.mirrorType === '/') ? '\\' : '/';
      }
      this.mirrors.push(m);
    }

    this.render();
    this.recomputeLaser();
  }

  render() {
    this.gridEl.innerHTML = '';
    this.gridEl.style.setProperty('--laser-rows', this.rows);
    this.gridEl.style.setProperty('--laser-cols', this.cols);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'laser-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;

        const item = this.grid[r][c];
        if (item) {
          if (item.type === 'emitter') {
            cell.classList.add('is-emitter');
            cell.innerHTML = '<div class="emitter-core">⚡</div>';
          } else if (item.type === 'sensor') {
            cell.classList.add('is-sensor');
            cell.innerHTML = '<div class="sensor-core">◎</div>';
            item.el = cell;
          } else if (item.type === 'mirror') {
            const btn = document.createElement('button');
            btn.className = `laser-mirror ${item.mirrorType === '/' ? 'slash' : 'backslash'}`;
            btn.setAttribute('aria-label', `Espejo en ${r + 1}, ${c + 1}`);
            btn.innerHTML = `<span class="mirror-surface"></span>`;
            btn.addEventListener('click', () => this.handleMirrorClick(item, btn));
            cell.appendChild(btn);
            item.el = btn;
          }
        }

        this.gridEl.appendChild(cell);
      }
    }

    this.resizeCanvas();
  }

  resizeCanvas() {
    const rect = this.containerEl.getBoundingClientRect();
    if (rect.width > 0) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }
  }

  handleMirrorClick(mirror, btn) {
    if (this.solved) return;

    sound.playRotate();
    haptics.tap();

    this.undoStack.push({ mirror, oldType: mirror.mirrorType });
    mirror.mirrorType = (mirror.mirrorType === '/') ? '\\' : '/';

    btn.className = `laser-mirror ${mirror.mirrorType === '/' ? 'slash' : 'backslash'}`;
    btn.classList.add('rotate-click');
    setTimeout(() => btn.classList.remove('rotate-click'), 200);

    this.moves++;
    this.onMove(this.moves);

    this.recomputeLaser();
    this.checkWinCondition();
  }

  recomputeLaser() {
    this.resizeCanvas();
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    const cellW = w / this.cols;
    const cellH = h / this.rows;

    let curR = this.emitter.r;
    let curC = this.emitter.c;
    let dr = this.emitter.dir.dr;
    let dc = this.emitter.dir.dc;

    const points = [
      { x: (curC + 0.5) * cellW, y: (curR + 0.5) * cellH }
    ];

    let sensorHit = false;
    let steps = 0;

    while (steps < 35) {
      steps++;
      curR += dr;
      curC += dc;

      // Check board boundaries
      if (curR < 0 || curR >= this.rows || curC < 0 || curC >= this.cols) {
        // Stop ray at border edge
        points.push({
          x: (curC - dc * 0.5 + 0.5) * cellW,
          y: (curR - dr * 0.5 + 0.5) * cellH
        });
        break;
      }

      const item = this.grid[curR][curC];
      const cx = (curC + 0.5) * cellW;
      const cy = (curR + 0.5) * cellH;

      if (!item) {
        continue;
      }

      if (item.type === 'sensor') {
        points.push({ x: cx, y: cy });
        sensorHit = true;
        break;
      }

      if (item.type === 'wall') {
        points.push({ x: cx, y: cy });
        break;
      }

      if (item.type === 'mirror') {
        points.push({ x: cx, y: cy });
        // Deflect
        if (item.mirrorType === '/') {
          // (0,1)->(-1,0), (0,-1)->(1,0), (1,0)->(0,-1), (-1,0)->(0,1)
          const newDr = -dc;
          const newDc = -dr;
          dr = newDr;
          dc = newDc;
        } else if (item.mirrorType === '\\') {
          // (0,1)->(1,0), (0,-1)->(-1,0), (1,0)->(0,1), (-1,0)->(0,-1)
          const newDr = dc;
          const newDc = dr;
          dr = newDr;
          dc = newDc;
        }
      }
    }

    this.laserPoints = points;
    this.sensorHit = sensorHit;

    // Update sensor UI
    for (let s of this.sensors) {
      if (sensorHit) {
        s.el?.classList.add('activated');
      } else {
        s.el?.classList.remove('activated');
      }
    }

    this.drawLaserRay();
  }

  drawLaserRay() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    if (!this.laserPoints || this.laserPoints.length < 2) return;

    // Outer Neon Glow
    this.ctx.beginPath();
    this.ctx.lineWidth = 6;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = this.sensorHit ? 'rgba(0, 240, 255, 0.45)' : 'rgba(244, 63, 94, 0.45)';
    this.ctx.shadowColor = this.sensorHit ? '#00f0ff' : '#f43f5e';
    this.ctx.shadowBlur = 12;

    for (let i = 0; i < this.laserPoints.length; i++) {
      const pt = this.laserPoints[i];
      if (i === 0) this.ctx.moveTo(pt.x, pt.y);
      else this.ctx.lineTo(pt.x, pt.y);
    }
    this.ctx.stroke();

    // Intense Core Beam
    this.ctx.beginPath();
    this.ctx.lineWidth = 2.5;
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.shadowBlur = 4;
    for (let i = 0; i < this.laserPoints.length; i++) {
      const pt = this.laserPoints[i];
      if (i === 0) this.ctx.moveTo(pt.x, pt.y);
      else this.ctx.lineTo(pt.x, pt.y);
    }
    this.ctx.stroke();

    // Pulse node on target when hit
    if (this.sensorHit) {
      const last = this.laserPoints[this.laserPoints.length - 1];
      this.ctx.beginPath();
      this.ctx.arc(last.x, last.y, 8, 0, Math.PI * 2);
      this.ctx.fillStyle = '#00f0ff';
      this.ctx.shadowBlur = 16;
      this.ctx.fill();
    }
  }

  checkWinCondition() {
    if (this.sensorHit && !this.solved) {
      this.solved = true;
      sound.playLaser();
      setTimeout(() => {
        sound.playVictory();
        haptics.victory();
        this.onWin({ moves: this.moves });
      }, 300);
    }
  }

  undo() {
    if (this.undoStack.length === 0 || this.solved) return false;
    const last = this.undoStack.pop();
    last.mirror.mirrorType = last.oldType;
    last.mirror.el.className = `laser-mirror ${last.mirror.mirrorType === '/' ? 'slash' : 'backslash'}`;

    this.moves++;
    this.onMove(this.moves);
    sound.playRotate();
    haptics.tap();

    this.recomputeLaser();
    return true;
  }

  canUndo() {
    return this.undoStack.length > 0 && !this.solved;
  }

  reset() {
    this.newLevel(this.seed, this.difficulty);
  }

  destroy() {
    this.containerEl = null;
    this.canvas = null;
  }
}
