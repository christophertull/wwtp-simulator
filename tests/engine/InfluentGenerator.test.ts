import { describe, it, expect } from 'vitest';
import { InfluentGenerator } from '../../src/engine/InfluentGenerator';
import { setGlobalSeed } from '../../src/utils/random';

describe('InfluentGenerator', () => {
  const gen = new InfluentGenerator(3.8);
  const baseWeather = {
    isRaining: false,
    rainfallIntensity: 0,
    stormActive: false,
    temperature_c: 18,
  };

  it('should generate flow within reasonable range', () => {
    setGlobalSeed(42);
    const stream = gen.generate(
      new Date('2024-06-15T10:00:00').getTime(),
      baseWeather,
    );
    expect(stream.flow_mgd).toBeGreaterThan(0.5);
    expect(stream.flow_mgd).toBeLessThan(15);
  });

  it('should have higher flow during morning peak', () => {
    setGlobalSeed(42);
    const morning = gen.generate(
      new Date('2024-06-15T08:00:00').getTime(),
      baseWeather,
    );
    setGlobalSeed(42);
    const night = gen.generate(
      new Date('2024-06-15T03:00:00').getTime(),
      baseWeather,
    );
    expect(morning.flow_mgd).toBeGreaterThan(night.flow_mgd);
  });

  it('should increase flow during rain', () => {
    setGlobalSeed(42);
    const dry = gen.generate(
      new Date('2024-06-15T10:00:00').getTime(),
      baseWeather,
    );
    setGlobalSeed(42);
    const rainy = gen.generate(
      new Date('2024-06-15T10:00:00').getTime(),
      { ...baseWeather, isRaining: true, rainfallIntensity: 0.8 },
    );
    expect(rainy.flow_mgd).toBeGreaterThan(dry.flow_mgd);
  });

  it('should dilute concentrations during rain', () => {
    setGlobalSeed(42);
    const rainy = gen.generate(
      new Date('2024-06-15T10:00:00').getTime(),
      { ...baseWeather, isRaining: true, rainfallIntensity: 0.8 },
    );
    // Diluted influent should have lower concentrations
    expect(rainy.bod_mg_l).toBeLessThan(250);
    expect(rainy.tss_mg_l).toBeLessThan(280);
  });

  it('should generate typical influent concentrations', () => {
    setGlobalSeed(42);
    const stream = gen.generate(
      new Date('2024-06-15T10:00:00').getTime(),
      baseWeather,
    );
    expect(stream.bod_mg_l).toBeGreaterThan(100);
    expect(stream.bod_mg_l).toBeLessThan(400);
    expect(stream.tss_mg_l).toBeGreaterThan(100);
    expect(stream.nh3_mg_l).toBeGreaterThan(15);
    expect(stream.ph).toBeGreaterThan(6);
    expect(stream.ph).toBeLessThan(9);
  });

  it('should have reproducible output with same seed', () => {
    setGlobalSeed(100);
    const a = gen.generate(
      new Date('2024-06-15T10:00:00').getTime(),
      baseWeather,
    );
    setGlobalSeed(100);
    const b = gen.generate(
      new Date('2024-06-15T10:00:00').getTime(),
      baseWeather,
    );
    expect(a.flow_mgd).toBe(b.flow_mgd);
    expect(a.bod_mg_l).toBe(b.bod_mg_l);
  });
});
