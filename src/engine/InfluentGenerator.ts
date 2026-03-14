import type { WaterStream } from './types';
import { rng } from '../utils/random';

// Diurnal flow pattern: hour → multiplier (1.0 = average daily flow)
const DIURNAL_PATTERN: Record<number, number> = {
  0: 0.55, 1: 0.48, 2: 0.42, 3: 0.38, 4: 0.40, 5: 0.52,
  6: 0.75, 7: 1.05, 8: 1.30, 9: 1.25, 10: 1.20, 11: 1.15,
  12: 1.10, 13: 1.08, 14: 1.05, 15: 1.02, 16: 1.00, 17: 1.10,
  18: 1.25, 19: 1.20, 20: 1.10, 21: 0.95, 22: 0.80, 23: 0.65,
};

// Day-of-week modifiers (0=Sunday)
const DAY_OF_WEEK_MODIFIER = [0.90, 1.05, 1.05, 1.02, 1.00, 0.98, 0.92];

// Typical influent concentrations for a 5 MGD plant
const TYPICAL_INFLUENT = {
  bod_mg_l: 220,
  tss_mg_l: 250,
  nh3_mg_l: 28,
  tp_mg_l: 7,
  ph: 7.2,
  temperature_c: 18,
};

export interface InfluentWeatherInput {
  isRaining: boolean;
  rainfallIntensity: number;
  stormActive: boolean;
  temperature_c: number;
}

export class InfluentGenerator {
  private averageFlow_mgd: number;

  constructor(averageFlow_mgd: number) {
    this.averageFlow_mgd = averageFlow_mgd;
  }

  generate(gameTimeMs: number, weather: InfluentWeatherInput): WaterStream {
    const date = new Date(gameTimeMs);
    const hour = date.getHours();
    const minuteFraction = date.getMinutes() / 60;
    const dayOfWeek = date.getDay();

    // Interpolate between hours for smooth flow
    const nextHour = (hour + 1) % 24;
    const currentMultiplier = DIURNAL_PATTERN[hour];
    const nextMultiplier = DIURNAL_PATTERN[nextHour];
    const diurnalMultiplier = currentMultiplier + (nextMultiplier - currentMultiplier) * minuteFraction;

    const dowMultiplier = DAY_OF_WEEK_MODIFIER[dayOfWeek];

    // Random variation (+/- 10%)
    const randomVariation = 1.0 + (rng().next() - 0.5) * 0.2;

    // Weather effect on flow
    let weatherFlowMultiplier = 1.0;
    let concentrationDilution = 1.0;
    if (weather.isRaining) {
      weatherFlowMultiplier = 1.0 + weather.rainfallIntensity * 2.0;
      concentrationDilution = 1.0 / weatherFlowMultiplier; // dilution from I&I
    }
    if (weather.stormActive) {
      weatherFlowMultiplier *= 2.0;
      concentrationDilution = 1.0 / weatherFlowMultiplier;
    }

    const flow = this.averageFlow_mgd * diurnalMultiplier * dowMultiplier
      * randomVariation * weatherFlowMultiplier;

    // Seasonal temperature variation
    const dayOfYear = Math.floor((gameTimeMs / 86400000) % 365);
    const seasonalTemp = TYPICAL_INFLUENT.temperature_c
      + 6 * Math.sin((dayOfYear - 80) * 2 * Math.PI / 365); // peak in summer

    return {
      flow_mgd: Math.max(flow, 0.1),
      tss_mg_l: TYPICAL_INFLUENT.tss_mg_l * concentrationDilution * (0.9 + rng().next() * 0.2),
      bod_mg_l: TYPICAL_INFLUENT.bod_mg_l * concentrationDilution * (0.9 + rng().next() * 0.2),
      nh3_mg_l: TYPICAL_INFLUENT.nh3_mg_l * concentrationDilution * (0.95 + rng().next() * 0.1),
      no3_mg_l: 0.5, // low in raw sewage
      tp_mg_l: TYPICAL_INFLUENT.tp_mg_l * concentrationDilution * (0.9 + rng().next() * 0.2),
      do_mg_l: 0.5, // raw sewage is low DO
      ph: TYPICAL_INFLUENT.ph + (rng().next() - 0.5) * 0.4,
      temperature_c: weather.temperature_c || seasonalTemp,
      toxicity: 0,
      chlorine_residual_mg_l: 0,
    };
  }
}
