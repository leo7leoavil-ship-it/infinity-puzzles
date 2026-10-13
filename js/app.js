/**
 * Infinity Puzzles - Main Application Controller
 */
import { storage } from './storage.js';
import { sound } from './audio.js';
import { haptics } from './haptics.js';
import { generateSeedString } from './prng.js';
import { ConfettiCannon } from './confetti.js';

// Games
import { TapAwayGame } from './games/tap-away.js';
import { KruskalPipesGame } from './games/kruskal-pipes.js';
import { LightsOutGame } from './games/lights-out.js';
import { SlidingBlockGame } from './games/sliding-block.js';
import { FlowFreeGame } from './games/flow-free.js';
import { SokobanGame } from './games/sokoban.js';
import { BridgesGame } from './games/bridges.js';
import { PatternFoldGame } from './games/pattern-fold.js';
import { SlidingTileGame } from './games/sliding-tile.js';
import { LaserMirrorsGame } from './games/laser-mirrors.js';
import { TetrizGame } from './games/tetriz.js';

// Puzzle Registry
const GAMES_CATALOG = [
  {
    id: 'tap-away',
    title: 'Tap Away',
    subtitle: 'Flechas Desenredables',
    icon: '↗',
    color: '#00f0ff',
    engine: TapAwayGame
  },
  {
    id: 'kruskal-pipes',
    title: 'Kruskal Pipes',
    subtitle: 'Conectar Tuberías / Red',
    icon: '⚡',
    color: '#a855f7',
    engine: KruskalPipesGame
  },
  {
    id: 'lights-out',
    title: 'Lights Out',
    subtitle: 'Luces Fuera',
    icon: '💡',
    color: '#f59e0b',
    engine: LightsOutGame
  },
  {
    id: 'sliding-block',
    title: 'Klotski Escape',
    subtitle: 'Despeje de Bloques',
    icon: '🚪',
    color: '#f43f5e',
    engine: SlidingBlockGame
  },
  {
    id: 'flow-free',
    title: 'Path Weaver',
    subtitle: 'Conectar Puntos (Flow)',
    icon: '〰',
    color: '#10b981',
    engine: FlowFreeGame
  },
  {
    id: 'sokoban',
    title: 'Sokoban Clásico',
    subtitle: 'Almacén Cuántico',
    icon: '📦',
    color: '#3b82f6',
    engine: SokobanGame
  },
  {
    id: 'bridges',
    title: 'Bridges (Hashi)',
    subtitle: 'Islas y Puentes',
    icon: '🌉',
    color: '#06b6d4',
    engine: BridgesGame
  },
  {
    id: 'pattern-fold',
    title: 'Pattern Fold',
    subtitle: 'Desenvolver Cinta',
    icon: '📐',
    color: '#ec4899',
    engine: PatternFoldGame
  },
  {
    id: 'sliding-tile',
    title: 'Sliding Tile',
    subtitle: '15-Puzzle de Gradiente',
    icon: '🧩',
    color: '#8b5cf6',
    engine: SlidingTileGame
  },
  {
    id: 'laser-mirrors',
    title: 'Laser & Mirrors',
    subtitle: 'Reflexión Óptica',
    icon: '🔮',
    color: '#f43f5e',
    engine: LaserMirrorsGame
  },
  {
    id: 'tetriz',
    title: 'Tetriz Fit',
    subtitle: 'Poliominós y Líneas',
    icon: '🧱',
    color: '#eab308',
    engine: TetrizGame
  }
];

class App {
  constructor() {
    this.currentGame = null;
    this.currentGameId = null;
    this.currentDifficulty = 'medium';
    this.currentSeed = '';
    this.timerInterval = null;
    this.elapsedSeconds = 0;
    this.currentMoves = 0;

    this.initDOM();
    this.initAudioAndHaptics();
    this.renderMenuCards();
    this.updateGlobalMenuStats();
  }

  initDOM() {
    // Views
    this.menuView = document.getElementById('view-menu');
    this.gameView = document.getElementById('view-game');
    this.playArea = document.getElementById('game-play-area');
    this.gamesGridEl = document.getElementById('games-grid');

    // Headers & Stats
    this.gameTitleEl = document.getElementById('game-title-text');
    this.seedBadgeEl = document.getElementById('seed-badge');
    this.liveMovesEl = document.getElementById('live-moves-val');
    this.liveTimerEl = document.getElementById('live-timer-val');
    this.totalSolvedValEl = document.getElementById('total-solved-val');
    this.bestStreakValEl = document.getElementById('best-streak-val');

    // Controls
    this.backMenuBtn = document.getElementById('btn-back-menu');
    this.undoBtn = document.getElementById('btn-undo');
    this.restartBtn = document.getElementById('btn-restart');
    this.newLevelBtn = document.getElementById('btn-new-level');
    this.soundToggleBtn = document.getElementById('btn-sound-toggle');
    this.hapticToggleBtn = document.getElementById('btn-haptic-toggle');

    // Modals
    this.victoryModal = document.getElementById('victory-modal');
    this.vMovesVal = document.getElementById('v-moves-val');
    this.vTimeVal = document.getElementById('v-time-val');
    this.btnNextLevel = document.getElementById('btn-next-level');
    this.btnVictoryMenu = document.getElementById('btn-victory-menu');
    this.seedDialogModal = document.getElementById('seed-dialog-modal');
    this.customSeedInput = document.getElementById('custom-seed-input');
    this.btnApplySeed = document.getElementById('btn-apply-seed');
    this.btnCloseSeed = document.getElementById('btn-close-seed');

    // Confetti
    const confettiCanvas = document.getElementById('confetti-canvas');
    this.confetti = new ConfettiCannon(confettiCanvas);

    // Event Listeners
    this.backMenuBtn.addEventListener('click', () => this.showMenu());
    this.restartBtn.addEventListener('click', () => this.restartLevel());
    this.undoBtn.addEventListener('click', () => this.handleUndo());
    this.newLevelBtn.addEventListener('click', () => this.generateNewLevel());

    // Difficulty buttons
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const diff = e.target.dataset.diff;
        if (diff !== this.currentDifficulty) {
          this.setDifficulty(diff);
        }
      });
    });

    // Seed Badge click to enter custom seed
    this.seedBadgeEl.addEventListener('click', () => {
      this.customSeedInput.value = this.currentSeed;
      this.seedDialogModal.classList.add('active');
    });

    this.btnCloseSeed.addEventListener('click', () => {
      this.seedDialogModal.classList.remove('active');
    });

    this.btnApplySeed.addEventListener('click', () => {
      const val = this.customSeedInput.value.trim().toUpperCase();
      if (val) {
        this.currentSeed = val;
        this.seedDialogModal.classList.remove('active');
        this.loadLevel(this.currentSeed, this.currentDifficulty);
      }
    });

    // Victory actions
    this.btnNextLevel.addEventListener('click', () => {
      this.victoryModal.classList.remove('active');
      this.generateNewLevel();
    });

    this.btnVictoryMenu.addEventListener('click', () => {
      this.victoryModal.classList.remove('active');
      this.showMenu();
    });
  }

  initAudioAndHaptics() {
    const settings = storage.getSettings();
    sound.setEnabled(settings.sound);
    haptics.setEnabled(settings.haptics);

    this.updateToggleIcons();

    this.soundToggleBtn.addEventListener('click', () => {
      const current = storage.getSettings().sound;
      storage.setSetting('sound', !current);
      sound.setEnabled(!current);
      this.updateToggleIcons();
      if (!current) sound.playTap();
    });

    this.hapticToggleBtn.addEventListener('click', () => {
      const current = storage.getSettings().haptics;
      storage.setSetting('haptics', !current);
      haptics.setEnabled(!current);
      this.updateToggleIcons();
      if (!current) haptics.tap();
    });
  }

  updateToggleIcons() {
    const { sound: snd, haptics: hap } = storage.getSettings();
    this.soundToggleBtn.innerHTML = snd ? '🔊' : '🔇';
    this.soundToggleBtn.classList.toggle('is-active', snd);
    this.hapticToggleBtn.innerHTML = hap ? '📳' : '📴';
    this.hapticToggleBtn.classList.toggle('is-active', hap);
  }

  renderMenuCards() {
    this.gamesGridEl.innerHTML = '';

    GAMES_CATALOG.forEach(game => {
      const stats = storage.getGameStats(game.id);
      const card = document.createElement('div');
      card.className = 'game-card';
      card.style.setProperty('--card-color', game.color);

      card.innerHTML = `
        <div class="game-card-icon" style="color: ${game.color}; border-color: ${game.color}44;">
          ${game.icon}
        </div>
        <div class="game-card-info">
          <div class="game-card-title">${game.title}</div>
          <div class="game-card-desc">${game.subtitle}</div>
          <div class="game-card-meta">
            <span class="game-badge">Nivel ${stats.level}</span>
            <span class="game-badge ${stats.completed > 0 ? 'completed' : ''}">
              ${stats.completed > 0 ? `✓ ${stats.completed} resueltos` : 'Nuevo'}
            </span>
          </div>
        </div>
        <div class="game-play-btn">▶</div>
      `;

      card.addEventListener('click', () => {
        sound.playTap();
        haptics.tap();
        this.openGame(game.id);
      });

      this.gamesGridEl.appendChild(card);
    });
  }

  updateGlobalMenuStats() {
    let totalCompleted = 0;
    let maxStreak = 0;

    GAMES_CATALOG.forEach(g => {
      const stats = storage.getGameStats(g.id);
      totalCompleted += stats.completed;
      if (stats.bestStreak > maxStreak) {
        maxStreak = stats.bestStreak;
      }
    });

    this.totalSolvedValEl.textContent = totalCompleted;
    this.bestStreakValEl.textContent = `${maxStreak}🔥`;
  }

  openGame(gameId) {
    this.currentGameId = gameId;
    const gameDef = GAMES_CATALOG.find(g => g.id === gameId);
    if (!gameDef) return;

    this.gameTitleEl.textContent = gameDef.title;

    // View transition
    this.menuView.classList.add('hidden');
    this.gameView.classList.remove('hidden');

    this.setDifficulty('medium', false);
    this.generateNewLevel();
  }

  showMenu() {
    if (this.currentGame) {
      this.currentGame.destroy();
      this.currentGame = null;
    }
    this.stopTimer();
    this.victoryModal.classList.remove('active');
    this.confetti.clear();

    this.gameView.classList.add('hidden');
    this.menuView.classList.remove('hidden');

    this.renderMenuCards();
    this.updateGlobalMenuStats();
  }

  setDifficulty(diff, reload = true) {
    this.currentDifficulty = diff;
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.diff === diff);
    });

    if (reload) {
      sound.playTap();
      haptics.tap();
      this.loadLevel(this.currentSeed, this.currentDifficulty);
    }
  }

  generateNewLevel() {
    const seed = generateSeedString();
    this.currentSeed = seed;
    this.loadLevel(seed, this.currentDifficulty);
  }

  restartLevel() {
    sound.playTap();
    haptics.tap();
    if (this.currentGame) {
      this.currentMoves = 0;
      this.updateMovesDisplay();
      this.startTimer();
      this.currentGame.reset();
      this.updateUndoButton();
    }
  }

  loadLevel(seed, difficulty) {
    const gameDef = GAMES_CATALOG.find(g => g.id === this.currentGameId);
    if (!gameDef) return;

    this.currentSeed = seed;
    this.seedBadgeEl.textContent = `#${seed}`;

    if (this.currentGame) {
      this.currentGame.destroy();
      this.currentGame = null;
    }

    this.currentMoves = 0;
    this.updateMovesDisplay();
    this.startTimer();
    this.victoryModal.classList.remove('active');
    this.confetti.clear();

    const options = {
      difficulty,
      seed,
      onMove: (moves) => {
        this.currentMoves = moves;
        this.updateMovesDisplay();
        this.updateUndoButton();
      },
      onWin: (stats) => {
        this.handleLevelWin(stats);
      }
    };

    this.playArea.innerHTML = '';
    this.currentGame = new gameDef.engine(this.playArea, options);
    this.updateUndoButton();
  }

  handleUndo() {
    if (this.currentGame && this.currentGame.canUndo()) {
      this.currentGame.undo();
      this.updateUndoButton();
    }
  }

  updateUndoButton() {
    if (this.currentGame) {
      this.undoBtn.disabled = !this.currentGame.canUndo();
    } else {
      this.undoBtn.disabled = true;
    }
  }

  updateMovesDisplay() {
    this.liveMovesEl.textContent = this.currentMoves;
  }

  startTimer() {
    this.stopTimer();
    this.elapsedSeconds = 0;
    this.updateTimerDisplay();
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
      this.updateTimerDisplay();
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  updateTimerDisplay() {
    const m = Math.floor(this.elapsedSeconds / 60);
    const s = this.elapsedSeconds % 60;
    this.liveTimerEl.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  handleLevelWin(stats) {
    this.stopTimer();
    this.updateUndoButton();

    // Persist stats in localStorage
    storage.recordLevelComplete(
      this.currentGameId,
      this.currentDifficulty,
      this.currentMoves,
      this.elapsedSeconds,
      this.currentSeed
    );

    // Fire celebration
    this.confetti.burst(70);

    // Show modal
    this.vMovesVal.textContent = this.currentMoves;
    const m = Math.floor(this.elapsedSeconds / 60);
    const s = this.elapsedSeconds % 60;
    this.vTimeVal.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;

    setTimeout(() => {
      this.victoryModal.classList.add('active');
    }, 400);
  }
}

// Boot up once DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  window.infinityApp = new App();

  // Register Service Worker for offline PWA support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('SW registration error:', err);
    });
  }
});
