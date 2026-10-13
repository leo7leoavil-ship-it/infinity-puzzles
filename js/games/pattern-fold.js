/**
 * Pattern Fold / Unroll (Desenvolver Cinta)
 * Reverse procedural partition generator with folding/unfolding ribbons.
 */
import { PRNG } from '../prng.js';
import { sound } from '../audio.js';
import { haptics } from '../haptics.js';

const FOLD_PALETTE = [
  '#00f0ff', '#a855f7', '#f59e0b', '#10b981', '#f43f5e', '#3b82f6', '#ec4899'
];

export class PatternFoldGame {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.difficulty = options.difficulty || 'medium';
    this.seed = options.seed || 'FOLD01';
    this.onMove = options.onMove || (() => {});
    this.onWin = options.onWin || (() => {});

    this.gridSize = 6;
    this.targetCells = new Set(); // "r,c" target silhouette
    this.ribbons = []; // { id, originR, originC, dir, len, color, isUnrolled, coveredCells: [] }
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;

    this.init();
  }

  init() {
    this.container.innerHTML = `
      <div class="fold-wrapper">
        <div class="game-instruction">Toca cada bloque para desenrollar su cinta en la dirección indicada y cubrir el patrón completo.</div>
        <div class="fold-board" id="fold-board"></div>
      </div>
    `;
    this.boardEl = this.container.querySelector('#fold-board');
    this.newLevel(this.seed, this.difficulty);
  }

  getDifficultyConfig() {
    switch (this.difficulty) {
      case 'easy': return { size: 5, ribbonCount: 4 };
      case 'hard': return { size: 7, ribbonCount: 8 };
      case 'medium':
      default: return { size: 6, ribbonCount: 6 };
    }
  }

  newLevel(seed, difficulty) {
    this.seed = seed;
    this.difficulty = difficulty || this.difficulty;
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;
    this.targetCells.clear();

    const prng = new PRNG(this.seed);
    const { size, ribbonCount } = this.getDifficultyConfig();
    this.gridSize = size;

    // Directions: UP, RIGHT, DOWN, LEFT
    const DIRS = [
      { name: 'up', dr: -1, dc: 0, arrow: '▲' },
      { name: 'right', dr: 0, dc: 1, arrow: '▶' },
      { name: 'down', dr: 1, dc: 0, arrow: '▼' },
      { name: 'left', dr: 0, dc: -1, arrow: '◀' }
    ];

    // Procedural Generation:
    // Carve disjoint segments to form the target pattern and ribbons
    const occupied = Array(size).fill(false).map(() => Array(size).fill(false));
    const ribbons = [];

    let attempts = 0;
    while (ribbons.length < ribbonCount && attempts < 150) {
      attempts++;
      const r = prng.randInt(0, size - 1);
      const c = prng.randInt(0, size - 1);
      if (occupied[r][c]) continue;

      const dir = prng.choice(DIRS);
      const len = prng.randInt(2, 4);

      // Check if straight segment of length 'len' starting at (r, c) fits and doesn't overlap
      let fits = true;
      const cells = [];
      for (let step = 0; step < len; step++) {
        const cr = r + dir.dr * step;
        const cc = c + dir.dc * step;
        if (cr < 0 || cr >= size || cc < 0 || cc >= size || occupied[cr][cc]) {
          fits = false;
          break;
        }
        cells.push({ r: cr, c: cc });
      }

      if (fits) {
        cells.forEach(cell => {
          occupied[cell.r][cell.c] = true;
          this.targetCells.add(`${cell.r},${cell.c}`);
        });

        const color = FOLD_PALETTE[ribbons.length % FOLD_PALETTE.length];
        ribbons.push({
          id: ribbons.length,
          originR: r,
          originC: c,
          dir,
          len,
          color,
          isUnrolled: false,
          coveredCells: []
        });
      }
    }

    this.ribbons = ribbons;
    this.render();
  }

  render() {
    this.boardEl.innerHTML = '';
    this.boardEl.style.setProperty('--fold-size', this.gridSize);

    this.cellElements = Array(this.gridSize).fill(null).map(() => Array(this.gridSize).fill(null));

    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const cell = document.createElement('div');
        cell.className = 'fold-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;

        const isTarget = this.targetCells.has(`${r},${c}`);
        if (isTarget) {
          cell.classList.add('is-target');
        }

        this.boardEl.appendChild(cell);
        this.cellElements[r][c] = cell;
      }
    }

    this.updateRibbonVisuals();
  }

  updateRibbonVisuals() {
    // Clear all ribbon elements from cells
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        this.cellElements[r][c].innerHTML = '';
        this.cellElements[r][c].className = 'fold-cell';
        if (this.targetCells.has(`${r},${c}`)) {
          this.cellElements[r][c].classList.add('is-target');
        }
      }
    }

    // Render folded and unfolded ribbons
    for (let ribbon of this.ribbons) {
      if (!ribbon.isUnrolled) {
        // Render origin block with arrow and length badge
        const cell = this.cellElements[ribbon.originR][ribbon.originC];
        const block = document.createElement('button');
        block.className = 'fold-origin-block';
        block.style.backgroundColor = ribbon.color;
        block.innerHTML = `
          <span class="fold-arrow">${ribbon.dir.arrow}</span>
          <span class="fold-len">${ribbon.len}</span>
        `;
        block.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleUnroll(ribbon);
        });
        cell.appendChild(block);
      } else {
        // Render unfolded ribbon covering its cells
        for (let idx = 0; idx < ribbon.coveredCells.length; idx++) {
          const pt = ribbon.coveredCells[idx];
          const cell = this.cellElements[pt.r][pt.c];
          cell.classList.add('is-covered');

          const seg = document.createElement('div');
          seg.className = `fold-segment ${idx === 0 ? 'is-head' : ''}`;
          seg.style.backgroundColor = ribbon.color;

          if (idx === 0) {
            seg.innerHTML = `<span class="fold-arrow">↺</span>`;
          }

          seg.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleRollback(ribbon);
          });
          cell.appendChild(seg);
        }
      }
    }
  }

  handleUnroll(ribbon) {
    if (this.solved || ribbon.isUnrolled) return;

    // Check if path is free
    const cellsToCover = [];
    let blocked = false;

    for (let step = 0; step < ribbon.len; step++) {
      const cr = ribbon.originR + ribbon.dir.dr * step;
      const cc = ribbon.originC + ribbon.dir.dc * step;

      // Must be target
      if (!this.targetCells.has(`${cr},${cc}`)) {
        blocked = true;
        break;
      }

      // Must not be currently covered by another ribbon
      const isAlreadyCovered = this.ribbons.some(other =>
        other.isUnrolled && other.coveredCells.some(pt => pt.r === cr && pt.c === cc)
      );

      // Must not overlap another ribbon's folded origin block (unless it's its own origin)
      const hasOtherOrigin = this.ribbons.some(other =>
        !other.isUnrolled && other.id !== ribbon.id && other.originR === cr && other.originC === cc
      );

      if (isAlreadyCovered || hasOtherOrigin) {
        blocked = true;
        break;
      }

      cellsToCover.push({ r: cr, c: cc });
    }

    if (blocked) {
      sound.playError();
      haptics.error();
      const originCell = this.cellElements[ribbon.originR][ribbon.originC];
      originCell.classList.add('shake');
      setTimeout(() => originCell.classList.remove('shake'), 300);
      return;
    }

    // Success unroll
    this.undoStack.push({ action: 'unroll', ribbonId: ribbon.id });
    ribbon.isUnrolled = true;
    ribbon.coveredCells = cellsToCover;
    this.moves++;
    this.onMove(this.moves);
    sound.playSlide();
    haptics.slide();

    this.updateRibbonVisuals();
    this.checkWinCondition();
  }

  handleRollback(ribbon) {
    if (this.solved || !ribbon.isUnrolled) return;

    this.undoStack.push({ action: 'rollback', ribbonId: ribbon.id, cells: ribbon.coveredCells });
    ribbon.isUnrolled = false;
    ribbon.coveredCells = [];
    this.moves++;
    this.onMove(this.moves);
    sound.playTap();
    haptics.tap();

    this.updateRibbonVisuals();
  }

  checkWinCondition() {
    const allUnrolled = this.ribbons.every(r => r.isUnrolled);
    if (allUnrolled && !this.solved) {
      this.solved = true;
      sound.playVictory();
      haptics.victory();
      this.onWin({ moves: this.moves });
    }
  }

  undo() {
    if (this.undoStack.length === 0 || this.solved) return false;
    const last = this.undoStack.pop();
    const ribbon = this.ribbons.find(r => r.id === last.ribbonId);
    if (!ribbon) return false;

    if (last.action === 'unroll') {
      ribbon.isUnrolled = false;
      ribbon.coveredCells = [];
    } else if (last.action === 'rollback') {
      ribbon.isUnrolled = true;
      ribbon.coveredCells = last.cells;
    }

    this.moves++;
    this.onMove(this.moves);
    this.updateRibbonVisuals();
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
