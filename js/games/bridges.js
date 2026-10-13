/**
 * Bridges (Hashiwokakero)
 * Procedural generation by graph expansion with orthogonal non-crossing bridges.
 */
import { PRNG } from '../prng.js';
import { sound } from '../audio.js';
import { haptics } from '../haptics.js';

export class BridgesGame {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.difficulty = options.difficulty || 'medium';
    this.seed = options.seed || 'BRDG01';
    this.onMove = options.onMove || (() => {});
    this.onWin = options.onWin || (() => {});

    this.islands = []; // { id, r, c, target, current }
    this.playerBridges = new Map(); // "id1-id2" -> count (1 or 2)
    this.moves = 0;
    this.undoStack = [];
    this.selectedIsland = null;
    this.solved = false;

    this.init();
  }

  init() {
    this.container.innerHTML = `
      <div class="bridges-wrapper">
        <div class="game-instruction">Toca dos islas alineadas para trazar 1 o 2 puentes. Cumple el número exacto de cada isla.</div>
        <div class="bridges-board-container" id="bridges-container">
          <canvas id="bridges-canvas"></canvas>
          <div class="bridges-islands-layer" id="bridges-islands"></div>
        </div>
      </div>
    `;
    this.containerEl = this.container.querySelector('#bridges-container');
    this.canvas = this.container.querySelector('#bridges-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.islandsLayer = this.container.querySelector('#bridges-islands');

    this.newLevel(this.seed, this.difficulty);
  }

  getDifficultyConfig() {
    switch (this.difficulty) {
      case 'easy': return { size: 7, islandCount: 6 };
      case 'hard': return { size: 9, islandCount: 13 };
      case 'medium':
      default: return { size: 8, islandCount: 9 };
    }
  }

  newLevel(seed, difficulty) {
    this.seed = seed;
    this.difficulty = difficulty || this.difficulty;
    this.moves = 0;
    this.undoStack = [];
    this.selectedIsland = null;
    this.solved = false;
    this.playerBridges.clear();

    const prng = new PRNG(this.seed);
    const { size, islandCount } = this.getDifficultyConfig();
    this.size = size;

    // Procedural Generation: Grow network of islands
    const islands = [];
    const generatedBridges = []; // { i1, i2, count }

    // Start with one island near center
    const startR = prng.randInt(2, size - 3);
    const startC = prng.randInt(2, size - 3);
    islands.push({ id: 0, r: startR, c: startC, target: 0 });

    const DIRS = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 }
    ];

    let attempts = 0;
    while (islands.length < islandCount && attempts < 200) {
      attempts++;
      const origin = prng.choice(islands);
      const dir = prng.choice(DIRS);
      const dist = prng.randInt(2, 4);

      const targetR = origin.r + dir.dr * dist;
      const targetC = origin.c + dir.dc * dist;

      if (targetR < 0 || targetR >= size || targetC < 0 || targetC >= size) continue;

      // Check if target cell already has an island
      const existingAtTarget = islands.find(isl => isl.r === targetR && isl.c === targetC);
      let targetIsland = existingAtTarget;

      if (!targetIsland) {
        // Check if intervening cells pass through existing islands or bridges
        let pathClear = true;
        for (let d = 1; d <= dist; d++) {
          const cr = origin.r + dir.dr * d;
          const cc = origin.c + dir.dc * d;
          if (islands.some(isl => isl.r === cr && isl.c === cc)) {
            pathClear = false;
            break;
          }
          if (this.bridgeCrossesAny(origin.r, origin.c, targetR, targetC, generatedBridges, islands)) {
            pathClear = false;
            break;
          }
        }
        if (!pathClear) continue;

        targetIsland = { id: islands.length, r: targetR, c: targetC, target: 0 };
        islands.push(targetIsland);
      } else {
        // Can only connect if not already connected
        const alreadyConnected = generatedBridges.some(b =>
          (b.i1 === origin.id && b.i2 === targetIsland.id) || (b.i1 === targetIsland.id && b.i2 === origin.id)
        );
        if (alreadyConnected) continue;
        if (this.bridgeCrossesAny(origin.r, origin.c, targetR, targetC, generatedBridges, islands)) continue;
      }

      // Add bridge
      const count = prng.randInt(1, 2);
      generatedBridges.push({ i1: origin.id, i2: targetIsland.id, count });
    }

    // Calculate targets for each island
    for (let isl of islands) {
      let sum = 0;
      for (let b of generatedBridges) {
        if (b.i1 === isl.id || b.i2 === isl.id) {
          sum += b.count;
        }
      }
      isl.target = sum;
    }

    // Filter out disconnected islands if any
    this.islands = islands.filter(isl => isl.target > 0);
    this.render();
  }

  bridgeCrossesAny(r1, c1, r2, c2, bridges, islands) {
    const isHoriz = r1 === r2;
    for (let b of bridges) {
      const isl1 = islands.find(i => i.id === b.i1);
      const isl2 = islands.find(i => i.id === b.i2);
      if (!isl1 || !isl2) continue;
      const bHoriz = isl1.r === isl2.r;
      if (isHoriz && !bHoriz) {
        // check intersection of horizontal line (r1, minC..maxC) with vertical (minR..maxR, c)
        const minC = Math.min(c1, c2);
        const maxC = Math.max(c1, c2);
        const minR = Math.min(isl1.r, isl2.r);
        const maxR = Math.max(isl1.r, isl2.r);
        if (r1 > minR && r1 < maxR && isl1.c > minC && isl1.c < maxC) {
          return true;
        }
      } else if (!isHoriz && bHoriz) {
        const minR = Math.min(r1, r2);
        const maxR = Math.max(r1, r2);
        const minC = Math.min(isl1.c, isl2.c);
        const maxC = Math.max(isl1.c, isl2.c);
        if (c1 > minC && c1 < maxC && isl1.r > minR && isl1.r < maxR) {
          return true;
        }
      }
    }
    return false;
  }

  render() {
    this.islandsLayer.innerHTML = '';
    this.resizeCanvas();

    for (let isl of this.islands) {
      const el = document.createElement('button');
      el.className = 'bridge-island';
      el.dataset.id = isl.id;
      el.style.left = `${(isl.c / (this.size - 1)) * 100}%`;
      el.style.top = `${(isl.r / (this.size - 1)) * 100}%`;
      el.setAttribute('aria-label', `Isla ${isl.target}`);
      el.innerHTML = `<span>${isl.target}</span>`;

      el.addEventListener('click', () => this.handleIslandClick(isl));
      this.islandsLayer.appendChild(el);
      isl.el = el;
    }

    this.updateBridgesVisual();
  }

  resizeCanvas() {
    const rect = this.containerEl.getBoundingClientRect();
    if (rect.width > 0) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }
  }

  handleIslandClick(isl) {
    if (this.solved) return;

    if (!this.selectedIsland) {
      this.selectedIsland = isl;
      isl.el.classList.add('selected');
      sound.playTap();
      haptics.tap();
    } else if (this.selectedIsland.id === isl.id) {
      // Deselect
      this.selectedIsland.el.classList.remove('selected');
      this.selectedIsland = null;
      sound.playTap();
      haptics.tap();
    } else {
      // Attempt bridge between selectedIsland and isl
      const first = this.selectedIsland;
      this.selectedIsland.el.classList.remove('selected');
      this.selectedIsland = null;

      // Must be orthogonal
      if (first.r !== isl.r && first.c !== isl.c) {
        sound.playError();
        haptics.error();
        return;
      }

      // Check if there are other islands directly between them
      let unobstructed = true;
      if (first.r === isl.r) {
        const minC = Math.min(first.c, isl.c);
        const maxC = Math.max(first.c, isl.c);
        for (let other of this.islands) {
          if (other.r === first.r && other.c > minC && other.c < maxC) {
            unobstructed = false;
            break;
          }
        }
      } else {
        const minR = Math.min(first.r, isl.r);
        const maxR = Math.max(first.r, isl.r);
        for (let other of this.islands) {
          if (other.c === first.c && other.r > minR && other.r < maxR) {
            unobstructed = false;
            break;
          }
        }
      }

      if (!unobstructed) {
        sound.playError();
        haptics.error();
        return;
      }

      // Key for map
      const key = first.id < isl.id ? `${first.id}-${isl.id}` : `${isl.id}-${first.id}`;
      const curCount = this.playerBridges.get(key) || 0;

      // Cycle: 0 -> 1 -> 2 -> 0
      const nextCount = (curCount + 1) % 3;

      // Check if adding bridge crosses an existing perpendicular player bridge
      if (nextCount > 0 && curCount === 0) {
        const simulatedBridges = [];
        this.playerBridges.forEach((cnt, k) => {
          const [i1, i2] = k.split('-').map(Number);
          simulatedBridges.push({ i1, i2, count: cnt });
        });
        if (this.bridgeCrossesAny(first.r, first.c, isl.r, isl.c, simulatedBridges, this.islands)) {
          sound.playError();
          haptics.error();
          return;
        }
      }

      this.undoStack.push({ key, oldCount: curCount });
      if (nextCount === 0) {
        this.playerBridges.delete(key);
      } else {
        this.playerBridges.set(key, nextCount);
      }

      this.moves++;
      this.onMove(this.moves);
      sound.playConnect();
      haptics.connect();

      this.updateBridgesVisual();
      this.checkWinCondition();
    }
  }

  updateBridgesVisual() {
    this.resizeCanvas();
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    this.ctx.clearRect(0, 0, w, h);

    // Calculate current bridge sum per island
    const islandCounts = {};
    for (let isl of this.islands) islandCounts[isl.id] = 0;

    // Draw bridges
    this.playerBridges.forEach((count, key) => {
      const [id1, id2] = key.split('-').map(Number);
      const isl1 = this.islands.find(i => i.id === id1);
      const isl2 = this.islands.find(i => i.id === id2);
      if (!isl1 || !isl2) return;

      islandCounts[id1] += count;
      islandCounts[id2] += count;

      const x1 = (isl1.c / (this.size - 1)) * w;
      const y1 = (isl1.r / (this.size - 1)) * h;
      const x2 = (isl2.c / (this.size - 1)) * w;
      const y2 = (isl2.r / (this.size - 1)) * h;

      const isHoriz = isl1.r === isl2.r;
      const bridgeColor = '#00f0ff';
      const offset = 4;

      this.ctx.strokeStyle = bridgeColor;
      this.ctx.shadowColor = 'rgba(0, 240, 255, 0.5)';
      this.ctx.shadowBlur = 8;
      this.ctx.lineWidth = 3;

      if (count === 1) {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
      } else if (count === 2) {
        if (isHoriz) {
          this.ctx.beginPath();
          this.ctx.moveTo(x1, y1 - offset);
          this.ctx.lineTo(x2, y2 - offset);
          this.ctx.stroke();

          this.ctx.beginPath();
          this.ctx.moveTo(x1, y1 + offset);
          this.ctx.lineTo(x2, y2 + offset);
          this.ctx.stroke();
        } else {
          this.ctx.beginPath();
          this.ctx.moveTo(x1 - offset, y1);
          this.ctx.lineTo(x2 - offset, y2);
          this.ctx.stroke();

          this.ctx.beginPath();
          this.ctx.moveTo(x1 + offset, y1);
          this.ctx.lineTo(x2 + offset, y2);
          this.ctx.stroke();
        }
      }
    });

    // Update island DOM indicators
    for (let isl of this.islands) {
      const current = islandCounts[isl.id] || 0;
      isl.el.classList.remove('satisfied', 'over');
      if (current === isl.target) {
        isl.el.classList.add('satisfied');
      } else if (current > isl.target) {
        isl.el.classList.add('over');
      }
    }
  }

  checkWinCondition() {
    // 1. All islands must have current === target
    const islandCounts = {};
    for (let isl of this.islands) islandCounts[isl.id] = 0;
    this.playerBridges.forEach((count, key) => {
      const [id1, id2] = key.split('-').map(Number);
      islandCounts[id1] += count;
      islandCounts[id2] += count;
    });

    const allSatisfied = this.islands.every(isl => islandCounts[isl.id] === isl.target);
    if (!allSatisfied) return;

    // 2. All islands must form a single connected component
    if (this.islands.length === 0) return;
    const adj = {};
    for (let isl of this.islands) adj[isl.id] = [];
    this.playerBridges.forEach((count, key) => {
      const [id1, id2] = key.split('-').map(Number);
      adj[id1].push(id2);
      adj[id2].push(id1);
    });

    const visited = new Set();
    const q = [this.islands[0].id];
    visited.add(this.islands[0].id);

    while (q.length > 0) {
      const curr = q.shift();
      for (let neighbor of (adj[curr] || [])) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          q.push(neighbor);
        }
      }
    }

    if (visited.size === this.islands.length && !this.solved) {
      this.solved = true;
      sound.playVictory();
      haptics.victory();
      this.onWin({ moves: this.moves });
    }
  }

  undo() {
    if (this.undoStack.length === 0 || this.solved) return false;
    const last = this.undoStack.pop();
    if (last.oldCount === 0) {
      this.playerBridges.delete(last.key);
    } else {
      this.playerBridges.set(last.key, last.oldCount);
    }
    this.moves++;
    this.onMove(this.moves);
    this.updateBridgesVisual();
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
    this.containerEl = null;
    this.canvas = null;
  }
}
