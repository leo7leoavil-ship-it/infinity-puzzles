/**
 * Tap Away (Flechas Desenredables)
 * Inverted procedural generation with guaranteed solvability.
 */
import { PRNG } from '../prng.js';
import { sound } from '../audio.js';
import { haptics } from '../haptics.js';

export class TapAwayGame {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.difficulty = options.difficulty || 'medium';
    this.seed = options.seed || 'TAP001';
    this.onMove = options.onMove || (() => {});
    this.onWin = options.onWin || (() => {});
    
    this.grid = []; // 2D array: null or { id, r, c, dir, el }
    this.moves = 0;
    this.undoStack = [];
    this.isAnimating = false;
    this.solved = false;

    this.init();
  }

  init() {
    this.container.innerHTML = `
      <div class="tapaway-wrapper">
        <div class="game-instruction">Toca los bloques cuyas flechas tengan el camino libre hacia el exterior.</div>
        <div class="tapaway-board" id="tapaway-board"></div>
      </div>
    `;
    this.boardEl = this.container.querySelector('#tapaway-board');
    this.newLevel(this.seed, this.difficulty);
  }

  getDifficultyConfig() {
    switch (this.difficulty) {
      case 'easy': return { size: 4, blockCount: 10 };
      case 'hard': return { size: 6, blockCount: 24 };
      case 'medium':
      default: return { size: 5, blockCount: 16 };
    }
  }

  newLevel(seed, difficulty) {
    this.seed = seed;
    this.difficulty = difficulty || this.difficulty;
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;
    this.isAnimating = false;

    const prng = new PRNG(this.seed);
    const { size, blockCount } = this.getDifficultyConfig();
    this.size = size;

    // Directions: UP, RIGHT, DOWN, LEFT
    const DIRS = [
      { name: 'up', dr: -1, dc: 0, arrow: '↑' },
      { name: 'right', dr: 0, dc: 1, arrow: '→' },
      { name: 'down', dr: 1, dc: 0, arrow: '↓' },
      { name: 'left', dr: 0, dc: -1, arrow: '←' }
    ];

    // Initialize empty grid
    this.grid = Array(size).fill(null).map(() => Array(size).fill(null));
    const placedBlocks = [];

    // Inverted procedural placement:
    // Place blocks sequentially such that at the moment of placement,
    // the ray from (r, c) along direction D to the boundary is completely clear!
    for (let i = 0; i < blockCount * 2 && placedBlocks.length < blockCount; i++) {
      const candidates = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (this.grid[r][c] !== null) continue;
          
          // Check which directions are unobstructed to the boundary
          for (let d of DIRS) {
            let clear = true;
            let currR = r + d.dr;
            let currC = c + d.dc;
            while (currR >= 0 && currR < size && currC >= 0 && currC < size) {
              if (this.grid[currR][currC] !== null) {
                clear = false;
                break;
              }
              currR += d.dr;
              currC += d.dc;
            }
            if (clear) {
              candidates.push({ r, c, dir: d });
            }
          }
        }
      }

      if (candidates.length === 0) break;
      const pick = prng.choice(candidates);
      const block = {
        id: placedBlocks.length + 1,
        r: pick.r,
        c: pick.c,
        dir: pick.dir
      };
      this.grid[pick.r][pick.c] = block;
      placedBlocks.push(block);
    }

    this.render();
  }

  render() {
    this.boardEl.innerHTML = '';
    this.boardEl.style.setProperty('--grid-size', this.size);

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const slot = document.createElement('div');
        slot.className = 'tapaway-slot';
        slot.dataset.r = r;
        slot.dataset.c = c;

        const block = this.grid[r][c];
        if (block) {
          const blockEl = document.createElement('button');
          blockEl.className = `tapaway-block dir-${block.dir.name}`;
          blockEl.setAttribute('aria-label', `Bloque hacia ${block.dir.name}`);
          blockEl.innerHTML = `<span class="arrow-icon">${block.dir.arrow}</span>`;
          blockEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleTap(block, blockEl);
          });
          slot.appendChild(blockEl);
          block.el = blockEl;
        }
        this.boardEl.appendChild(slot);
      }
    }
  }

  isPathClear(block) {
    const { dr, dc } = block.dir;
    let currR = block.r + dr;
    let currC = block.c + dc;
    while (currR >= 0 && currR < this.size && currC >= 0 && currC < this.size) {
      if (this.grid[currR][currC] !== null) {
        return false;
      }
      currR += dr;
      currC += dc;
    }
    return true;
  }

  handleTap(block, blockEl) {
    if (this.solved || this.isAnimating) return;
    if (this.grid[block.r][block.c] !== block) return;

    if (this.isPathClear(block)) {
      // Free path! Block flies off screen
      this.isAnimating = true;
      this.moves++;
      this.onMove(this.moves);
      sound.playSlide();
      haptics.slide();

      const { dr, dc } = block.dir;
      const flyDistance = 120; // percent offset
      const tx = dc * flyDistance;
      const ty = dr * flyDistance;

      blockEl.style.transform = `translate(${tx}vw, ${ty}vh) scale(0.6)`;
      blockEl.style.opacity = '0';
      blockEl.style.pointerEvents = 'none';

      this.undoStack.push({
        action: 'remove',
        block: block,
        r: block.r,
        c: block.c
      });

      this.grid[block.r][block.c] = null;

      setTimeout(() => {
        if (blockEl.parentNode) {
          blockEl.parentNode.removeChild(blockEl);
        }
        this.isAnimating = false;
        this.checkWinCondition();
      }, 260);

    } else {
      // Blocked! Shake animation
      sound.playError();
      haptics.error();
      blockEl.classList.add('shake');
      setTimeout(() => blockEl.classList.remove('shake'), 300);
    }
  }

  checkWinCondition() {
    let remaining = 0;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c] !== null) remaining++;
      }
    }

    if (remaining === 0 && !this.solved) {
      this.solved = true;
      sound.playVictory();
      haptics.victory();
      this.onWin({ moves: this.moves });
    }
  }

  undo() {
    if (this.undoStack.length === 0 || this.isAnimating || this.solved) return false;
    const last = this.undoStack.pop();
    if (last.action === 'remove') {
      this.grid[last.r][last.c] = last.block;
      this.moves++;
      this.onMove(this.moves);
      this.render();
      sound.playTap();
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
