/**
 * LocalStorage Persistence and State Manager
 */
const STORAGE_KEY = 'infinity_puzzles_v1';

export class StorageManager {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          return JSON.parse(raw);
        }
      }
    } catch (e) {
      console.warn('Could not read from localStorage', e);
    }
    return this.getDefaults();
  }

  getDefaults() {
    return {
      settings: {
        sound: true,
        haptics: true,
      },
      games: {} // Keyed by gameId
    };
  }

  save() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      }
    } catch (e) {
      console.warn('Could not write to localStorage', e);
    }
  }

  getSettings() {
    return this.data.settings;
  }

  setSetting(key, val) {
    this.data.settings[key] = val;
    this.save();
  }

  getGameStats(gameId) {
    if (!this.data.games[gameId]) {
      this.data.games[gameId] = {
        level: 1,
        completed: 0,
        streak: 0,
        bestStreak: 0,
        bestMoves: {},
        bestTimes: {},
        lastSeed: null,
      };
      this.save();
    }
    return this.data.games[gameId];
  }

  recordLevelComplete(gameId, difficulty, moves, seconds, seed) {
    const stats = this.getGameStats(gameId);
    stats.completed += 1;
    stats.level += 1;
    stats.streak += 1;
    if (stats.streak > stats.bestStreak) {
      stats.bestStreak = stats.streak;
    }
    stats.lastSeed = seed;

    if (!stats.bestMoves[difficulty] || moves < stats.bestMoves[difficulty]) {
      stats.bestMoves[difficulty] = moves;
    }
    if (!stats.bestTimes[difficulty] || seconds < stats.bestTimes[difficulty]) {
      stats.bestTimes[difficulty] = seconds;
    }

    this.save();
    return stats;
  }

  recordLevelSkippedOrFailed(gameId) {
    const stats = this.getGameStats(gameId);
    stats.streak = 0;
    this.save();
  }
}

export const storage = new StorageManager();
