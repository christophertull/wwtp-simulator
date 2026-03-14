import { describe, it, expect, beforeEach } from 'vitest';
import { AerationTank } from '../../src/engine/processes/AerationTank';
import type { WaterStream } from '../../src/engine/types';
import { createEmptyStream } from '../../src/engine/types';

function makeInfluent(overrides: Partial<WaterStream> = {}): WaterStream {
  return {
    ...createEmptyStream(),
    flow_mgd: 3.8,
    bod_mg_l: 150,  // post-primary clarifier
    tss_mg_l: 100,
    nh3_mg_l: 25,
    no3_mg_l: 0.5,
    tp_mg_l: 5,
    do_mg_l: 1.0,
    ph: 7.2,
    temperature_c: 18,
    ...overrides,
  };
}

describe('AerationTank', () => {
  let tank: AerationTank;

  beforeEach(() => {
    tank = new AerationTank({
      volume_gal: 750_000,
      blower_count: 3,
      blower_capacity_scfm: 2000,
      blower_power_hp: 150,
    });
  });

  it('should initialize with reasonable MLSS', () => {
    const state = tank.getState();
    expect(state.mlss_mg_l).toBeGreaterThan(2000);
    expect(state.mlss_mg_l).toBeLessThan(3500);
  });

  it('should increase DO when blower speed is high', () => {
    const influent = makeInfluent();
    // Run 10 ticks at high blower speed
    for (let i = 0; i < 10; i++) {
      tank.update(1, influent, { blowerSpeed: 1.0, rasRate: 0.5, wasRate: 0.01 });
    }
    const state = tank.getState();
    expect(state.do_mg_l).toBeGreaterThan(1.5);
  });

  it('should decrease DO when blower speed is zero', () => {
    const influent = makeInfluent();
    // Warm up with normal aeration
    for (let i = 0; i < 30; i++) {
      tank.update(1, influent, { blowerSpeed: 0.7, rasRate: 0.5, wasRate: 0.01 });
    }
    // Turn off blowers — need enough ticks for O2 demand to deplete DO
    for (let i = 0; i < 180; i++) {
      tank.update(1, influent, { blowerSpeed: 0, rasRate: 0.5, wasRate: 0.01 });
    }
    const state = tank.getState();
    expect(state.do_mg_l).toBeLessThan(1.0);
  });

  it('should remove BOD over time', () => {
    const influent = makeInfluent({ bod_mg_l: 200 });
    // Run for 6 hours of game time
    for (let i = 0; i < 360; i++) {
      tank.update(1, influent, { blowerSpeed: 0.7, rasRate: 0.5, wasRate: 0.01 });
    }
    const state = tank.getState();
    expect(state.bod_mg_l).toBeLessThan(influent.bod_mg_l);
  });

  it('should track SRT and F:M ratio', () => {
    const influent = makeInfluent();
    for (let i = 0; i < 100; i++) {
      tank.update(1, influent, { blowerSpeed: 0.7, rasRate: 0.5, wasRate: 0.01 });
    }
    const state = tank.getState();
    expect(state.srt_days).toBeGreaterThan(0);
    expect(state.fm_ratio).toBeGreaterThan(0);
  });

  it('should increase MLSS when WAS rate is zero', () => {
    const influent = makeInfluent();
    const initialState = tank.getState();
    for (let i = 0; i < 1440; i++) { // 1 day
      tank.update(1, influent, { blowerSpeed: 0.7, rasRate: 0.5, wasRate: 0 });
    }
    const finalState = tank.getState();
    expect(finalState.mlss_mg_l).toBeGreaterThan(initialState.mlss_mg_l);
  });

  it('should generate power demand proportional to blower speed', () => {
    const influent = makeInfluent();
    const lowResult = tank.update(1, influent, { blowerSpeed: 0.3, rasRate: 0.5, wasRate: 0.01 });
    // Reset tank for fair comparison
    const tank2 = new AerationTank({
      volume_gal: 750_000,
      blower_count: 3,
      blower_capacity_scfm: 2000,
      blower_power_hp: 150,
    });
    const highResult = tank2.update(1, influent, { blowerSpeed: 1.0, rasRate: 0.5, wasRate: 0.01 });
    expect(highResult.powerDemand_kw).toBeGreaterThan(lowResult.powerDemand_kw);
  });

  it('should alarm on low DO', () => {
    const influent = makeInfluent({ bod_mg_l: 500 });
    let alarms: string[] = [];
    for (let i = 0; i < 60; i++) {
      const result = tank.update(1, influent, { blowerSpeed: 0, rasRate: 0.5, wasRate: 0.01 });
      alarms = result.alarms.map((a) => a.id);
    }
    expect(alarms.some((a) => a.includes('do'))).toBe(true);
  });

  it('should remain numerically stable under extreme inputs', () => {
    const extremeInfluent = makeInfluent({
      flow_mgd: 20,
      bod_mg_l: 1000,
      tss_mg_l: 800,
      nh3_mg_l: 50,
      temperature_c: 35,
    });
    // Run 24 hours of extreme conditions
    for (let i = 0; i < 1440; i++) {
      tank.update(1, extremeInfluent, { blowerSpeed: 1.0, rasRate: 1.0, wasRate: 0.05 });
    }
    const state = tank.getState();
    // Values should be finite and non-negative
    expect(state.mlss_mg_l).toBeGreaterThanOrEqual(0);
    expect(state.mlss_mg_l).toBeLessThan(20000);
    expect(state.do_mg_l).toBeGreaterThanOrEqual(0);
    expect(state.do_mg_l).toBeLessThanOrEqual(12);
    expect(state.bod_mg_l).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(state.mlss_mg_l)).toBe(true);
  });
});
