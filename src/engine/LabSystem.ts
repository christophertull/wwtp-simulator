import type { WaterStream } from './types';
import { rng } from '../utils/random';

export interface LabSample {
  id: string;
  type: 'grab' | 'composite';
  location: 'influent' | 'effluent' | 'aeration' | 'primary_effluent';
  collectedAt: number;     // game time when sample was taken
  resultsAt: number;       // game time when results are available
  results: Partial<WaterStream> | null; // null until resultsAt
  actualValues: Partial<WaterStream>;   // stored immediately, revealed later
}

// How long each test takes in game-minutes
const TEST_DELAYS: Record<string, number> = {
  ph: 5,               // nearly instant
  do_mg_l: 5,          // probe reading
  tss_mg_l: 120,       // 2 hours for gravimetric
  bod_mg_l: 7200,      // 5 days! (BOD5 test)
  nh3_mg_l: 60,        // 1 hour for colorimetric
  no3_mg_l: 60,
  tp_mg_l: 120,
  chlorine_residual_mg_l: 5,
};

export class LabSystem {
  private samples: LabSample[] = [];
  private nextId = 1;
  private maxSamples = 50;

  /** Take a sample at the given location */
  collectSample(
    type: 'grab' | 'composite',
    location: LabSample['location'],
    currentStream: WaterStream,
    gameTimeMs: number,
    mlss_mg_l?: number,
  ): LabSample {
    // Determine longest test delay for this sample
    const maxDelay = Math.max(...Object.values(TEST_DELAYS));

    // Add analytical variability (+/- 5-10%)
    const r = rng();
    const vary = (val: number, pct: number = 0.05) => val * (1 + (r.next() - 0.5) * 2 * pct);

    const actualValues: Partial<WaterStream> = {
      ph: vary(currentStream.ph, 0.02),
      do_mg_l: vary(currentStream.do_mg_l, 0.05),
      tss_mg_l: vary(currentStream.tss_mg_l, 0.08),
      bod_mg_l: vary(currentStream.bod_mg_l, 0.10),
      nh3_mg_l: vary(currentStream.nh3_mg_l, 0.07),
      no3_mg_l: vary(currentStream.no3_mg_l, 0.07),
      tp_mg_l: vary(currentStream.tp_mg_l, 0.08),
      chlorine_residual_mg_l: vary(currentStream.chlorine_residual_mg_l, 0.05),
    };

    if (location === 'aeration' && mlss_mg_l !== undefined) {
      (actualValues as Record<string, number>).mlss_mg_l = vary(mlss_mg_l, 0.05);
    }

    const sample: LabSample = {
      id: `lab_${this.nextId++}`,
      type,
      location,
      collectedAt: gameTimeMs,
      resultsAt: gameTimeMs + maxDelay * 60 * 1000, // full results after longest test
      results: null,
      actualValues,
    };

    this.samples.push(sample);

    // Trim old samples
    if (this.samples.length > this.maxSamples) {
      this.samples = this.samples.slice(-this.maxSamples);
    }

    return sample;
  }

  /** Update - reveal results as tests complete */
  update(gameTimeMs: number): void {
    for (const sample of this.samples) {
      if (sample.results !== null) continue;

      // Reveal partial results based on individual test times
      const elapsed_min = (gameTimeMs - sample.collectedAt) / (60 * 1000);
      const partialResults: Partial<WaterStream> = {};
      let hasAny = false;

      for (const [param, delay] of Object.entries(TEST_DELAYS)) {
        if (elapsed_min >= delay && param in sample.actualValues) {
          (partialResults as Record<string, number>)[param] =
            (sample.actualValues as Record<string, number>)[param];
          hasAny = true;
        }
      }

      // Check MLSS separately (quick test)
      if (elapsed_min >= 30 && 'mlss_mg_l' in sample.actualValues) {
        (partialResults as Record<string, number>).mlss_mg_l =
          (sample.actualValues as Record<string, number>).mlss_mg_l;
        hasAny = true;
      }

      if (hasAny) {
        sample.results = partialResults;
      }

      // Full results available
      if (gameTimeMs >= sample.resultsAt) {
        sample.results = { ...sample.actualValues };
      }
    }
  }

  /** Get all samples with their current state */
  getSamples(): LabSample[] {
    return this.samples.map((s) => ({
      ...s,
      results: s.results ? { ...s.results } : null,
      actualValues: { ...s.actualValues },
    }));
  }

  /** Get the most recent sample for a location */
  getLatestSample(location: LabSample['location']): LabSample | null {
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (this.samples[i].location === location) return this.samples[i];
    }
    return null;
  }

  /** Check if BOD5 results are pending (teaches player about the 5-day wait) */
  hasPendingBOD(): boolean {
    return this.samples.some(
      (s) => s.results !== null && !('bod_mg_l' in (s.results as object))
    );
  }
}
