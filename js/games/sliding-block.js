/**
 * Sliding Block / Klotski (Escape de Bloques)
 * Axis-constrained sliding puzzle with touch drag controls and reverse scrambler.
 */
import { PRNG } from '../prng.js';
import { sound } from '../audio.js';
import { haptics } from '../haptics.js';

export class SlidingBlockGame {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.difficulty = options.difficulty || 'medium';
    this.seed = options.seed || 'KLOT01';
    this.onMove = options.onMove || (() => {});
    this.onWin = options.onWin || (() => {});

    this.boardSize = 6;
    this.exitRow = 2;
    this.blocks = [];
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;

    this.init();
  }

  init() {
    this.container.innerHTML = `
      <div class="klotski-wrapper">
        <div class="game-instruction">Desliza los bloques para despejar el camino del bloque rojo hacia la salida lateral.</div>
        <div class="klotski-board-container">
          <div class="klotski-board" id="klotski-board"></div>
          <div class="klotski-exit-marker" style="top: calc(100% / 6 * 2); height: calc(100% / 6);">EXIT ❯</div>
        </div>
      </div>
    `;
    this.boardEl = this.container.querySelector('#klotski-board');
    this.newLevel(this.seed, this.difficulty);
  }

  getDifficultyConfig() {
    switch (this.difficulty) {
      case 'easy': return { scrambles: 25, blockCount: 7 };
      case 'hard': return { scrambles: 80, blockCount: 11 };
      case 'medium':
      default: return { scrambles: 45, blockCount: 9 };
    }
  }

  newLevel(seed, difficulty) {
    this.seed = seed;
    this.difficulty = difficulty || this.difficulty;
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;

    const prng = new PRNG(this.seed);
    const { scrambles, blockCount } = this.getDifficultyConfig();

    // Generate puzzle:
    // Red block is horizontal, length 2, on exitRow (row 2).
    // Start with red block at exit (r: 2, c: 4, len: 2, isHorizontal: true, isTarget: true)
    let blocks = [
      { id: 'target', r: this.exitRow, c: 4, len: 2, isHorizontal: true, isTarget: true }
    ];

    // Place random obstacle blocks without overlapping
    const grid = Array(6).fill(null).map(() => Array(6).fill(null));
    grid[2][4] = 'target';
    grid[2][5] = 'target';

    const candidates = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        // Horizontal 2
        if (c + 1 < 6) candidates.push({ r, c, len: 2, isHorizontal: true });
        // Vertical 2
        if (r + 1 < 6) candidates.push({ r, c, len: 2, isHorizontal: false });
        // Vertical 3 (only a few)
        if (r + 2 < 6) candidates.push({ r, c, len: 3, isHorizontal: false });
      }
    }
    prng.shuffle(candidates);

    let nextId = 1;
    for (let cand of candidates) {
      if (blocks.length >= blockCount) break;
      let fits = true;
      for (let i = 0; i < cand.len; i++) {
        const checkR = cand.isHorizontal ? cand.r : cand.r + i;
        const checkC = cand.isHorizontal ? cand.c + i : cand.c;
        if (grid[checkR][checkC] !== null) {
          fits = false;
          break;
        }
      }
      if (fits) {
        const blk = {
          id: `b${nextId++}`,
          r: cand.r,
          c: cand.c,
          len: cand.len,
          isHorizontal: cand.isHorizontal,
          isTarget: false
        };
        blocks.push(blk);
        for (let i = 0; i < cand.len; i++) {
          const br = cand.isHorizontal ? cand.r : cand.r + i;
          const bc = cand.isHorizontal ? cand.c + i : cand.c;
          grid[br][bc] = blk.id;
        }
      }
    }

    // Now scramble backwards by making valid sliding moves!
    // This strictly preserves solvability because every move is a legal slide.
    for (let step = 0; step < scrambles; step++) {
      // Find all possible legal moves for any block
      const legalMoves = [];
      for (let blk of blocks) {
        const directions = blk.isHorizontal ? [-1, 1] : [-1, 1];
        for (let delta of directions) {
          if (this.canMoveBlock(blk, delta, blocks)) {
            legalMoves.push({ blk, delta });
          }
        }
      }

      if (legalMoves.length === 0) break;
      const move = prng.choice(legalMoves);
      if (move.blk.isHorizontal) {
        move.blk.c += move.delta;
      } else {
        move.blk.r += move.delta;
      }
    }

    // Ensure target block is not already at the exit
    const targetBlk = blocks.find(b => b.isTarget);
    if (targetBlk.c >= 4) {
      // Try to push it back if possible
      while (targetBlk.c > 0 && this.canMoveBlock(targetBlk, -1, blocks)) {
        targetBlk.c -= 1;
      }
    }

    this.blocks = blocks;
    this.render();
  }

  isOccupied(r, c, ignoreBlkId, blocks) {
    if (r < 0 || r >= 6 || c < 0 || c >= 6) return true;
    for (let b of blocks) {
      if (b.id === ignoreBlkId) continue;
      for (let i = 0; i < b.len; i++) {
        const br = b.isHorizontal ? b.r : b.r + i;
        const bc = b.isHorizontal ? b.c + i : b.c;
        if (br === r && bc === c) return true;
      }
    }
    return false;
  }

  canMoveBlock(blk, delta, blocks) {
    if (blk.isHorizontal) {
      const targetC = delta > 0 ? blk.c + blk.len : blk.c - 1;
      return !this.isOccupied(blk.r, targetC, blk.id, blocks);
    } else {
      const targetR = delta > 0 ? blk.r + blk.len : blk.r - 1;
      return !this.isOccupied(targetR, blk.c, blk.id, blocks);
    }
  }

  render() {
    this.boardEl.innerHTML = '';

    for (let blk of this.blocks) {
      const el = document.createElement('div');
      el.className = `klotski-block ${blk.isTarget ? 'is-target' : ''} ${blk.isHorizontal ? 'horizontal' : 'vertical'}`;
      el.dataset.id = blk.id;

      this.updateBlockPosition(el, blk);
      this.attachDragListeners(el, blk);

      this.boardEl.appendChild(el);
      blk.el = el;
    }
  }

  updateBlockPosition(el, blk) {
    const cellSize = 100 / 6;
    el.style.left = `${blk.c * cellSize}%`;
    el.style.top = `${blk.r * cellSize}%`;
    el.style.width = blk.isHorizontal ? `${blk.len * cellSize}%` : `${cellSize}%`;
    el.style.height = blk.isHorizontal ? `${cellSize}%` : `${blk.len * cellSize}%`;
  }

  attachDragListeners(el, blk) {
    let startX = 0;
    let startY = 0;
    let initialR = 0;
    let initialC = 0;
    let isDragging = false;

    const onPointerDown = (e) => {
      if (this.solved) return;
      isDragging = true;
      el.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      initialR = blk.r;
      initialC = blk.c;
      el.classList.add('dragging');
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const rect = this.boardEl.getBoundingClientRect();
      const cellPx = rect.width / 6;

      if (blk.isHorizontal) {
        const dx = e.clientX - startX;
        let deltaUnits = Math.round(dx / cellPx);
        // Test step by step
        let finalC = initialC;
        if (deltaUnits > 0) {
          for (let step = 1; step <= deltaUnits; step++) {
            if (!this.isOccupied(blk.r, initialC + blk.len + step - 1, blk.id, this.blocks)) {
              finalC = initialC + step;
            } else break;
          }
        } else if (deltaUnits < 0) {
          for (let step = -1; step >= deltaUnits; step--) {
            if (!this.isOccupied(blk.r, initialC + step, blk.id, this.blocks)) {
              finalC = initialC + step;
            } else break;
          }
        }
        blk.c = finalC;
      } else {
        const dy = e.clientY - startY;
        let deltaUnits = Math.round(dy / cellPx);
        let finalR = initialR;
        if (deltaUnits > 0) {
          for (let step = 1; step <= deltaUnits; step++) {
            if (!this.isOccupied(initialR + blk.len + step - 1, blk.c, blk.id, this.blocks)) {
              finalR = initialR + step;
            } else break;
          }
        } else if (deltaUnits < 0) {
          for (let step = -1; step >= deltaUnits; step--) {
            if (!this.isOccupied(initialR + step, blk.c, blk.id, this.blocks)) {
              finalR = initialR + step;
            } else break;
          }
        }
        blk.r = finalR;
      }

      this.updateBlockPosition(el, blk);
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      el.classList.remove('dragging');

      if (blk.r !== initialR || blk.c !== initialC) {
        this.undoStack.push({
          id: blk.id,
          fromR: initialR,
          fromC: initialC,
          toR: blk.r,
          toC: blk.c
        });
        this.moves++;
        this.onMove(this.moves);
        sound.playSlide();
        haptics.slide();

        this.checkWinCondition();
      }
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
  }

  checkWinCondition() {
    const target = this.blocks.find(b => b.isTarget);
    if (target && target.r === this.exitRow && target.c + target.len >= 6 && !this.solved) {
      this.solved = true;
      target.el.style.transform = 'translateX(25%) scale(1.05)';
      sound.playVictory();
      haptics.victory();
      setTimeout(() => {
        this.onWin({ moves: this.moves });
      }, 350);
    }
  }

  undo() {
    if (this.undoStack.length === 0 || this.solved) return false;
    const last = this.undoStack.pop();
    const blk = this.blocks.find(b => b.id === last.id);
    if (blk) {
      blk.r = last.fromR;
      blk.c = last.fromC;
      this.updateBlockPosition(blk.el, blk);
      this.moves++;
      this.onMove(this.moves);
      sound.playSlide();
      haptics.tap();
      return true;
    }
    return false;
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
