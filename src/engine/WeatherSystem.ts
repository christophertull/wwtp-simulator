import { rng } from '../utils/random';

export interface WeatherState {
  isRaining: boolean;
  rainfallIntensity: number; // 0-1
  stormActive: boolean;
  temperature_c: number;
  condition: 'clear' | 'cloudy' | 'rain' | 'heavy_rain' | 'storm';
  windSpeed_mph: number;
}

interface WeatherEvent {
  type: 'rain' | 'heavy_rain' | 'storm';
  startTime: number;
  duration_min: number;
  intensity: number;
}

export class WeatherSystem {
  private currentEvent: WeatherEvent | null = null;
  private baseTemperature_c = 18;
  private state: WeatherState;

  constructor() {
    this.state = {
      isRaining: false,
      rainfallIntensity: 0,
      stormActive: false,
      temperature_c: 18,
      condition: 'clear',
      windSpeed_mph: 5,
    };
  }

  update(gameTimeMs: number, dtMinutes: number): WeatherState {
    // Seasonal temperature variation
    const dayOfYear = Math.floor((gameTimeMs / 86_400_000) % 365);
    const hour = new Date(gameTimeMs).getHours();
    const seasonalTemp = 18 + 6 * Math.sin((dayOfYear - 80) * 2 * Math.PI / 365);
    // Diurnal temperature swing (+/- 4°C)
    const diurnalTemp = -4 * Math.cos((hour - 14) * 2 * Math.PI / 24);
    this.baseTemperature_c = seasonalTemp + diurnalTemp;

    // Check if current event has ended
    if (this.currentEvent) {
      const elapsed = gameTimeMs - this.currentEvent.startTime;
      if (elapsed > this.currentEvent.duration_min * 60 * 1000) {
        this.currentEvent = null;
      }
    }

    // Random event generation (check once per game-hour)
    if (!this.currentEvent) {
      const checkProbability = dtMinutes / 60; // normalize to hourly check
      const r = rng();

      if (r.chance(0.003 * checkProbability)) {
        // Storm (rare)
        this.currentEvent = {
          type: 'storm',
          startTime: gameTimeMs,
          duration_min: r.intRange(4 * 60, 24 * 60),
          intensity: r.range(0.7, 1.0),
        };
      } else if (r.chance(0.008 * checkProbability)) {
        // Heavy rain
        this.currentEvent = {
          type: 'heavy_rain',
          startTime: gameTimeMs,
          duration_min: r.intRange(2 * 60, 12 * 60),
          intensity: r.range(0.4, 0.7),
        };
      } else if (r.chance(0.015 * checkProbability)) {
        // Light rain
        this.currentEvent = {
          type: 'rain',
          startTime: gameTimeMs,
          duration_min: r.intRange(60, 8 * 60),
          intensity: r.range(0.1, 0.4),
        };
      }
    }

    // Build current state
    if (this.currentEvent) {
      const elapsed = gameTimeMs - this.currentEvent.startTime;
      const progress = elapsed / (this.currentEvent.duration_min * 60 * 1000);

      // Intensity ramps up then down
      let intensityModifier = 1.0;
      if (progress < 0.2) intensityModifier = progress / 0.2; // ramp up
      else if (progress > 0.8) intensityModifier = (1 - progress) / 0.2; // ramp down

      const intensity = this.currentEvent.intensity * intensityModifier;

      this.state = {
        isRaining: true,
        rainfallIntensity: intensity,
        stormActive: this.currentEvent.type === 'storm',
        temperature_c: this.baseTemperature_c - intensity * 3, // rain cools things
        condition: this.currentEvent.type === 'storm' ? 'storm'
          : this.currentEvent.type === 'heavy_rain' ? 'heavy_rain' : 'rain',
        windSpeed_mph: this.currentEvent.type === 'storm' ? 25 + intensity * 20
          : 5 + intensity * 10,
      };
    } else {
      this.state = {
        isRaining: false,
        rainfallIntensity: 0,
        stormActive: false,
        temperature_c: this.baseTemperature_c,
        condition: rng().chance(0.3) ? 'cloudy' : 'clear',
        windSpeed_mph: 3 + rng().next() * 8,
      };
    }

    return this.state;
  }

  getState(): WeatherState {
    return { ...this.state };
  }

  /** Force a weather event (for scenarios) */
  forceEvent(type: 'rain' | 'heavy_rain' | 'storm', duration_min: number, intensity: number, gameTimeMs: number) {
    this.currentEvent = { type, startTime: gameTimeMs, duration_min, intensity };
  }
}
