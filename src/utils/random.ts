// Seeded PRNG (mulberry32) for reproducible simulation runs

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** Returns a random float in [0, 1) */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a random float in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns a random integer in [min, max] inclusive */
  intRange(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Returns true with the given probability */
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

// Global RNG instance - can be re-seeded for reproducible games
let globalRng = new SeededRandom(Date.now());

export function setGlobalSeed(seed: number) {
  globalRng = new SeededRandom(seed);
}

export function rng(): SeededRandom {
  return globalRng;
}
