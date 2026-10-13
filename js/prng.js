/**
 * Deterministic Seeded Pseudo-Random Number Generator (PRNG)
 * Using Mulberry32 for speed and uniform distribution.
 */
export class PRNG {
  constructor(seed = Date.now()) {
    this.setSeed(seed);
  }

  setSeed(seed) {
    if (typeof seed === 'string') {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
      }
      this.seed = h >>> 0;
    } else {
      this.seed = (seed >>> 0) || 1337;
    }
    this.initialSeed = this.seed;
    this.state = this.seed;
  }

  /**
   * Returns a float in range [0, 1)
   */
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns integer in [min, max] inclusive
   */
  randInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Returns a float in [min, max)
   */
  randFloat(min, max) {
    return this.next() * (max - min) + min;
  }

  /**
   * Pick random element from array
   */
  choice(array) {
    if (!array || array.length === 0) return null;
    return array[this.randInt(0, array.length - 1)];
  }

  /**
   * Shuffle array in-place (Fisher-Yates)
   */
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.randInt(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Reset PRNG back to initial seed
   */
  reset() {
    this.state = this.initialSeed;
  }
}

/**
 * Generate a clean 6-character alphanumeric seed
 */
export function generateSeedString() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let str = '';
  for (let i = 0; i < 6; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}
