import type { WaterStream, ProcessOutput, ControlInputs, Alarm, Violation, PermitLimits } from './types';
import { PreliminaryTreatment } from './processes/PreliminaryTreatment';
import { PrimaryClarifier } from './processes/PrimaryClarifier';
import { AerationTank } from './processes/AerationTank';
import { SecondaryClarifier } from './processes/SecondaryClarifier';
import { Disinfection } from './processes/Disinfection';
import { SludgeDigester } from './processes/SludgeDigester';
import { InfluentGenerator } from './InfluentGenerator';
import { WeatherSystem } from './WeatherSystem';
import type { WeatherState } from './WeatherSystem';
import { EquipmentManager } from './EquipmentManager';
import type { Equipment } from './EquipmentManager';
import { FinanceEngine } from './FinanceEngine';
import type { FinanceState } from './FinanceEngine';
import { cloneStream, createEmptyStream } from './types';

export type { WeatherState } from './WeatherSystem';
export type { Equipment } from './EquipmentManager';
export type { FinanceState } from './FinanceEngine';

export interface SimulationState {
  gameTimeMs: number;
  influent: WaterStream;
  effluentFinal: WaterStream;
  processStates: Record<string, Record<string, number>>;
  totalPower_kw: number;
  totalChemicalCost_per_day: number;
  alarms: Alarm[];
  violations: Violation[];
  weather: WeatherState;
  finance: FinanceState;
  equipment: Equipment[];
}

export interface PlantControls {
  preliminary: ControlInputs;
  primaryClarifier: ControlInputs;
  aerationTank: ControlInputs;
  secondaryClarifier: ControlInputs;
  disinfection: ControlInputs;
  sludgeDigester: ControlInputs;
}

const DEFAULT_PERMIT: PermitLimits = {
  bod_mg_l: { monthly_avg: 30, weekly_avg: 45, daily_max: 60 },
  tss_mg_l: { monthly_avg: 30, weekly_avg: 45, daily_max: 60 },
  nh3_mg_l: { monthly_avg_summer: 2.0, monthly_avg_winter: 5.0 },
  tp_mg_l: { monthly_avg: 1.0 },
  ph: { min: 6.5, max: 8.5 },
  chlorine_residual_mg_l: { daily_max: 0.1 },
};

export class SimulationLoop {
  // Process models
  private preliminary: PreliminaryTreatment;
  private primaryClarifier: PrimaryClarifier;
  private aerationTank: AerationTank;
  private secondaryClarifier: SecondaryClarifier;
  private disinfection: Disinfection;
  private sludgeDigester: SludgeDigester;
  private influentGenerator: InfluentGenerator;

  // Systems
  private weatherSystem: WeatherSystem;
  private equipmentManager: EquipmentManager;
  private financeEngine: FinanceEngine;

  // State
  private gameTimeMs: number;
  private violations: Violation[] = [];
  private permit: PermitLimits;

  constructor(config: {
    averageFlow_mgd: number;
    primaryClarifier: { count: number; surface_area_sqft: number; depth_ft: number };
    aerationTank: {
      volume_gal: number;
      blower_count: number;
      blower_capacity_scfm: number;
      blower_power_hp: number;
    };
    secondaryClarifier: { count: number; surface_area_sqft: number; depth_ft: number };
    digester?: { volume_gal: number };
    startTimeMs?: number;
    permit?: PermitLimits;
    servicePopulation?: number;
    startingBudget?: number;
  }) {
    this.preliminary = new PreliminaryTreatment();
    this.primaryClarifier = new PrimaryClarifier(config.primaryClarifier);
    this.aerationTank = new AerationTank(config.aerationTank);
    this.secondaryClarifier = new SecondaryClarifier(config.secondaryClarifier);
    this.disinfection = new Disinfection();
    this.sludgeDigester = new SludgeDigester(config.digester ?? { volume_gal: 300_000 });
    this.influentGenerator = new InfluentGenerator(config.averageFlow_mgd);
    this.weatherSystem = new WeatherSystem();
    this.equipmentManager = new EquipmentManager({
      blowerCount: config.aerationTank.blower_count,
      blowerPower_hp: config.aerationTank.blower_power_hp,
      processIds: ['preliminary', 'primaryClarifier', 'aerationTank', 'secondaryClarifier', 'disinfection', 'sludgeDigester'],
    });
    this.financeEngine = new FinanceEngine({
      startingBudget: config.startingBudget ?? 500_000,
      servicePopulation: config.servicePopulation ?? 25_000,
    });
    this.gameTimeMs = config.startTimeMs ?? Date.now();
    this.permit = config.permit ?? DEFAULT_PERMIT;
  }

  /** Advance simulation by dt game-minutes */
  tick(dt: number, controls: PlantControls): SimulationState {
    // Advance game clock
    this.gameTimeMs += dt * 60 * 1000;

    // Update weather
    const weather = this.weatherSystem.update(this.gameTimeMs, dt);

    // Update equipment
    const eqResult = this.equipmentManager.update(dt, this.gameTimeMs);

    // Generate influent (uses weather for I&I)
    const weatherForInfluent = {
      isRaining: weather.isRaining,
      rainfallIntensity: weather.rainfallIntensity,
      stormActive: weather.stormActive,
      temperature_c: weather.temperature_c,
    };
    const influent = this.influentGenerator.generate(this.gameTimeMs, weatherForInfluent);

    // Run treatment train in sequence
    const prelimResult = this.preliminary.update(dt, influent, controls.preliminary);
    const primaryResult = this.primaryClarifier.update(dt, prelimResult.effluent, controls.primaryClarifier);
    const aerationResult = this.aerationTank.update(dt, primaryResult.effluent, controls.aerationTank);
    const secondaryResult = this.secondaryClarifier.update(dt, aerationResult.effluent, controls.secondaryClarifier);
    const disinfectionResult = this.disinfection.update(dt, secondaryResult.effluent, controls.disinfection);

    // Sludge line: primary sludge + WAS → digester
    const sludgeFeed = primaryResult.sludge ?? createEmptyStream();
    if (aerationResult.sludge) {
      sludgeFeed.flow_mgd += aerationResult.sludge.flow_mgd;
      sludgeFeed.tss_mg_l = (sludgeFeed.tss_mg_l + aerationResult.sludge.tss_mg_l) / 2;
    }
    const digesterResult = this.sludgeDigester.update(dt, sludgeFeed, controls.sludgeDigester);

    // Update SVI based on aeration conditions
    const aerationStatus = this.aerationTank.getStatus();
    this.secondaryClarifier.updateSVI(
      aerationStatus.parameters.srt_days,
      aerationStatus.parameters.fm_ratio,
    );

    // Check permit compliance
    const effluentFinal = disinfectionResult.effluent;
    const newViolations = this.checkPermit(effluentFinal);
    this.violations.push(...newViolations);

    // Collect all alarms
    const allAlarms = [
      ...prelimResult.alarms,
      ...primaryResult.alarms,
      ...aerationResult.alarms,
      ...secondaryResult.alarms,
      ...disinfectionResult.alarms,
      ...digesterResult.alarms,
      ...eqResult.alarms,
    ];

    // Total power and chemical costs
    const results: ProcessOutput[] = [prelimResult, primaryResult, aerationResult, secondaryResult, disinfectionResult, digesterResult];
    const totalPower_kw = results.reduce((sum, r) => sum + r.powerDemand_kw, 0);
    const totalChemicalCost = results.reduce((sum, r) => sum + r.chemicalCosts_per_day, 0);

    // Finance update
    const digesterState = this.sludgeDigester.getState();
    const finance = this.financeEngine.update(dt, {
      totalPower_kw,
      chemicalCosts_per_day: totalChemicalCost,
      maintenanceCost: eqResult.maintenanceCost,
      violationCount: newViolations.length,
      biogasEnergy_kwh: digesterState.energy_kwh ?? 0,
      sludgeProduction_gal: sludgeFeed.flow_mgd * 1_000_000 / (60 * 24) * dt,
    });

    return {
      gameTimeMs: this.gameTimeMs,
      influent: cloneStream(influent),
      effluentFinal: cloneStream(effluentFinal),
      processStates: {
        preliminary: this.preliminary.getState(),
        primaryClarifier: this.primaryClarifier.getState(),
        aerationTank: this.aerationTank.getState(),
        secondaryClarifier: this.secondaryClarifier.getState(),
        disinfection: this.disinfection.getState(),
        sludgeDigester: this.sludgeDigester.getState(),
      },
      totalPower_kw,
      totalChemicalCost_per_day: totalChemicalCost,
      alarms: allAlarms,
      violations: newViolations,
      weather,
      finance,
      equipment: this.equipmentManager.getEquipment(),
    };
  }

  private checkPermit(effluent: WaterStream): Violation[] {
    const violations: Violation[] = [];
    const ts = this.gameTimeMs;

    if (effluent.bod_mg_l > this.permit.bod_mg_l.daily_max) {
      violations.push({ parameter: 'BOD', limit: this.permit.bod_mg_l.daily_max, actual: effluent.bod_mg_l, timestamp: ts });
    }
    if (effluent.tss_mg_l > this.permit.tss_mg_l.daily_max) {
      violations.push({ parameter: 'TSS', limit: this.permit.tss_mg_l.daily_max, actual: effluent.tss_mg_l, timestamp: ts });
    }
    if (effluent.ph < this.permit.ph.min || effluent.ph > this.permit.ph.max) {
      violations.push({ parameter: 'pH', limit: effluent.ph < this.permit.ph.min ? this.permit.ph.min : this.permit.ph.max, actual: effluent.ph, timestamp: ts });
    }
    if (effluent.chlorine_residual_mg_l > this.permit.chlorine_residual_mg_l.daily_max) {
      violations.push({ parameter: 'Chlorine Residual', limit: this.permit.chlorine_residual_mg_l.daily_max, actual: effluent.chlorine_residual_mg_l, timestamp: ts });
    }

    return violations;
  }

  /** Repair a failed piece of equipment */
  repairEquipment(equipmentId: string): { cost: number; success: boolean } {
    return this.equipmentManager.startRepair(equipmentId, this.gameTimeMs);
  }

  /** Perform maintenance on equipment */
  maintainEquipment(equipmentId: string): { cost: number; success: boolean } {
    return this.equipmentManager.performMaintenance(equipmentId, this.gameTimeMs);
  }

  getViolations(): Violation[] {
    return this.violations;
  }

  getGameTimeMs(): number {
    return this.gameTimeMs;
  }
}
