/**
 * Kruskal Pipes (Conectar Tuberías / Circuitos)
 * Procedural generation using Kruskal's Minimum Spanning Tree (MST).
 */
import { PRNG } from '../prng.js';
import { sound } from '../audio.js';
import { haptics } from '../haptics.js';

// Bitmasks for ports: UP=1, RIGHT=2, DOWN=4, LEFT=8
const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;

export class KruskalPipesGame {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.difficulty = options.difficulty || 'medium';
    this.seed = options.seed || 'PIPE01';
    this.onMove = options.onMove || (() => {});
    this.onWin = options.onWin || (() => {});

    this.grid = [];
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;

    this.init();
  }

  init() {
    this.container.innerHTML = `
      <div class="pipes-wrapper">
        <div class="game-instruction">Gira los conductos para conectar e iluminar toda la red desde el reactor central.</div>
        <div class="pipes-board" id="pipes-board"></div>
      </div>
    `;
    this.boardEl = this.container.querySelector('#pipes-board');
    this.newLevel(this.seed, this.difficulty);
  }

  getDifficultyConfig() {
    switch (this.difficulty) {
      case 'easy': return { rows: 4, cols: 4 };
      case 'hard': return { rows: 6, cols: 6 };
      case 'medium':
      default: return { rows: 5, cols: 5 };
    }
  }

  newLevel(seed, difficulty) {
    this.seed = seed;
    this.difficulty = difficulty || this.difficulty;
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;

    const prng = new PRNG(this.seed);
    const { rows, cols } = this.getDifficultyConfig();
    this.rows = rows;
    this.cols = cols;

    // Build Kruskal's Spanning Tree
    const edges = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c + 1 < cols) edges.push({ r1: r, c1: c, r2: r, c2: c + 1, dir1: RIGHT, dir2: LEFT });
        if (r + 1 < rows) edges.push({ r1: r, c1: c, r2: r + 1, c2: c, dir1: DOWN, dir2: UP });
      }
    }
    prng.shuffle(edges);

    // Union Find
    const parent = Array(rows * cols).fill(0).map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const union = (i, j) => {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) {
        parent[rootI] = rootJ;
        return true;
      }
      return false;
    };

    const targetMasks = Array(rows).fill(0).map(() => Array(cols).fill(0));
    let edgesCount = 0;

    for (let edge of edges) {
      const idx1 = edge.r1 * cols + edge.c1;
      const idx2 = edge.r2 * cols + edge.c2;
      if (union(idx1, idx2)) {
        targetMasks[edge.r1][edge.c1] |= edge.dir1;
        targetMasks[edge.r2][edge.c2] |= edge.dir2;
        edgesCount++;
        if (edgesCount === rows * cols - 1) break;
      }
    }

    // Source is at center or (0,0)
    const sourceR = Math.floor(rows / 2);
    const sourceC = Math.floor(cols / 2);
    this.source = { r: sourceR, c: sourceC };

    // Scramble tiles with random rotations
    this.grid = [];
    for (let r = 0; r < rows; r++) {
      const rowArr = [];
      for (let c = 0; c < cols; c++) {
        const solvedMask = targetMasks[r][c];
        const rotSteps = prng.randInt(1, 3); // rotate 90, 180, or 270 deg
        const currentMask = this.rotateMask(solvedMask, rotSteps);

        rowArr.push({
          r, c,
          solvedMask,
          mask: currentMask,
          rotation: rotSteps * 90,
          isSource: (r === sourceR && c === sourceC),
          powered: false
        });
      }
      this.grid.push(rowArr);
    }

    this.render();
    this.updatePowerFlow();
  }

  rotateMask(mask, steps = 1) {
    let m = mask;
    for (let i = 0; i < (steps % 4); i++) {
      let nextM = 0;
      if (m & UP) nextM |= RIGHT;
      if (m & RIGHT) nextM |= DOWN;
      if (m & DOWN) nextM |= LEFT;
      if (m & LEFT) nextM |= UP;
      m = nextM;
    }
    return m;
  }

  render() {
    this.boardEl.innerHTML = '';
    this.boardEl.style.setProperty('--pipes-cols', this.cols);
    this.boardEl.style.setProperty('--pipes-rows', this.rows);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tile = this.grid[r][c];
        const tileEl = document.createElement('button');
        tileEl.className = `pipe-tile ${tile.isSource ? 'is-source' : ''}`;
        tileEl.dataset.r = r;
        tileEl.dataset.c = c;
        tileEl.setAttribute('aria-label', `Tubería en fila ${r + 1}, columna ${c + 1}`);

        // SVG pipe visualization based on current mask
        tileEl.innerHTML = this.getPipeSvg(tile);

        tileEl.addEventListener('click', () => this.handleTileClick(tile));
        this.boardEl.appendChild(tileEl);
        tile.el = tileEl;
      }
    }
  }

  getPipeSvg(tile) {
    const m = tile.mask;
    const isSource = tile.isSource;
    // Central hub
    let elements = `<circle cx="50" cy="50" r="${isSource ? 16 : 8}" class="pipe-node ${isSource ? 'source-core' : ''}" />`;

    // Branches
    if (m & UP) elements += `<rect x="44" y="0" width="12" height="50" rx="3" class="pipe-arm up" />`;
    if (m & RIGHT) elements += `<rect x="50" y="44" width="50" height="12" rx="3" class="pipe-arm right" />`;
    if (m & DOWN) elements += `<rect x="44" y="50" width="12" height="50" rx="3" class="pipe-arm down" />`;
    if (m & LEFT) elements += `<rect x="0" y="44" width="50" height="12" rx="3" class="pipe-arm left" />`;

    return `<svg viewBox="0 0 100 100" class="pipe-svg">${elements}</svg>`;
  }

  handleTileClick(tile) {
    if (this.solved) return;

    sound.playRotate();
    haptics.tap();

    this.undoStack.push({ r: tile.r, c: tile.c, oldMask: tile.mask });
    tile.mask = this.rotateMask(tile.mask, 1);
    this.moves++;
    this.onMove(this.moves);

    // Update SVG and animation
    tile.el.innerHTML = this.getPipeSvg(tile);
    tile.el.classList.add('rotate-click');
    setTimeout(() => tile.el.classList.remove('rotate-click'), 200);

    this.updatePowerFlow();
  }

  updatePowerFlow() {
    // Reset power status
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c].powered = false;
      }
    }

    // BFS from source
    const q = [this.source];
    const visited = new Set([`${this.source.r},${this.source.c}`]);
    this.grid[this.source.r][this.source.c].powered = true;

    while (q.length > 0) {
      const cur = q.shift();
      const curTile = this.grid[cur.r][cur.c];

      // Neighbor directions: UP (-1, 0), RIGHT (0, 1), DOWN (1, 0), LEFT (0, -1)
      const neighbors = [
        { dr: -1, dc: 0, myPort: UP, neighborPort: DOWN },
        { dr: 0, dc: 1, myPort: RIGHT, neighborPort: LEFT },
        { dr: 1, dc: 0, myPort: DOWN, neighborPort: UP },
        { dr: 0, dc: -1, myPort: LEFT, neighborPort: RIGHT }
      ];

      for (let n of neighbors) {
        const nr = cur.r + n.dr;
        const nc = cur.c + n.dc;
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
          const key = `${nr},${nc}`;
          if (!visited.has(key)) {
            const nextTile = this.grid[nr][nc];
            // Connection valid if both facing ports are open
            if ((curTile.mask & n.myPort) && (nextTile.mask & n.neighborPort)) {
              visited.add(key);
              nextTile.powered = true;
              q.push({ r: nr, c: nc });
            }
          }
        }
      }
    }

    // Update DOM classes for neon power glow
    let poweredCount = 0;
    const totalTiles = this.rows * this.cols;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const t = this.grid[r][c];
        if (t.powered) {
          t.el.classList.add('powered');
          poweredCount++;
        } else {
          t.el.classList.remove('powered');
        }
      }
    }

    if (poweredCount === totalTiles && !this.solved) {
      this.solved = true;
      sound.playVictory();
      haptics.victory();
      this.onWin({ moves: this.moves });
    }
  }

  undo() {
    if (this.undoStack.length === 0 || this.solved) return false;
    const last = this.undoStack.pop();
    const tile = this.grid[last.r][last.c];
    tile.mask = last.oldMask;
    tile.el.innerHTML = this.getPipeSvg(tile);
    this.moves++;
    this.onMove(this.moves);
    sound.playRotate();
    haptics.tap();
    this.updatePowerFlow();
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
