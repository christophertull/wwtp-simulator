import type {
  ProcessModel, WaterStream, ControlInputs,
  ProcessOutput, ProcessStatus, Alarm,
} from '../types';
import { ProcessType, cloneStream, createEmptyStream } from '../types';
import { clamp } from '../../utils/units';

// Anaerobic digestion kinetics
const VS_DESTRUCTION_RATE_PER_DAY = 0.05; // first-order rate at 35°C
const BIOGAS_FT3_PER_LB_VS = 12;
const METHANE_FRACTION = 0.65;
const METHANE_BTU_PER_FT3 = 600;
const KWH_PER_BTU = 0.000293;
const HEATING_COST_PER_DAY_BASE = 50; // base heating cost at mesophilic

export class SludgeDigester implements ProcessModel {
  id = 'sludge_digester';
  type = ProcessType.SLUDGE_DIGESTER;

  private volume_gal: number;

  // State
  private vs_concentration_mg_l = 15000; // volatile solids
  private temperature_c = 35;            // mesophilic target
  private ph = 7.0;
  private biogas_ft3_per_day = 0;
  private energy_generated_kwh = 0;
  private volatile_solids_destruction_pct = 0;
  private srt_days = 20;
  private acidPhaseUpset = false;
  private acidRecoveryDays = 0;
  private totalSolids_mg_l = 25000;

  private alarms: Alarm[] = [];

  constructor(config: { volume_gal: number }) {
    this.volume_gal = config.volume_gal;
  }

  update(dt: number, influent: WaterStream, controls: ControlInputs): ProcessOutput {
    const feedRate = clamp((controls.feedRate as number) ?? 0.5, 0, 1);  // fraction of max feed
    const tempSetpoint = clamp((controls.tempSetpoint as number) ?? 35, 20, 55);
    const mixingIntensity = clamp((controls.mixingIntensity as number) ?? 0.7, 0, 1);

    const dtDays = dt / (60 * 24);

    // Temperature control - slowly approach setpoint
    const tempDelta = (tempSetpoint - this.temperature_c) * 0.01 * dtDays * 24;
    this.temperature_c = clamp(this.temperature_c + tempDelta, 15, 60);

    // Temperature correction for VS destruction rate
    const tempFactor = Math.pow(1.05, this.temperature_c - 35);
    const effectiveRate = VS_DESTRUCTION_RATE_PER_DAY * tempFactor;

    // Feeding - sludge from primary and secondary clarifiers
    const feedVolume_gal = feedRate * influent.flow_mgd * 1_000_000 * dtDays;
    const feedSolids = influent.tss_mg_l;

    // SRT calculation
    const totalVolume = this.volume_gal;
    this.srt_days = feedRate > 0 ? totalVolume / (feedVolume_gal / dtDays) : 999;

    // Acid phase upset check - overfeeding or temperature shock can crash digester
    const organicLoadingRate = (feedSolids * feedRate * 0.001) / (this.volume_gal / 1_000_000);
    if (organicLoadingRate > 300 || this.temperature_c < 25) {
      // Risk of acid phase upset
      if (!this.acidPhaseUpset && organicLoadingRate > 400) {
        this.acidPhaseUpset = true;
        this.acidRecoveryDays = 0;
        this.ph = 5.5; // acid crash
      }
    }

    // Acid recovery (takes weeks!)
    if (this.acidPhaseUpset) {
      this.acidRecoveryDays += dtDays;
      if (feedRate < 0.2 && this.acidRecoveryDays > 14) {
        // Slowly recovering
        this.ph = clamp(this.ph + 0.05 * dtDays, 5.0, 7.0);
        if (this.ph >= 6.8) {
          this.acidPhaseUpset = false;
        }
      }
    } else {
      this.ph = clamp(7.0 + (this.temperature_c - 35) * 0.02, 6.5, 7.5);
    }

    // VS destruction (impaired during acid upset)
    const destructionModifier = this.acidPhaseUpset ? 0.1 : 1.0;
    const mixingModifier = 0.5 + mixingIntensity * 0.5;
    const vsDestroyed = this.vs_concentration_mg_l * effectiveRate * destructionModifier * mixingModifier * dtDays;
    this.vs_concentration_mg_l = clamp(
      this.vs_concentration_mg_l + feedSolids * feedRate * 0.8 * dtDays * 0.1 - vsDestroyed,
      1000,
      50000
    );
    this.totalSolids_mg_l = this.vs_concentration_mg_l / 0.6; // VS is ~60% of TS

    this.volatile_solids_destruction_pct = clamp(
      (vsDestroyed / Math.max(this.vs_concentration_mg_l, 1)) * 100,
      0, 70
    );

    // Biogas production
    const vsDestroyed_lb = vsDestroyed * this.volume_gal * 8.34 / 1_000_000;
    this.biogas_ft3_per_day = vsDestroyed_lb * BIOGAS_FT3_PER_LB_VS / Math.max(dtDays, 0.0001);

    // Energy generation from methane
    const methane_ft3_per_day = this.biogas_ft3_per_day * METHANE_FRACTION;
    this.energy_generated_kwh = methane_ft3_per_day * METHANE_BTU_PER_FT3 * KWH_PER_BTU;

    // Effluent (supernatant return to head of plant)
    const effluent = createEmptyStream();
    effluent.flow_mgd = feedRate * influent.flow_mgd * 0.05; // small supernatant return
    effluent.bod_mg_l = 500; // high-strength return
    effluent.nh3_mg_l = 200; // ammonia release from digestion
    effluent.tss_mg_l = 500;
    effluent.ph = this.ph;
    effluent.temperature_c = this.temperature_c;

    // Costs
    const heatingCost = HEATING_COST_PER_DAY_BASE * Math.max(0, (tempSetpoint - 20) / 15);
    const mixingPower_kw = mixingIntensity * 15;
    const powerDemand_kw = mixingPower_kw; // heating is gas/steam, counted as chemical cost

    // Alarms
    this.alarms = [];
    if (this.acidPhaseUpset) {
      this.alarms.push({
        id: 'acid_upset', processId: this.id, severity: 'critical',
        message: `Digester acid phase upset! pH ${this.ph.toFixed(1)} - reduce feed immediately`,
        timestamp: Date.now(), acknowledged: false,
      });
    }
    if (this.ph < 6.5 && !this.acidPhaseUpset) {
      this.alarms.push({
        id: 'low_ph', processId: this.id, severity: 'warning',
        message: `Digester pH low: ${this.ph.toFixed(1)}`,
        timestamp: Date.now(), acknowledged: false,
      });
    }
    if (this.temperature_c < 30) {
      this.alarms.push({
        id: 'low_temp', processId: this.id, severity: 'warning',
        message: `Digester temperature low: ${this.temperature_c.toFixed(1)}°C`,
        timestamp: Date.now(), acknowledged: false,
      });
    }
    if (this.srt_days < 10) {
      this.alarms.push({
        id: 'low_srt', processId: this.id, severity: 'warning',
        message: `Digester SRT low: ${this.srt_days.toFixed(0)} days (target: 20)`,
        timestamp: Date.now(), acknowledged: false,
      });
    }

    return {
      effluent,
      powerDemand_kw,
      chemicalCosts_per_day: heatingCost,
      alarms: this.alarms,
    };
  }

  getStatus(): ProcessStatus {
    return {
      id: this.id,
      type: this.type,
      healthy: !this.acidPhaseUpset && this.ph >= 6.5 && this.temperature_c >= 30,
      parameters: {
        temperature_c: this.temperature_c,
        ph: this.ph,
        vs_concentration_mg_l: this.vs_concentration_mg_l,
        totalSolids_mg_l: this.totalSolids_mg_l,
        biogas_ft3_per_day: this.biogas_ft3_per_day,
        energy_generated_kwh: this.energy_generated_kwh,
        vs_destruction_pct: this.volatile_solids_destruction_pct,
        srt_days: this.srt_days,
      },
      alarms: this.alarms,
    };
  }

  getState(): Record<string, number> {
    return {
      temperature_c: this.temperature_c,
      ph: this.ph,
      vs_mg_l: this.vs_concentration_mg_l,
      biogas_ft3_day: this.biogas_ft3_per_day,
      energy_kwh: this.energy_generated_kwh,
      srt_days: this.srt_days,
      vs_destruction_pct: this.volatile_solids_destruction_pct,
    };
  }
}
