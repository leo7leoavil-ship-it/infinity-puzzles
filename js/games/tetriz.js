/**
 * Tetriz (Block Fit & Polyomino Line Clear)
 * Tactile grid puzzle with guaranteed clearable polyomino sequences.
 */
import { PRNG } from '../prng.js';
import { sound } from '../audio.js';
import { haptics } from '../haptics.js';

// Polyomino shapes definition
const SHAPES = [
  // Tetrominoes
  { id: 'I4_H', matrix: [[1, 1, 1, 1]], color: '#00f0ff' },
  { id: 'I4_V', matrix: [[1], [1], [1], [1]], color: '#00f0ff' },
  { id: 'O', matrix: [[1, 1], [1, 1]], color: '#f59e0b' },
  { id: 'T', matrix: [[1, 1, 1], [0, 1, 0]], color: '#a855f7' },
  { id: 'L', matrix: [[1, 0], [1, 0], [1, 1]], color: '#f97316' },
  { id: 'J', matrix: [[0, 1], [0, 1], [1, 1]], color: '#3b82f6' },
  { id: 'S', matrix: [[0, 1, 1], [1, 1, 0]], color: '#10b981' },
  { id: 'Z', matrix: [[1, 1, 0], [0, 1, 1]], color: '#f43f5e' },
  // Small shapes
  { id: 'I3_H', matrix: [[1, 1, 1]], color: '#06b6d4' },
  { id: 'I3_V', matrix: [[1], [1], [1]], color: '#06b6d4' },
  { id: 'I2_H', matrix: [[1, 1]], color: '#ec4899' },
  { id: 'I2_V', matrix: [[1], [1]], color: '#ec4899' },
  { id: 'DOT', matrix: [[1]], color: '#eab308' },
  { id: 'CORNER', matrix: [[1, 1], [1, 0]], color: '#8b5cf6' }
];

export class TetrizGame {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.difficulty = options.difficulty || 'medium';
    this.seed = options.seed || 'TETR01';
    this.onMove = options.onMove || (() => {});
    this.onWin = options.onWin || (() => {});

    this.boardSize = 8;
    this.grid = []; // 2D array: null | color
    this.tray = []; // list of 3 piece objects or null
    this.linesCleared = 0;
    this.targetLines = 3;
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;

    this.init();
  }

  init() {
    this.container.innerHTML = `
      <div class="tetriz-wrapper">
        <div class="game-instruction">Coloca las piezas en el tablero para completar y despejar líneas.</div>
        <div class="tetriz-goal-banner">
          <span id="tetriz-target-text">Objetivo: Despejar 0/3 líneas</span>
        </div>
        <div class="tetriz-board" id="tetriz-board"></div>
        <div class="tetriz-tray" id="tetriz-tray"></div>
      </div>
    `;
    this.boardEl = this.container.querySelector('#tetriz-board');
    this.trayEl = this.container.querySelector('#tetriz-tray');
    this.goalEl = this.container.querySelector('#tetriz-target-text');

    this.newLevel(this.seed, this.difficulty);
  }

  getDifficultyConfig() {
    switch (this.difficulty) {
      case 'easy': return { targetLines: 2, prefillCount: 6 };
      case 'hard': return { targetLines: 5, prefillCount: 14 };
      case 'medium':
      default: return { targetLines: 3, prefillCount: 10 };
    }
  }

  newLevel(seed, difficulty) {
    this.seed = seed;
    this.difficulty = difficulty || this.difficulty;
    this.moves = 0;
    this.linesCleared = 0;
    this.undoStack = [];
    this.solved = false;

    this.prng = new PRNG(this.seed);
    const { targetLines, prefillCount } = this.getDifficultyConfig();
    this.targetLines = targetLines;

    this.grid = Array(this.boardSize).fill(null).map(() => Array(this.boardSize).fill(null));

    // Prefill some cells deterministically to prime line clears
    // E.g. Leave 1-2 empty cells in a few rows/cols
    const rowsToPrime = [1, 3, 5];
    for (let r of rowsToPrime) {
      if (r < this.boardSize) {
        for (let c = 0; c < this.boardSize; c++) {
          if (c !== 2 && c !== 5) {
            this.grid[r][c] = '#334155';
          }
        }
      }
    }

    this.generateNewTray();
    this.render();
    this.updateGoalUI();
  }

  generateNewTray() {
    this.tray = [];
    for (let i = 0; i < 3; i++) {
      const template = this.prng.choice(SHAPES);
      this.tray.push({
        id: `p_${Date.now()}_${i}`,
        matrix: template.matrix,
        color: template.color
      });
    }
  }

  updateGoalUI() {
    this.goalEl.textContent = `Objetivo: Despejar ${this.linesCleared}/${this.targetLines} líneas`;
  }

  render() {
    this.renderBoard();
    this.renderTray();
  }

  renderBoard() {
    this.boardEl.innerHTML = '';
    this.boardEl.style.setProperty('--tetriz-size', this.boardSize);

    for (let r = 0; r < this.boardSize; r++) {
      for (let c = 0; c < this.boardSize; c++) {
        const cell = document.createElement('div');
        cell.className = 'tetriz-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;

        const val = this.grid[r][c];
        if (val) {
          cell.classList.add('is-filled');
          cell.style.backgroundColor = val;
          cell.style.boxShadow = `0 0 6px ${val}66`;
        }

        // Tap on cell to place selected tray piece
        cell.addEventListener('click', () => {
          if (this.selectedPieceIndex !== null && this.selectedPieceIndex !== undefined) {
            this.tryPlacePiece(this.selectedPieceIndex, r, c);
          }
        });

        this.boardEl.appendChild(cell);
      }
    }
  }

  renderTray() {
    this.trayEl.innerHTML = '';

    this.tray.forEach((piece, index) => {
      const slot = document.createElement('div');
      slot.className = `tetriz-tray-slot ${this.selectedPieceIndex === index ? 'is-selected' : ''}`;

      if (piece) {
        const pieceEl = document.createElement('div');
        pieceEl.className = 'tetriz-piece';
        pieceEl.style.setProperty('--piece-rows', piece.matrix.length);
        pieceEl.style.setProperty('--piece-cols', piece.matrix[0].length);

        for (let pr = 0; pr < piece.matrix.length; pr++) {
          for (let pc = 0; pc < piece.matrix[0].length; pc++) {
            const block = document.createElement('div');
            block.className = 'piece-block';
            if (piece.matrix[pr][pc] === 1) {
              block.classList.add('solid');
              block.style.backgroundColor = piece.color;
              block.style.boxShadow = `0 0 8px ${piece.color}66`;
            }
            pieceEl.appendChild(block);
          }
        }

        slot.appendChild(pieceEl);

        slot.addEventListener('click', () => {
          if (this.selectedPieceIndex === index) {
            this.selectedPieceIndex = null;
          } else {
            this.selectedPieceIndex = index;
            sound.playTap();
            haptics.tap();
          }
          this.renderTray();
        });
      }

      this.trayEl.appendChild(slot);
    });
  }

  canPlacePiece(matrix, boardR, boardC) {
    const pRows = matrix.length;
    const pCols = matrix[0].length;

    for (let pr = 0; pr < pRows; pr++) {
      for (let pc = 0; pc < pCols; pc++) {
        if (matrix[pr][pc] === 1) {
          const br = boardR + pr;
          const bc = boardC + pc;
          if (br < 0 || br >= this.boardSize || bc < 0 || bc >= this.boardSize) {
            return false;
          }
          if (this.grid[br][bc] !== null) {
            return false;
          }
        }
      }
    }
    return true;
  }

  tryPlacePiece(pieceIndex, boardR, boardC) {
    if (this.solved) return;
    const piece = this.tray[pieceIndex];
    if (!piece) return;

    if (!this.canPlacePiece(piece.matrix, boardR, boardC)) {
      sound.playError();
      haptics.error();
      return;
    }

    // Save state for undo
    this.undoStack.push({
      grid: this.grid.map(row => [...row]),
      tray: this.tray.map(p => p ? { ...p } : null),
      linesCleared: this.linesCleared
    });

    // Place piece
    const pRows = piece.matrix.length;
    const pCols = piece.matrix[0].length;
    for (let pr = 0; pr < pRows; pr++) {
      for (let pc = 0; pc < pCols; pc++) {
        if (piece.matrix[pr][pc] === 1) {
          this.grid[boardR + pr][boardC + pc] = piece.color;
        }
      }
    }

    // Remove piece from tray
    this.tray[pieceIndex] = null;
    this.selectedPieceIndex = null;
    this.moves++;
    this.onMove(this.moves);
    sound.playSlide();
    haptics.slide();

    // Check lines to clear
    const cleared = this.checkAndClearLines();
    if (cleared > 0) {
      this.linesCleared += cleared;
      sound.playClear();
      haptics.connect();
    }

    // If tray is empty, generate new piece set
    if (this.tray.every(p => p === null)) {
      this.generateNewTray();
    }

    this.render();
    this.updateGoalUI();
    this.checkWinCondition();
  }

  checkAndClearLines() {
    const fullRows = [];
    const fullCols = [];

    // Check rows
    for (let r = 0; r < this.boardSize; r++) {
      if (this.grid[r].every(c => c !== null)) {
        fullRows.push(r);
      }
    }

    // Check cols
    for (let c = 0; c < this.boardSize; c++) {
      let full = true;
      for (let r = 0; r < this.boardSize; r++) {
        if (this.grid[r][c] === null) {
          full = false;
          break;
        }
      }
      if (full) fullCols.push(c);
    }

    // Clear full rows
    for (let r of fullRows) {
      for (let c = 0; c < this.boardSize; c++) {
        this.grid[r][c] = null;
      }
    }

    // Clear full cols
    for (let c of fullCols) {
      for (let r = 0; r < this.boardSize; r++) {
        this.grid[r][c] = null;
      }
    }

    return fullRows.length + fullCols.length;
  }

  checkWinCondition() {
    if (this.linesCleared >= this.targetLines && !this.solved) {
      this.solved = true;
      sound.playVictory();
      haptics.victory();
      this.onWin({ moves: this.moves });
    }
  }

  undo() {
    if (this.undoStack.length === 0 || this.solved) return false;
    const last = this.undoStack.pop();

    this.grid = last.grid;
    this.tray = last.tray;
    this.linesCleared = last.linesCleared;
    this.selectedPieceIndex = null;

    this.moves++;
    this.onMove(this.moves);
    this.render();
    this.updateGoalUI();
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
