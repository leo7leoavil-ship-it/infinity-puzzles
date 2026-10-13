/**
 * Sliding Tile (15-Puzzle de Ilustración o Gradiente)
 * Solvability-guaranteed scrambler from solved gradient state.
 */
import { PRNG } from '../prng.js';
import { sound } from '../audio.js';
import { haptics } from '../haptics.js';

export class SlidingTileGame {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.difficulty = options.difficulty || 'medium';
    this.seed = options.seed || 'SLIDE1';
    this.onMove = options.onMove || (() => {});
    this.onWin = options.onWin || (() => {});

    this.showNumbers = true;
    this.grid = []; // 2D array of tile IDs (0 is empty, 1..N^2-1 are tiles)
    this.emptyPos = { r: 0, c: 0 };
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;

    this.init();
  }

  init() {
    this.container.innerHTML = `
      <div class="sliding-tile-wrapper">
        <div class="game-instruction">
          Ordena los bloques para formar un gradiente continuo de color.
          <button id="toggle-numbers-btn" class="mini-toggle-btn">123 Números</button>
        </div>
        <div class="sliding-tile-board" id="sliding-tile-board"></div>
      </div>
    `;
    this.boardEl = this.container.querySelector('#sliding-tile-board');
    this.toggleBtn = this.container.querySelector('#toggle-numbers-btn');
    this.toggleBtn.addEventListener('click', () => {
      this.showNumbers = !this.showNumbers;
      this.toggleBtn.classList.toggle('active', this.showNumbers);
      this.render();
    });

    this.newLevel(this.seed, this.difficulty);
  }

  getDifficultyConfig() {
    switch (this.difficulty) {
      case 'easy': return { size: 3, scrambles: 35 };
      case 'hard': return { size: 5, scrambles: 120 };
      case 'medium':
      default: return { size: 4, scrambles: 70 };
    }
  }

  newLevel(seed, difficulty) {
    this.seed = seed;
    this.difficulty = difficulty || this.difficulty;
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;

    const prng = new PRNG(this.seed);
    const { size, scrambles } = this.getDifficultyConfig();
    this.size = size;

    // Build solved state: 1 to size*size - 1, and 0 at the end
    this.grid = [];
    let id = 1;
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        if (r === size - 1 && c === size - 1) {
          row.push(0); // Empty slot
          this.emptyPos = { r, c };
        } else {
          row.push(id++);
        }
      }
      this.grid.push(row);
    }

    // Scramble by making K legal moves from solved state
    // This strictly preserves parity and guarantees 100% solvability
    const DIRS = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 }
    ];

    let lastMoveDir = null;
    for (let step = 0; step < scrambles; step++) {
      const validDirs = DIRS.filter(d => {
        const nr = this.emptyPos.r + d.dr;
        const nc = this.emptyPos.c + d.dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) return false;
        // Avoid immediately undoing previous move
        if (lastMoveDir && d.dr === -lastMoveDir.dr && d.dc === -lastMoveDir.dc) return false;
        return true;
      });

      const chosenDir = validDirs.length > 0 ? prng.choice(validDirs) : prng.choice(DIRS.filter(d => {
        const nr = this.emptyPos.r + d.dr;
        const nc = this.emptyPos.c + d.dc;
        return nr >= 0 && nr < size && nc >= 0 && nc < size;
      }));

      const tileR = this.emptyPos.r + chosenDir.dr;
      const tileC = this.emptyPos.c + chosenDir.dc;

      // Swap empty slot with tile
      this.grid[this.emptyPos.r][this.emptyPos.c] = this.grid[tileR][tileC];
      this.grid[tileR][tileC] = 0;
      this.emptyPos = { r: tileR, c: tileC };
      lastMoveDir = chosenDir;
    }

    this.render();
  }

  getTileColor(tileId) {
    if (tileId === 0) return 'transparent';
    const totalTiles = this.size * this.size;
    // Calculate solved row and col for this tileId
    const solvedR = Math.floor((tileId - 1) / this.size);
    const solvedC = (tileId - 1) % this.size;

    // Compute 2D smooth hue & lightness
    // Interpolate from deep violet hue (280) to cyan (185) to emerald (150)
    const ratioX = solvedC / (this.size - 1);
    const ratioY = solvedR / (this.size - 1);

    const hue = Math.round(270 - ratioX * 90 - ratioY * 50);
    const lightness = Math.round(38 + ratioY * 18 + ratioX * 8);

    return `hsl(${hue}, 85%, ${lightness}%)`;
  }

  render() {
    this.boardEl.innerHTML = '';
    this.boardEl.style.setProperty('--tile-size', this.size);

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const tileId = this.grid[r][c];
        const slot = document.createElement('div');
        slot.className = 'st-slot';

        if (tileId !== 0) {
          const tile = document.createElement('button');
          tile.className = 'st-tile';
          tile.style.backgroundColor = this.getTileColor(tileId);
          tile.setAttribute('aria-label', `Ficha ${tileId}`);

          if (this.showNumbers) {
            tile.innerHTML = `<span class="st-num">${tileId}</span>`;
          }

          tile.addEventListener('click', () => this.handleTileClick(r, c));
          slot.appendChild(tile);
        } else {
          slot.classList.add('is-empty');
        }

        this.boardEl.appendChild(slot);
      }
    }
  }

  handleTileClick(r, c) {
    if (this.solved) return;
    const tileId = this.grid[r][c];
    if (tileId === 0) return;

    // Check if adjacent to empty slot
    const dr = Math.abs(r - this.emptyPos.r);
    const dc = Math.abs(c - this.emptyPos.c);

    if (dr + dc === 1) {
      // Valid slide
      this.undoStack.push({
        fromR: r,
        fromC: c,
        toR: this.emptyPos.r,
        toC: this.emptyPos.c,
        tileId
      });

      this.grid[this.emptyPos.r][this.emptyPos.c] = tileId;
      this.grid[r][c] = 0;
      this.emptyPos = { r, c };

      this.moves++;
      this.onMove(this.moves);
      sound.playSlide();
      haptics.slide();

      this.render();
      this.checkWinCondition();
    } else {
      sound.playError();
      haptics.error();
    }
  }

  checkWinCondition() {
    let expected = 1;
    let isCorrect = true;

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (r === this.size - 1 && c === this.size - 1) {
          if (this.grid[r][c] !== 0) isCorrect = false;
        } else {
          if (this.grid[r][c] !== expected++) {
            isCorrect = false;
            break;
          }
        }
      }
      if (!isCorrect) break;
    }

    if (isCorrect && !this.solved) {
      this.solved = true;
      sound.playVictory();
      haptics.victory();
      this.onWin({ moves: this.moves });
    }
  }

  undo() {
    if (this.undoStack.length === 0 || this.solved) return false;
    const last = this.undoStack.pop();

    this.grid[last.fromR][last.fromC] = last.tileId;
    this.grid[last.toR][last.toC] = 0;
    this.emptyPos = { r: last.toR, c: last.toC };

    this.moves++;
    this.onMove(this.moves);
    this.render();
    sound.playSlide();
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
