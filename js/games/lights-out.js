/**
 * Lights Out (Luces Fuera)
 * Binary matrix inverted puzzle with guaranteed solvability.
 */
import { PRNG } from '../prng.js';
import { sound } from '../audio.js';
import { haptics } from '../haptics.js';

export class LightsOutGame {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.difficulty = options.difficulty || 'medium';
    this.seed = options.seed || 'LIGHT1';
    this.onMove = options.onMove || (() => {});
    this.onWin = options.onWin || (() => {});

    this.grid = []; // boolean matrix [r][c] true = ON, false = OFF
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;

    this.init();
  }

  init() {
    this.container.innerHTML = `
      <div class="lightsout-wrapper">
        <div class="game-instruction">Apaga todas las luces. Cada pulsación altera la celda y sus 4 vecinas.</div>
        <div class="lightsout-board" id="lightsout-board"></div>
      </div>
    `;
    this.boardEl = this.container.querySelector('#lightsout-board');
    this.newLevel(this.seed, this.difficulty);
  }

  getDifficultyConfig() {
    switch (this.difficulty) {
      case 'easy': return { size: 4, toggleCount: 5 };
      case 'hard': return { size: 5, toggleCount: 14 };
      case 'medium':
      default: return { size: 5, toggleCount: 8 };
    }
  }

  newLevel(seed, difficulty) {
    this.seed = seed;
    this.difficulty = difficulty || this.difficulty;
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;

    const prng = new PRNG(this.seed);
    const { size, toggleCount } = this.getDifficultyConfig();
    this.size = size;

    // Start with all lights OFF (solved state)
    this.grid = Array(size).fill(false).map(() => Array(size).fill(false));

    // Pick distinct or randomized toggle cells to scramble from OFF state
    const toggledCells = new Set();
    while (toggledCells.size < toggleCount) {
      const r = prng.randInt(0, size - 1);
      const c = prng.randInt(0, size - 1);
      const key = `${r},${c}`;
      if (!toggledCells.has(key)) {
        toggledCells.add(key);
        this.toggleInternal(r, c);
      }
    }

    // Edge case: if by any chance all lights ended up OFF, toggle center
    let anyOn = false;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (this.grid[r][c]) anyOn = true;
      }
    }
    if (!anyOn) {
      this.toggleInternal(0, 0);
    }

    this.render();
  }

  toggleInternal(r, c) {
    const coords = [
      { r, c },
      { r: r - 1, c },
      { r: r + 1, c },
      { r, c: c - 1 },
      { r, c: c + 1 }
    ];
    for (let coord of coords) {
      if (coord.r >= 0 && coord.r < this.size && coord.c >= 0 && coord.c < this.size) {
        this.grid[coord.r][coord.c] = !this.grid[coord.r][coord.c];
      }
    }
  }

  render() {
    this.boardEl.innerHTML = '';
    this.boardEl.style.setProperty('--lo-size', this.size);

    this.cellElements = [];
    for (let r = 0; r < this.size; r++) {
      const row = [];
      for (let c = 0; c < this.size; c++) {
        const btn = document.createElement('button');
        btn.className = `lo-cell ${this.grid[r][c] ? 'is-on' : 'is-off'}`;
        btn.dataset.r = r;
        btn.dataset.c = c;
        btn.setAttribute('aria-label', `Luz ${r + 1}, ${c + 1}`);

        btn.innerHTML = `<span class="lo-bulb"></span>`;
        btn.addEventListener('click', () => this.handleCellClick(r, c));
        this.boardEl.appendChild(btn);
        row.push(btn);
      }
      this.cellElements.push(row);
    }
  }

  handleCellClick(r, c) {
    if (this.solved) return;

    sound.playTap();
    haptics.tap();

    this.undoStack.push({ r, c });
    this.toggleInternal(r, c);
    this.moves++;
    this.onMove(this.moves);

    this.updateBoardUI();
    this.checkWinCondition();
  }

  updateBoardUI() {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const isOn = this.grid[r][c];
        const el = this.cellElements[r][c];
        if (isOn) {
          el.classList.add('is-on');
          el.classList.remove('is-off');
        } else {
          el.classList.remove('is-on');
          el.classList.add('is-off');
        }
      }
    }
  }

  checkWinCondition() {
    let anyOn = false;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c]) {
          anyOn = true;
          break;
        }
      }
      if (anyOn) break;
    }

    if (!anyOn && !this.solved) {
      this.solved = true;
      sound.playVictory();
      haptics.victory();
      this.onWin({ moves: this.moves });
    }
  }

  undo() {
    if (this.undoStack.length === 0 || this.solved) return false;
    const last = this.undoStack.pop();
    this.toggleInternal(last.r, last.c);
    this.moves++;
    this.onMove(this.moves);
    this.updateBoardUI();
    sound.playTap();
    haptics.tap();
    return true;
  }

  canUndo() {
    return this.undoStack.length > 0 && !this.solved;
  }

  reset() {
    this.newLevel(this.seed, this.difficulty);
  }

  destroy() {
    this.boardEl = null;
  }
}
