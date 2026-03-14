import type {
  ProcessModel, WaterStream, ControlInputs,
  ProcessOutput, ProcessStatus, Alarm,
} from '../types';
import { ProcessType, cloneStream } from '../types';
import { clamp, interpolate } from '../../utils/units';

// Settling velocity as function of MLSS (higher MLSS = slower settling)
const SETTLING_CURVE: [number, number][] = [
  [1000, 0.95],
  [2000, 0.92],
  [3000, 0.88],
  [4000, 0.82],
  [5000, 0.72],
  [7000, 0.55],
  [10000, 0.30],
];

export class SecondaryClarifier implements ProcessModel {
  id = 'secondary_clarifier';
  type = ProcessType.SECONDARY_CLARIFIER;

  private surfaceArea_sqft: number;
  private depth_ft: number;
  private count: number;
  private blanketDepth_ft = 2.0;
  private svi = 120; // Sludge Volume Index (mL/g) - measure of settleability
  private alarms: Alarm[] = [];

  constructor(config: { count: number; surface_area_sqft: number; depth_ft: number }) {
    this.count = config.count;
    this.surfaceArea_sqft = config.surface_area_sqft;
    this.depth_ft = config.depth_ft;
  }

  update(dt: number, influent: WaterStream, controls: ControlInputs): ProcessOutput {
    const rasRate = clamp((controls.rasRate as number) ?? 0.5, 0, 1.5);
    const dtHours = dt / 60;
    const dtDays = dt / (60 * 24);

    const totalArea = this.surfaceArea_sqft * this.count;
    const flowGpd = influent.flow_mgd * 1_000_000;
    const sor = flowGpd / totalArea;

    // SVI affects settling - higher SVI = poorer settling (bulking sludge)
    const sviPenalty = clamp(this.svi / 150, 0.5, 2.0);

    // Base settling efficiency from MLSS concentration
    const baseSettling = interpolate(SETTLING_CURVE, influent.tss_mg_l);
    // Hydraulic overload penalty
    const hydraulicFactor = clamp(1 - (sor - 800) / 2000, 0.3, 1.0);
    const settlingEfficiency = baseSettling * hydraulicFactor / sviPenalty;

    // Blanket dynamics
    const solidsSetting = influent.tss_mg_l * settlingEfficiency * 0.0001 * dtHours;
    const solidsRemoved = rasRate * 0.4 * dtHours; // RAS removes settled solids
    this.blanketDepth_ft = clamp(
      this.blanketDepth_ft + solidsSetting - solidsRemoved,
      0.5,
      this.depth_ft
    );

    const maxBlanket = this.depth_ft * 0.4;
    let washoverFactor = 0;
    if (this.blanketDepth_ft > maxBlanket) {
      washoverFactor = clamp((this.blanketDepth_ft - maxBlanket) / (this.depth_ft - maxBlanket), 0, 1);
    }

    // Effluent quality
    const effluent = cloneStream(influent);
    const effectiveRemoval = settlingEfficiency * (1 - washoverFactor);
    effluent.tss_mg_l = influent.tss_mg_l * (1 - effectiveRemoval);
    // BOD in effluent is soluble BOD + particulate BOD from unsettled solids
    effluent.bod_mg_l = influent.bod_mg_l * 0.3 + influent.bod_mg_l * 0.7 * (1 - effectiveRemoval);
    // Nutrients pass through (clarifier doesn't remove dissolved species)
    effluent.flow_mgd = influent.flow_mgd; // effluent flow

    // RAS stream (concentrated sludge returned to aeration)
    const ras = cloneStream(influent);
    ras.flow_mgd = influent.flow_mgd * rasRate;
    ras.tss_mg_l = influent.tss_mg_l * settlingEfficiency / Math.max(rasRate, 0.1);

    // Alarms
    this.alarms = [];
    if (this.blanketDepth_ft > maxBlanket) {
      this.alarms.push({
        id: 'blanket_high',
        processId: this.id,
        severity: 'critical',
        message: `Clarifier blanket at ${this.blanketDepth_ft.toFixed(1)} ft - solids in effluent!`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }
    if (effluent.tss_mg_l > 30) {
      this.alarms.push({
        id: 'high_eff_tss',
        processId: this.id,
        severity: 'warning',
        message: `Effluent TSS: ${effluent.tss_mg_l.toFixed(0)} mg/L (permit limit: 30)`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }
    if (this.svi > 200) {
      this.alarms.push({
        id: 'bulking',
        processId: this.id,
        severity: 'warning',
        message: `SVI at ${this.svi.toFixed(0)} mL/g - sludge bulking!`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }

    const powerDemand_kw = 3 * this.count; // scrapers

    return { effluent, sludge: ras, powerDemand_kw, chemicalCosts_per_day: 0, alarms: this.alarms };
  }

  /** Update SVI from aeration tank conditions (called externally) */
  updateSVI(srt_days: number, fm_ratio: number) {
    // Filamentous bulking at high SRT / low F:M
    if (srt_days > 15 && fm_ratio < 0.05) {
      this.svi = clamp(this.svi + 2, 100, 400);
    } else if (srt_days > 10 && fm_ratio < 0.1) {
      this.svi = clamp(this.svi + 0.5, 100, 300);
    } else {
      // Recovery toward normal
      this.svi = clamp(this.svi - 1, 80, 400);
    }
  }

  getStatus(): ProcessStatus {
    return {
      id: this.id,
      type: this.type,
      healthy: this.blanketDepth_ft < this.depth_ft * 0.4 && this.svi < 200,
      parameters: {
        blanketDepth_ft: this.blanketDepth_ft,
        svi: this.svi,
      },
      alarms: this.alarms,
    };
  }

  getState(): Record<string, number> {
    return {
      blanketDepth_ft: this.blanketDepth_ft,
      svi: this.svi,
    };
  }
}
