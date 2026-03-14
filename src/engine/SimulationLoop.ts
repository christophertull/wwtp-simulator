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
import { EventSystem } from './EventSystem';
import type { GameEvent } from './EventSystem';
import { LabSystem } from './LabSystem';
import type { LabSample } from './LabSystem';
import { RegulatoryEngine } from './RegulatoryEngine';
import type { RegulatoryState } from './RegulatoryEngine';
import { cloneStream, createEmptyStream } from './types';

export type { WeatherState } from './WeatherSystem';
export type { Equipment } from './EquipmentManager';
export type { FinanceState } from './FinanceEngine';
export type { GameEvent } from './EventSystem';
export type { LabSample } from './LabSystem';
export type { RegulatoryState } from './RegulatoryEngine';

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
  activeEvents: GameEvent[];
  labSamples: LabSample[];
  regulatory: RegulatoryState;
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
  private eventSystem: EventSystem;
  private labSystem: LabSystem;
  private regulatoryEngine: RegulatoryEngine;

  // State
  private gameTimeMs: number;
  private permit: PermitLimits;
  private lastEffluent: WaterStream = createEmptyStream();
  private lastInfluent: WaterStream = createEmptyStream();

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
    this.permit = config.permit ?? DEFAULT_PERMIT;
    this.eventSystem = new EventSystem();
    this.labSystem = new LabSystem();
    this.regulatoryEngine = new RegulatoryEngine(this.permit);
    this.gameTimeMs = config.startTimeMs ?? Date.now();
  }

  /** Advance simulation by dt game-minutes */
  tick(dt: number, controls: PlantControls): SimulationState {
    this.gameTimeMs += dt * 60 * 1000;

    // Update weather
    const weather = this.weatherSystem.update(this.gameTimeMs, dt);

    // Update events
    const eventResult = this.eventSystem.update(dt, this.gameTimeMs);

    // Update equipment
    const eqResult = this.equipmentManager.update(dt, this.gameTimeMs);

    // Power outage reduces blower capacity
    let effectiveControls = controls;
    if (eventResult.powerOutage) {
      effectiveControls = {
        ...controls,
        aerationTank: {
          ...controls.aerationTank,
          blowerSpeed: Math.min((controls.aerationTank.blowerSpeed as number) ?? 0.7, 0.3),
        },
      };
    }

    // Generate influent
    const influent = this.influentGenerator.generate(this.gameTimeMs, {
      isRaining: weather.isRaining,
      rainfallIntensity: weather.rainfallIntensity,
      stormActive: weather.stormActive,
      temperature_c: weather.temperature_c,
    });

    // Apply event influent modifiers
    if (eventResult.influentModifier) {
      const mod = eventResult.influentModifier;
      if (mod.bod_mg_l !== undefined) influent.bod_mg_l = mod.bod_mg_l;
      if (mod.tss_mg_l !== undefined) influent.tss_mg_l = mod.tss_mg_l;
      if (mod.ph !== undefined) influent.ph = mod.ph;
      if (mod.toxicity !== undefined) influent.toxicity = mod.toxicity;
      if (mod.nh3_mg_l !== undefined) influent.nh3_mg_l = mod.nh3_mg_l;
    }
    influent.flow_mgd *= eventResult.flowMultiplier;

    this.lastInfluent = cloneStream(influent);

    // Run treatment train
    const prelimResult = this.preliminary.update(dt, influent, effectiveControls.preliminary);
    const primaryResult = this.primaryClarifier.update(dt, prelimResult.effluent, effectiveControls.primaryClarifier);
    const aerationResult = this.aerationTank.update(dt, primaryResult.effluent, effectiveControls.aerationTank);
    const secondaryResult = this.secondaryClarifier.update(dt, aerationResult.effluent, effectiveControls.secondaryClarifier);
    const disinfectionResult = this.disinfection.update(dt, secondaryResult.effluent, effectiveControls.disinfection);

    // Sludge line
    const sludgeFeed = primaryResult.sludge ?? createEmptyStream();
    if (aerationResult.sludge) {
      sludgeFeed.flow_mgd += aerationResult.sludge.flow_mgd;
      sludgeFeed.tss_mg_l = (sludgeFeed.tss_mg_l + aerationResult.sludge.tss_mg_l) / 2;
    }
    const digesterResult = this.sludgeDigester.update(dt, sludgeFeed, effectiveControls.sludgeDigester);

    // Update SVI
    const aerationStatus = this.aerationTank.getStatus();
    this.secondaryClarifier.updateSVI(
      aerationStatus.parameters.srt_days,
      aerationStatus.parameters.fm_ratio,
      dt,
    );

    const effluentFinal = disinfectionResult.effluent;
    this.lastEffluent = cloneStream(effluentFinal);

    // Regulatory compliance check (replaces old checkPermit)
    const regResult = this.regulatoryEngine.checkCompliance(
      effluentFinal, this.gameTimeMs, eventResult.inspectionActive,
    );

    // Update lab system
    this.labSystem.update(this.gameTimeMs);

    // Collect all alarms
    const allAlarms = [
      ...prelimResult.alarms,
      ...primaryResult.alarms,
      ...aerationResult.alarms,
      ...secondaryResult.alarms,
      ...disinfectionResult.alarms,
      ...digesterResult.alarms,
      ...eqResult.alarms,
      ...eventResult.alarms,
      ...regResult.alarms,
    ];

    // Totals
    const results: ProcessOutput[] = [prelimResult, primaryResult, aerationResult, secondaryResult, disinfectionResult, digesterResult];
    const totalPower_kw = results.reduce((sum, r) => sum + r.powerDemand_kw, 0);
    const totalChemicalCost = results.reduce((sum, r) => sum + r.chemicalCosts_per_day, 0);

    // Finance
    const digesterState = this.sludgeDigester.getState();
    const finance = this.financeEngine.update(dt, {
      totalPower_kw,
      chemicalCosts_per_day: totalChemicalCost,
      maintenanceCost: eqResult.maintenanceCost,
      violationCount: regResult.violations.length,
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
      violations: regResult.violations,
      weather,
      finance,
      equipment: this.equipmentManager.getEquipment(),
      activeEvents: eventResult.events,
      labSamples: this.labSystem.getSamples(),
      regulatory: this.regulatoryEngine.getState(),
    };
  }

  repairEquipment(equipmentId: string): { cost: number; success: boolean } {
    return this.equipmentManager.startRepair(equipmentId, this.gameTimeMs);
  }

  maintainEquipment(equipmentId: string): { cost: number; success: boolean } {
    return this.equipmentManager.performMaintenance(equipmentId, this.gameTimeMs);
  }

  collectLabSample(type: 'grab' | 'composite', location: 'influent' | 'effluent' | 'aeration' | 'primary_effluent'): LabSample {
    const stream = location === 'effluent' ? this.lastEffluent
      : location === 'influent' ? this.lastInfluent
      : this.lastEffluent; // simplified
    const mlss = location === 'aeration' ? this.aerationTank.getState().mlss_mg_l : undefined;
    return this.labSystem.collectSample(type, location, stream, this.gameTimeMs, mlss);
  }

  getGameTimeMs(): number {
    return this.gameTimeMs;
  }
}
