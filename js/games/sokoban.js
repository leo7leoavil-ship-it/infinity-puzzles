/**
 * Sokoban Clásico
 * Reverse procedural generator (backward pull-walking) guaranteeing solvability.
 */
import { PRNG } from '../prng.js';
import { sound } from '../audio.js';
import { haptics } from '../haptics.js';

export class SokobanGame {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.difficulty = options.difficulty || 'medium';
    this.seed = options.seed || 'SOKO01';
    this.onMove = options.onMove || (() => {});
    this.onWin = options.onWin || (() => {});

    this.rows = 7;
    this.cols = 7;
    this.walls = []; // boolean [r][c]
    this.goals = []; // {r, c}
    this.boxes = []; // {r, c}
    this.player = { r: 0, c: 0 };
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;

    this.init();
  }

  init() {
    this.container.innerHTML = `
      <div class="sokoban-wrapper">
        <div class="game-instruction">Empuja las cajas de energía hasta sus puertos objetivo.</div>
        <div class="sokoban-board" id="sokoban-board"></div>
        <div class="sokoban-dpad">
          <button class="dpad-btn up" data-dir="up" aria-label="Arriba">▲</button>
          <div class="dpad-middle">
            <button class="dpad-btn left" data-dir="left" aria-label="Izquierda">◀</button>
            <button class="dpad-btn down" data-dir="down" aria-label="Abajo">▼</button>
            <button class="dpad-btn right" data-dir="right" aria-label="Derecha">▶</button>
          </div>
        </div>
      </div>
    `;
    this.boardEl = this.container.querySelector('#sokoban-board');
    this.setupControls();
    this.newLevel(this.seed, this.difficulty);
  }

  getDifficultyConfig() {
    switch (this.difficulty) {
      case 'easy': return { rows: 7, cols: 7, boxCount: 2, reverseSteps: 35 };
      case 'hard': return { rows: 8, cols: 8, boxCount: 4, reverseSteps: 90 };
      case 'medium':
      default: return { rows: 7, cols: 7, boxCount: 3, reverseSteps: 60 };
    }
  }

  newLevel(seed, difficulty) {
    this.seed = seed;
    this.difficulty = difficulty || this.difficulty;
    this.moves = 0;
    this.undoStack = [];
    this.solved = false;

    const prng = new PRNG(this.seed);
    const { rows, cols, boxCount, reverseSteps } = this.getDifficultyConfig();
    this.rows = rows;
    this.cols = cols;

    // Build floor layout: outer border is wall, inner area has some obstacles
    this.walls = Array(rows).fill(false).map(() => Array(cols).fill(false));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
          this.walls[r][c] = true;
        }
      }
    }

    // Add a couple of interior wall pillars
    const interiorCandidates = [];
    for (let r = 2; r < rows - 2; r++) {
      for (let c = 2; c < cols - 2; c++) {
        interiorCandidates.push({ r, c });
      }
    }
    prng.shuffle(interiorCandidates);
    for (let i = 0; i < Math.min(2, interiorCandidates.length); i++) {
      const p = interiorCandidates[i];
      this.walls[p.r][p.c] = true;
    }

    // Find walkable interior floor cells
    const floorCells = [];
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (!this.walls[r][c]) {
          floorCells.push({ r, c });
        }
      }
    }
    prng.shuffle(floorCells);

    // Pick boxCount goals
    this.goals = floorCells.slice(0, boxCount).map(c => ({ r: c.r, c: c.c }));
    // Start boxes on goals
    this.boxes = this.goals.map(g => ({ r: g.r, c: g.c }));

    // Place player at an empty walkable cell adjacent to one of the boxes
    const playerCandidates = [];
    for (let b of this.boxes) {
      const adj = [
        { r: b.r - 1, c: b.c },
        { r: b.r + 1, c: b.c },
        { r: b.r, c: b.c - 1 },
        { r: b.r, c: b.c + 1 }
      ];
      for (let a of adj) {
        if (!this.walls[a.r][a.c] && !this.boxes.some(bx => bx.r === a.r && bx.c === a.c)) {
          playerCandidates.push(a);
        }
      }
    }
    this.player = playerCandidates.length > 0 ? prng.choice(playerCandidates) : { r: 1, c: 1 };

    // Reverse walk simulation: player walks or pulls boxes backwards
    const DIRS = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 }
    ];

    for (let step = 0; step < reverseSteps; step++) {
      // Possible actions:
      // 1. Walk: move player to adjacent empty floor
      // 2. Pull: player at P moves to P' = P + D, pulling box from P - D to P
      const pullActions = [];
      const walkActions = [];

      for (let d of DIRS) {
        const nextPlayer = { r: this.player.r + d.dr, c: this.player.c + d.dc };
        // Check if nextPlayer cell is walkable and has no box
        if (
          nextPlayer.r > 0 && nextPlayer.r < rows - 1 &&
          nextPlayer.c > 0 && nextPlayer.c < cols - 1 &&
          !this.walls[nextPlayer.r][nextPlayer.c] &&
          !this.boxes.some(bx => bx.r === nextPlayer.r && bx.c === nextPlayer.c)
        ) {
          walkActions.push(nextPlayer);

          // Can pull box if there is a box at (player.r - d.dr, player.c - d.dc)
          const boxBehindR = this.player.r - d.dr;
          const boxBehindC = this.player.c - d.dc;
          const boxIdx = this.boxes.findIndex(bx => bx.r === boxBehindR && bx.c === boxBehindC);
          if (boxIdx !== -1) {
            pullActions.push({ nextPlayer, boxIdx, pulledBoxPos: { r: this.player.r, c: this.player.c } });
          }
        }
      }

      // Prioritize pull actions to scramble boxes (70% probability)
      if (pullActions.length > 0 && prng.next() < 0.7) {
        const action = prng.choice(pullActions);
        this.boxes[action.boxIdx] = action.pulledBoxPos;
        this.player = action.nextPlayer;
      } else if (walkActions.length > 0) {
        this.player = prng.choice(walkActions);
      }
    }

    this.render();
  }

  setupControls() {
    // D-Pad buttons
    const dpadButtons = this.container.querySelectorAll('.dpad-btn');
    dpadButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const dir = btn.dataset.dir;
        this.handleMoveDirection(dir);
      });
    });

    // Touch swipe gestures
    let touchStartX = 0;
    let touchStartY = 0;
    this.boardEl.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    this.boardEl.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (Math.max(absDx, absDy) > 25) {
        if (absDx > absDy) {
          this.handleMoveDirection(dx > 0 ? 'right' : 'left');
        } else {
          this.handleMoveDirection(dy > 0 ? 'down' : 'up');
        }
      }
    }, { passive: true });

    // Keyboard support for desktop / testing
    this.keyListener = (e) => {
      if (['ArrowUp', 'KeyW'].includes(e.code)) this.handleMoveDirection('up');
      if (['ArrowDown', 'KeyS'].includes(e.code)) this.handleMoveDirection('down');
      if (['ArrowLeft', 'KeyA'].includes(e.code)) this.handleMoveDirection('left');
      if (['ArrowRight', 'KeyD'].includes(e.code)) this.handleMoveDirection('right');
    };
    window.addEventListener('keydown', this.keyListener);
  }

  handleMoveDirection(dir) {
    if (this.solved) return;
    const dirMap = {
      up: { dr: -1, dc: 0 },
      down: { dr: 1, dc: 0 },
      left: { dr: 0, dc: -1 },
      right: { dr: 0, dc: 1 }
    };
    const delta = dirMap[dir];
    if (!delta) return;

    const nextR = this.player.r + delta.dr;
    const nextC = this.player.c + delta.dc;

    // Wall collision
    if (this.walls[nextR][nextC]) {
      sound.playError();
      haptics.error();
      return;
    }

    // Check box push
    const boxIdx = this.boxes.findIndex(b => b.r === nextR && b.c === nextC);
    if (boxIdx !== -1) {
      const nextBoxR = nextR + delta.dr;
      const nextBoxC = nextC + delta.dc;

      // Cannot push into wall or another box
      if (this.walls[nextBoxR][nextBoxC] || this.boxes.some(b => b.r === nextBoxR && b.c === nextBoxC)) {
        sound.playError();
        haptics.error();
        return;
      }

      // Valid push
      this.undoStack.push({
        player: { ...this.player },
        boxes: this.boxes.map(b => ({ ...b }))
      });

      this.boxes[boxIdx] = { r: nextBoxR, c: nextBoxC };
      this.player = { r: nextR, c: nextC };
      this.moves++;
      this.onMove(this.moves);

      // Check if pushed box landed on a goal
      const onGoal = this.goals.some(g => g.r === nextBoxR && g.c === nextBoxC);
      if (onGoal) {
        sound.playConnect();
        haptics.connect();
      } else {
        sound.playSlide();
        haptics.slide();
      }

      this.render();
      this.checkWinCondition();
    } else {
      // Free move
      this.undoStack.push({
        player: { ...this.player },
        boxes: this.boxes.map(b => ({ ...b }))
      });

      this.player = { r: nextR, c: nextC };
      this.moves++;
      this.onMove(this.moves);
      sound.playTap();
      haptics.tap();

      this.render();
    }
  }

  render() {
    this.boardEl.innerHTML = '';
    this.boardEl.style.setProperty('--soko-rows', this.rows);
    this.boardEl.style.setProperty('--soko-cols', this.cols);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'soko-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;

        if (this.walls[r][c]) {
          cell.classList.add('is-wall');
        } else {
          cell.classList.add('is-floor');

          const isGoal = this.goals.some(g => g.r === r && g.c === c);
          if (isGoal) {
            cell.classList.add('is-goal');
            cell.innerHTML = '<span class="goal-dot"></span>';
          }

          const hasBox = this.boxes.some(b => b.r === r && b.c === c);
          if (hasBox) {
            const boxEl = document.createElement('div');
            boxEl.className = `soko-box ${isGoal ? 'on-goal' : ''}`;
            boxEl.innerHTML = '📦';
            cell.appendChild(boxEl);
          }

          if (this.player.r === r && this.player.c === c) {
            const playerEl = document.createElement('div');
            playerEl.className = 'soko-player';
            playerEl.innerHTML = '🤖';
            cell.appendChild(playerEl);
          }
        }

        // Tap cell to move toward it
        cell.addEventListener('click', () => {
          const dr = r - this.player.r;
          const dc = c - this.player.c;
          if (Math.abs(dr) + Math.abs(dc) === 1) {
            if (dr === -1) this.handleMoveDirection('up');
            if (dr === 1) this.handleMoveDirection('down');
            if (dc === -1) this.handleMoveDirection('left');
            if (dc === 1) this.handleMoveDirection('right');
          }
        });

        this.boardEl.appendChild(cell);
      }
    }
  }

  checkWinCondition() {
    const allGoalsFilled = this.goals.every(g =>
      this.boxes.some(b => b.r === g.r && b.c === g.c)
    );

    if (allGoalsFilled && !this.solved) {
      this.solved = true;
      sound.playVictory();
      haptics.victory();
      this.onWin({ moves: this.moves });
    }
  }

  undo() {
    if (this.undoStack.length === 0 || this.solved) return false;
    const last = this.undoStack.pop();
    this.player = last.player;
    this.boxes = last.boxes;
    this.moves++;
    this.onMove(this.moves);
    this.render();
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
    if (this.keyListener) {
      window.removeEventListener('keydown', this.keyListener);
    }
    this.boardEl = null;
  }
}
