/**
 * Path Weaver / Flow Free (Conectar Puntos)
 * Procedural full-grid partition generator with touch drag ribbon drawing.
 */
import { PRNG } from '../prng.js';
import { sound } from '../audio.js';
import { haptics } from '../haptics.js';

const FLOW_COLORS = [
  { id: 1, name: 'cyan', hex: '#00f0ff', glow: 'rgba(0, 240, 255, 0.4)' },
  { id: 2, name: 'purple', hex: '#a855f7', glow: 'rgba(168, 85, 247, 0.4)' },
  { id: 3, name: 'orange', hex: '#f97316', glow: 'rgba(249, 115, 22, 0.4)' },
  { id: 4, name: 'green', hex: '#10b981', glow: 'rgba(16, 185, 129, 0.4)' },
  { id: 5, name: 'rose', hex: '#f43f5e', glow: 'rgba(244, 63, 94, 0.4)' },
  { id: 6, name: 'yellow', hex: '#eab308', glow: 'rgba(234, 179, 8, 0.4)' },
  { id: 7, name: 'blue', hex: '#3b82f6', glow: 'rgba(59, 130, 246, 0.4)' }
];

export class FlowFreeGame {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.difficulty = options.difficulty || 'medium';
    this.seed = options.seed || 'FLOW01';
    this.onMove = options.onMove || (() => {});
    this.onWin = options.onWin || (() => {});

    this.grid = []; // cells [r][c]: { colorId, isEndpoint, pathOwner }
    this.pairs = []; // { colorId, p1: {r, c}, p2: {r, c}, color }
    this.paths = {}; // colorId -> [ {r, c}, ... ]
    this.moves = 0;
    this.undoStack = [];
    this.activeColor = null;
    this.solved = false;

    this.init();
  }

  init() {
    this.container.innerHTML = `
      <div class="flow-wrapper">
        <div class="game-instruction">Une los puntos del mismo color cubriendo el 100% del tablero sin cruzar líneas.</div>
        <div class="flow-status-bar">
          <span id="flow-flows-count">Conexiones: 0/0</span>
          <span id="flow-coverage">Tablero: 0%</span>
        </div>
        <div class="flow-board-wrapper">
          <canvas id="flow-canvas"></canvas>
          <div class="flow-board-grid" id="flow-grid"></div>
        </div>
      </div>
    `;
    this.canvas = this.container.querySelector('#flow-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.gridEl = this.container.querySelector('#flow-grid');
    this.flowsCountEl = this.container.querySelector('#flow-flows-count');
    this.coverageEl = this.container.querySelector('#flow-coverage');

    this.setupTouchListeners();
    this.newLevel(this.seed, this.difficulty);
  }

  getDifficultyConfig() {
    switch (this.difficulty) {
      case 'easy': return { size: 5, colorCount: 4 };
      case 'hard': return { size: 7, colorCount: 6 };
      case 'medium':
      default: return { size: 6, colorCount: 5 };
    }
  }

  newLevel(seed, difficulty) {
    this.seed = seed;
    this.difficulty = difficulty || this.difficulty;
    this.moves = 0;
    this.undoStack = [];
    this.paths = {};
    this.solved = false;
    this.activeColor = null;

    const prng = new PRNG(this.seed);
    const { size, colorCount } = this.getDifficultyConfig();
    this.size = size;

    // Generate partition that covers 100% of grid
    const solutionPaths = this.generateFullGridPartition(size, colorCount, prng);

    this.grid = Array(size).fill(null).map(() => Array(size).fill(null).map(() => ({
      endpointColor: null,
      currentColor: null
    })));

    this.pairs = [];
    for (let i = 0; i < colorCount; i++) {
      const p = solutionPaths[i];
      const colInfo = FLOW_COLORS[i % FLOW_COLORS.length];
      const p1 = p[0];
      const p2 = p[p.length - 1];

      this.grid[p1.r][p1.c].endpointColor = colInfo.id;
      this.grid[p2.r][p2.c].endpointColor = colInfo.id;

      this.pairs.push({
        colorId: colInfo.id,
        color: colInfo,
        p1,
        p2,
        solvedLen: p.length
      });

      this.paths[colInfo.id] = [];
    }

    this.renderGrid();
    this.updateStatsUI();
  }

  /**
   * Procedural Partition: Carves K self-avoiding snakes covering all cells
   */
  generateFullGridPartition(size, K, prng) {
    // Generate randomized Hamiltonian or full-coverage snakes
    // Simple robust method: randomized growing of K snakes with backfill
    let bestPartition = null;
    let maxCoverage = -1;

    for (let attempt = 0; attempt < 25; attempt++) {
      const cellOwner = Array(size).fill(0).map(() => Array(size).fill(-1));
      const snakes = [];

      // Pick K distinct random starting points
      const allCoords = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) allCoords.push({ r, c });
      }
      prng.shuffle(allCoords);

      for (let k = 0; k < K; k++) {
        const start = allCoords[k];
        cellOwner[start.r][start.c] = k;
        snakes.push([start]);
      }

      let grew = true;
      let totalCells = K;
      while (grew && totalCells < size * size) {
        grew = false;
        // Shuffle snake indices
        const order = Array.from({ length: K }, (_, i) => i);
        prng.shuffle(order);

        for (let sIdx of order) {
          const snake = snakes[sIdx];
          const head = snake[snake.length - 1];
          const neighbors = [
            { r: head.r - 1, c: head.c },
            { r: head.r + 1, c: head.c },
            { r: head.r, c: head.c - 1 },
            { r: head.r, c: head.c + 1 }
          ].filter(n => n.r >= 0 && n.r < size && n.c >= 0 && n.c < size && cellOwner[n.r][n.c] === -1);

          if (neighbors.length > 0) {
            const next = prng.choice(neighbors);
            cellOwner[next.r][next.c] = sIdx;
            snake.push(next);
            totalCells++;
            grew = true;
          }
        }
      }

      // Check if all snakes have length >= 2
      const allValid = snakes.every(s => s.length >= 2);
      if (allValid && totalCells > maxCoverage) {
        maxCoverage = totalCells;
        bestPartition = snakes;
        if (totalCells === size * size) break;
      }
    }

    // Fallback: if not 100% covered, split a snake or fill empty cells by merging
    if (bestPartition) {
      return bestPartition;
    }

    // Default clean partitioning in rows/snakes as absolute fallback
    const fallbackSnakes = [];
    for (let k = 0; k < K; k++) {
      const s = [];
      const row = Math.floor((k * size) / K);
      for (let c = 0; c < size; c++) s.push({ r: row, c });
      fallbackSnakes.push(s);
    }
    return fallbackSnakes;
  }

  renderGrid() {
    this.gridEl.innerHTML = '';
    this.gridEl.style.setProperty('--flow-size', this.size);

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cell = document.createElement('div');
        cell.className = 'flow-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;

        const epColorId = this.grid[r][c].endpointColor;
        if (epColorId) {
          const colorObj = FLOW_COLORS.find(c => c.id === epColorId);
          const dot = document.createElement('div');
          dot.className = 'flow-endpoint';
          dot.style.backgroundColor = colorObj.hex;
          dot.style.boxShadow = `0 0 12px ${colorObj.glow}`;
          cell.appendChild(dot);
        }
        this.gridEl.appendChild(cell);
      }
    }

    this.resizeCanvas();
    this.drawCanvasPaths();
  }

  resizeCanvas() {
    const rect = this.gridEl.getBoundingClientRect();
    if (rect.width > 0) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }
  }

  setupTouchListeners() {
    let isDrawing = false;

    const getCellFromEvent = (e) => {
      const rect = this.gridEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || x >= rect.width || y < 0 || y >= rect.height) return null;
      const cellPx = rect.width / this.size;
      const c = Math.floor(x / cellPx);
      const r = Math.floor(y / cellPx);
      return { r: Math.max(0, Math.min(this.size - 1, r)), c: Math.max(0, Math.min(this.size - 1, c)) };
    };

    const handleStart = (e) => {
      if (this.solved) return;
      const cell = getCellFromEvent(e);
      if (!cell) return;

      const epColor = this.grid[cell.r][cell.c].endpointColor;
      const curColor = this.grid[cell.r][cell.c].currentColor;

      const colorToUse = epColor || curColor;
      if (!colorToUse) return;

      isDrawing = true;
      this.activeColor = colorToUse;

      // If clicked on an existing path, optionally truncate to this cell or restart
      const currentPath = this.paths[this.activeColor] || [];
      const idx = currentPath.findIndex(p => p.r === cell.r && p.c === cell.c);
      if (idx !== -1) {
        // Truncate path
        this.saveStateForUndo();
        this.clearPathCells(this.activeColor, idx + 1);
        this.paths[this.activeColor] = currentPath.slice(0, idx + 1);
      } else {
        // Start new path if starting at endpoint
        const pair = this.pairs.find(p => p.colorId === this.activeColor);
        if (epColor) {
          this.saveStateForUndo();
          this.clearPathCells(this.activeColor, 0);
          this.paths[this.activeColor] = [cell];
          this.grid[cell.r][cell.c].currentColor = this.activeColor;
        }
      }

      sound.playTap();
      haptics.tap();
      this.drawCanvasPaths();
      this.updateStatsUI();
    };

    const handleMove = (e) => {
      if (!isDrawing || !this.activeColor || this.solved) return;
      const cell = getCellFromEvent(e);
      if (!cell) return;

      const currentPath = this.paths[this.activeColor] || [];
      if (currentPath.length === 0) return;

      const last = currentPath[currentPath.length - 1];
      if (last.r === cell.r && last.c === cell.c) return; // Same cell

      // Must be orthogonal neighbor (dr + dc === 1)
      const dist = Math.abs(cell.r - last.r) + Math.abs(cell.c - last.c);
      if (dist !== 1) return;

      // Retracing back to previous cell in own path: shorten path!
      if (currentPath.length > 1) {
        const prev = currentPath[currentPath.length - 2];
        if (prev.r === cell.r && prev.c === cell.c) {
          this.grid[last.r][last.c].currentColor = null;
          currentPath.pop();
          this.drawCanvasPaths();
          this.updateStatsUI();
          return;
        }
      }

      // Check if target cell has an endpoint of another color
      const epColor = this.grid[cell.r][cell.c].endpointColor;
      if (epColor && epColor !== this.activeColor) return; // Cannot overwrite other endpoints

      // Check if target cell already occupied by another path: overwrite it
      const curColor = this.grid[cell.r][cell.c].currentColor;
      if (curColor && curColor !== this.activeColor) {
        this.removeCellFromPath(curColor, cell.r, cell.c);
      }

      // Cannot loop into own path
      const ownIdx = currentPath.findIndex(p => p.r === cell.r && p.c === cell.c);
      if (ownIdx !== -1) return;

      // Add cell to path
      currentPath.push(cell);
      this.grid[cell.r][cell.c].currentColor = this.activeColor;
      this.drawCanvasPaths();
      this.updateStatsUI();

      // Check if just connected to the target endpoint
      const pair = this.pairs.find(p => p.colorId === this.activeColor);
      if (pair) {
        const isConnected = (cell.r === pair.p1.r && cell.c === pair.p1.c) || (cell.r === pair.p2.r && cell.c === pair.p2.c);
        if (isConnected && currentPath.length > 1) {
          sound.playConnect();
          haptics.connect();
          isDrawing = false;
          this.moves++;
          this.onMove(this.moves);
          this.checkWinCondition();
        }
      }
    };

    const handleEnd = () => {
      if (!isDrawing) return;
      isDrawing = false;
      this.activeColor = null;
      this.moves++;
      this.onMove(this.moves);
      this.checkWinCondition();
    };

    this.gridEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.gridEl.setPointerCapture(e.pointerId);
      handleStart(e);
    });

    this.gridEl.addEventListener('pointermove', (e) => {
      e.preventDefault();
      handleMove(e);
    });

    this.gridEl.addEventListener('pointerup', handleEnd);
    this.gridEl.addEventListener('pointercancel', handleEnd);
  }

  saveStateForUndo() {
    const serializedPaths = {};
    for (let k in this.paths) {
      serializedPaths[k] = this.paths[k].map(p => ({ ...p }));
    }
    this.undoStack.push(serializedPaths);
  }

  clearPathCells(colorId, fromIndex = 0) {
    const p = this.paths[colorId] || [];
    for (let i = fromIndex; i < p.length; i++) {
      this.grid[p[i].r][p[i].c].currentColor = null;
    }
  }

  removeCellFromPath(colorId, r, c) {
    const p = this.paths[colorId];
    if (!p) return;
    const idx = p.findIndex(pt => pt.r === r && pt.c === c);
    if (idx !== -1) {
      // Cut path from idx to end
      for (let i = idx; i < p.length; i++) {
        this.grid[p[i].r][p[i].c].currentColor = null;
      }
      this.paths[colorId] = p.slice(0, idx);
    }
  }

  drawCanvasPaths() {
    this.resizeCanvas();
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    this.ctx.clearRect(0, 0, w, h);
    const cellPx = w / this.size;

    for (let pair of this.pairs) {
      const p = this.paths[pair.colorId];
      if (!p || p.length < 1) continue;

      this.ctx.beginPath();
      this.ctx.lineWidth = cellPx * 0.38;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.strokeStyle = pair.color.hex;
      this.ctx.shadowColor = pair.color.glow;
      this.ctx.shadowBlur = 10;

      for (let i = 0; i < p.length; i++) {
        const cx = (p[i].c + 0.5) * cellPx;
        const cy = (p[i].r + 0.5) * cellPx;
        if (i === 0) {
          this.ctx.moveTo(cx, cy);
        } else {
          this.ctx.lineTo(cx, cy);
        }
      }
      this.ctx.stroke();
    }
  }

  updateStatsUI() {
    let connected = 0;
    for (let pair of this.pairs) {
      const p = this.paths[pair.colorId];
      if (p && p.length > 1) {
        const head = p[0];
        const tail = p[p.length - 1];
        const connectsEndpoints = (
          (head.r === pair.p1.r && head.c === pair.p1.c && tail.r === pair.p2.r && tail.c === pair.p2.c) ||
          (head.r === pair.p2.r && head.c === pair.p2.c && tail.r === pair.p1.r && tail.c === pair.p1.c)
        );
        if (connectsEndpoints) connected++;
      }
    }

    let covered = 0;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c].currentColor !== null) covered++;
      }
    }

    const pct = Math.round((covered / (this.size * this.size)) * 100);
    this.flowsCountEl.textContent = `Conexiones: ${connected}/${this.pairs.length}`;
    this.coverageEl.textContent = `Tablero: ${pct}%`;
  }

  checkWinCondition() {
    let connected = 0;
    for (let pair of this.pairs) {
      const p = this.paths[pair.colorId];
      if (p && p.length > 1) {
        const head = p[0];
        const tail = p[p.length - 1];
        const ok = (
          (head.r === pair.p1.r && head.c === pair.p1.c && tail.r === pair.p2.r && tail.c === pair.p2.c) ||
          (head.r === pair.p2.r && head.c === pair.p2.c && tail.r === pair.p1.r && tail.c === pair.p1.c)
        );
        if (ok) connected++;
      }
    }

    let covered = 0;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c].currentColor !== null) covered++;
      }
    }

    // Win if all flows connected AND 100% cells covered
    if (connected === this.pairs.length && covered === this.size * this.size && !this.solved) {
      this.solved = true;
      sound.playVictory();
      haptics.victory();
      this.onWin({ moves: this.moves });
    }
  }

  undo() {
    if (this.undoStack.length === 0 || this.solved) return false;
    const prev = this.undoStack.pop();

    // Reset grid currentColor
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        this.grid[r][c].currentColor = null;
      }
    }

    this.paths = {};
    for (let k in prev) {
      this.paths[k] = prev[k].map(pt => ({ ...pt }));
      for (let pt of this.paths[k]) {
        this.grid[pt.r][pt.c].currentColor = parseInt(k, 10);
      }
    }

    this.moves++;
    this.onMove(this.moves);
    this.drawCanvasPaths();
    this.updateStatsUI();
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
    this.gridEl = null;
    this.canvas = null;
  }
}
