import type {
  ProcessModel, WaterStream, ControlInputs,
  ProcessOutput, ProcessStatus, Alarm,
} from '../types';
import { ProcessType, cloneStream } from '../types';
import { clamp, massLoading } from '../../utils/units';

// Monod kinetic constants (simplified ASM1)
const MU_MAX = 6.0;          // max specific growth rate (1/day) for heterotrophs
const KS_BOD = 60;           // half-saturation constant for BOD (mg/L)
const KO_DO = 0.2;           // half-saturation constant for DO (mg/L)
const YIELD = 0.6;           // biomass yield (mg VSS / mg BOD)
const DECAY_RATE = 0.06;     // endogenous decay rate (1/day)
const O2_PER_BOD = 0.5;      // oxygen required per BOD removed (lb O2 / lb BOD)

// Nitrification constants
const MU_MAX_NITRIFIERS = 0.8; // much slower than heterotrophs
const KS_NH3 = 1.0;          // half-saturation for ammonia (mg/L)
const KO_NITRIFIERS = 0.5;   // nitrifiers need more DO than heterotrophs
const O2_PER_NH3 = 4.6;      // oxygen for ammonia oxidation (lb O2 / lb NH3-N)
const NITRIFIER_YIELD = 0.12;

export class AerationTank implements ProcessModel {
  id = 'aeration_tank';
  type = ProcessType.AERATION;

  private volume_gal: number;
  private blowerCount: number;
  private blowerCapacity_scfm: number;
  private blowerPower_hp: number;

  // State variables
  private mlss_mg_l = 2500;
  private mlvss_mg_l = 2000;  // ~80% of MLSS is volatile
  private do_mg_l = 2.0;
  private bod_mg_l = 10;
  private nh3_mg_l = 1.0;
  private no3_mg_l = 15;
  private srt_days = 10;
  private fm_ratio = 0.25;
  private temperature_c = 18;

  private alarms: Alarm[] = [];

  constructor(config: {
    volume_gal: number;
    blower_count: number;
    blower_capacity_scfm: number;
    blower_power_hp: number;
    initial_mlss?: number;
  }) {
    this.volume_gal = config.volume_gal;
    this.blowerCount = config.blower_count;
    this.blowerCapacity_scfm = config.blower_capacity_scfm;
    this.blowerPower_hp = config.blower_power_hp;
    if (config.initial_mlss) this.mlss_mg_l = config.initial_mlss;
    this.mlvss_mg_l = this.mlss_mg_l * 0.8;
  }

  update(dt: number, influent: WaterStream, controls: ControlInputs): ProcessOutput {
    const blowerSpeed = clamp((controls.blowerSpeed as number) ?? 0.7, 0, 1); // 0-1 fraction
    const rasRate = clamp((controls.rasRate as number) ?? 0.5, 0, 1.5);       // fraction of influent flow
    const wasRate = clamp((controls.wasRate as number) ?? 0.01, 0, 0.1);      // fraction of influent flow

    const dtDays = dt / (60 * 24);
    this.temperature_c = influent.temperature_c;

    // Temperature correction for kinetics (Arrhenius)
    const tempFactor = Math.pow(1.04, this.temperature_c - 20);

    // ── DO dynamics ──
    // Oxygen transfer from blowers
    const maxO2Transfer_mg_l_min = (this.blowerCapacity_scfm * this.blowerCount * 0.02) / (this.volume_gal / 7.48 / 1000);
    const o2Transfer = blowerSpeed * maxO2Transfer_mg_l_min * dt;
    // Oxygen demand from biomass
    const bodRemoved_mg_l = Math.max(0, influent.bod_mg_l - this.bod_mg_l);
    const o2DemandBod = O2_PER_BOD * bodRemoved_mg_l * dtDays;
    const nh3Removed_mg_l = Math.max(0, influent.nh3_mg_l - this.nh3_mg_l);
    const o2DemandNh3 = O2_PER_NH3 * nh3Removed_mg_l * dtDays;
    // Endogenous respiration
    const o2Endogenous = DECAY_RATE * this.mlvss_mg_l * dtDays * 0.2;

    this.do_mg_l = clamp(
      this.do_mg_l + o2Transfer - o2DemandBod - o2DemandNh3 - o2Endogenous,
      0,
      12
    );

    // ── BOD removal (Monod kinetics) ──
    const muBod = MU_MAX * tempFactor
      * (this.bod_mg_l / (KS_BOD + this.bod_mg_l))
      * (this.do_mg_l / (KO_DO + this.do_mg_l));

    const bodConsumed = muBod * this.mlvss_mg_l / YIELD * dtDays;
    // Mix influent with tank contents (CSTR model)
    const hrt_days = (this.volume_gal / 7.48) / (influent.flow_mgd * 1e6 / 7.48) / 1;
    const mixFraction = clamp(dtDays / Math.max(hrt_days, 0.001), 0, 1);

    this.bod_mg_l = clamp(
      this.bod_mg_l * (1 - mixFraction) + influent.bod_mg_l * mixFraction - bodConsumed,
      0,
      1000
    );

    // ── Nitrification ──
    const muNh3 = MU_MAX_NITRIFIERS * tempFactor
      * (this.nh3_mg_l / (KS_NH3 + this.nh3_mg_l))
      * (this.do_mg_l / (KO_NITRIFIERS + this.do_mg_l));

    const nh3Consumed = muNh3 * this.mlvss_mg_l * 0.05 * dtDays; // nitrifiers are small fraction
    this.nh3_mg_l = clamp(
      this.nh3_mg_l * (1 - mixFraction) + influent.nh3_mg_l * mixFraction - nh3Consumed,
      0,
      100
    );
    this.no3_mg_l = clamp(
      this.no3_mg_l * (1 - mixFraction) + influent.no3_mg_l * mixFraction + nh3Consumed,
      0,
      100
    );

    // ── Biomass dynamics ──
    const growth = muBod * this.mlvss_mg_l * dtDays;
    const nitrifierGrowth = muNh3 * NITRIFIER_YIELD * this.mlvss_mg_l * 0.05 * dtDays;
    const decay = DECAY_RATE * this.mlvss_mg_l * dtDays;
    const wasFlow_mgd = wasRate * influent.flow_mgd;
    // Volumetric wasting: Q_was * X / V (removes biomass proportional to concentration)
    const wastingLoss = (wasFlow_mgd * 1e6 / this.volume_gal) * this.mlvss_mg_l * dtDays;

    this.mlvss_mg_l = clamp(
      this.mlvss_mg_l + growth + nitrifierGrowth - decay - wastingLoss,
      50,
      15000
    );
    this.mlss_mg_l = this.mlvss_mg_l / 0.8;

    // ── Calculate SRT and F:M ──
    const solidsInventory = massLoading(this.mlss_mg_l, this.volume_gal / 1e6);
    const solidsWasted = massLoading(this.mlss_mg_l, wasFlow_mgd);
    this.srt_days = solidsWasted > 0 ? solidsInventory / solidsWasted : 999;
    const bodLoading = massLoading(influent.bod_mg_l, influent.flow_mgd);
    const mlvssInventory = massLoading(this.mlvss_mg_l, this.volume_gal / 1e6);
    this.fm_ratio = mlvssInventory > 0 ? bodLoading / mlvssInventory : 0;

    // ── Build effluent ──
    const effluent = cloneStream(influent);
    effluent.bod_mg_l = this.bod_mg_l;
    effluent.nh3_mg_l = this.nh3_mg_l;
    effluent.no3_mg_l = this.no3_mg_l;
    effluent.do_mg_l = this.do_mg_l;
    effluent.tss_mg_l = this.mlss_mg_l; // mixed liquor goes to clarifier
    effluent.temperature_c = this.temperature_c;
    effluent.tp_mg_l = influent.tp_mg_l * 0.7; // biological P uptake

    // ── WAS stream ──
    const sludge = cloneStream(effluent);
    sludge.flow_mgd = wasFlow_mgd;
    sludge.tss_mg_l = this.mlss_mg_l;

    // ── Alarms ──
    this.alarms = [];
    if (this.do_mg_l < 0.5) {
      this.alarms.push({
        id: 'low_do', processId: this.id, severity: 'critical',
        message: `DO critically low: ${this.do_mg_l.toFixed(1)} mg/L`,
        timestamp: Date.now(), acknowledged: false,
      });
    } else if (this.do_mg_l < 1.5) {
      this.alarms.push({
        id: 'low_do_warn', processId: this.id, severity: 'warning',
        message: `DO low: ${this.do_mg_l.toFixed(1)} mg/L`,
        timestamp: Date.now(), acknowledged: false,
      });
    }
    if (this.mlss_mg_l > 5000) {
      this.alarms.push({
        id: 'high_mlss', processId: this.id, severity: 'warning',
        message: `MLSS high: ${this.mlss_mg_l.toFixed(0)} mg/L - increase WAS`,
        timestamp: Date.now(), acknowledged: false,
      });
    }
    if (this.mlss_mg_l < 1000) {
      this.alarms.push({
        id: 'low_mlss', processId: this.id, severity: 'warning',
        message: `MLSS low: ${this.mlss_mg_l.toFixed(0)} mg/L - reduce WAS`,
        timestamp: Date.now(), acknowledged: false,
      });
    }

    // Power: blowers are the big draw
    const powerDemand_kw = blowerSpeed * this.blowerPower_hp * 0.7457 * this.blowerCount;

    return { effluent, sludge, powerDemand_kw, chemicalCosts_per_day: 0, alarms: this.alarms };
  }

  getStatus(): ProcessStatus {
    return {
      id: this.id,
      type: this.type,
      healthy: this.do_mg_l >= 1.0 && this.mlss_mg_l >= 1000 && this.mlss_mg_l <= 5000,
      parameters: {
        mlss_mg_l: this.mlss_mg_l,
        mlvss_mg_l: this.mlvss_mg_l,
        do_mg_l: this.do_mg_l,
        bod_mg_l: this.bod_mg_l,
        nh3_mg_l: this.nh3_mg_l,
        no3_mg_l: this.no3_mg_l,
        srt_days: this.srt_days,
        fm_ratio: this.fm_ratio,
        temperature_c: this.temperature_c,
      },
      alarms: this.alarms,
    };
  }

  getState(): Record<string, number> {
    return {
      mlss_mg_l: this.mlss_mg_l,
      mlvss_mg_l: this.mlvss_mg_l,
      do_mg_l: this.do_mg_l,
      bod_mg_l: this.bod_mg_l,
      nh3_mg_l: this.nh3_mg_l,
      no3_mg_l: this.no3_mg_l,
      srt_days: this.srt_days,
      fm_ratio: this.fm_ratio,
    };
  }
}
