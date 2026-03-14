import type {
  ProcessModel, WaterStream, ControlInputs,
  ProcessOutput, ProcessStatus, Alarm,
} from '../types';
import { ProcessType, cloneStream } from '../types';
import { clamp, interpolate } from '../../utils/units';

// TSS removal as function of Surface Overflow Rate (gpd/ft²)
// Lower SOR = longer settling = better removal
const TSS_REMOVAL_CURVE: [number, number][] = [
  [400, 0.72],
  [600, 0.68],
  [800, 0.63],
  [1000, 0.58],
  [1200, 0.52],
  [1500, 0.45],
  [2000, 0.35],
  [3000, 0.20],
];

export class PrimaryClarifier implements ProcessModel {
  id = 'primary_clarifier';
  type = ProcessType.PRIMARY_CLARIFIER;

  private surfaceArea_sqft: number;
  private depth_ft: number;
  private count: number;
  private sludgeBlanketDepth_ft = 1.0; // starts at 1 ft
  private maxBlanketDepth_ft: number;
  private alarms: Alarm[] = [];

  constructor(config: { count: number; surface_area_sqft: number; depth_ft: number }) {
    this.count = config.count;
    this.surfaceArea_sqft = config.surface_area_sqft;
    this.depth_ft = config.depth_ft;
    this.maxBlanketDepth_ft = config.depth_ft * 0.5; // blanket shouldn't exceed half depth
  }

  update(dt: number, influent: WaterStream, controls: ControlInputs): ProcessOutput {
    const sludgePumpRate = (controls.sludgePumpRate as number) ?? 0.5; // fraction of max
    const dtHours = dt / 60;

    const totalArea = this.surfaceArea_sqft * this.count;
    // SOR in gpd/ft² = flow (gpd) / area (ft²)
    const flowGpd = influent.flow_mgd * 1_000_000;
    const sor = flowGpd / totalArea;

    // TSS removal from curve
    const tssRemovalFraction = interpolate(TSS_REMOVAL_CURVE, sor);
    // BOD removal ~ 50% of TSS removal (particulate BOD settles with solids)
    const bodRemovalFraction = tssRemovalFraction * 0.5;

    // Sludge blanket dynamics
    const settledSolids_ft = (influent.tss_mg_l * tssRemovalFraction * 0.0001) * dtHours;
    const wastedSolids_ft = sludgePumpRate * 0.3 * dtHours;
    this.sludgeBlanketDepth_ft = clamp(
      this.sludgeBlanketDepth_ft + settledSolids_ft - wastedSolids_ft,
      0,
      this.depth_ft
    );

    // Solids washover if blanket too high
    let washoverFactor = 0;
    if (this.sludgeBlanketDepth_ft > this.maxBlanketDepth_ft) {
      washoverFactor = (this.sludgeBlanketDepth_ft - this.maxBlanketDepth_ft) / this.depth_ft;
    }

    const effluent = cloneStream(influent);
    const effectiveTssRemoval = tssRemovalFraction * (1 - washoverFactor);
    effluent.tss_mg_l *= (1 - effectiveTssRemoval);
    effluent.bod_mg_l *= (1 - bodRemovalFraction * (1 - washoverFactor));
    // Primary clarifier doesn't significantly affect nutrients
    effluent.tp_mg_l *= 0.95; // small amount settles

    // Generate sludge stream
    const sludge = cloneStream(influent);
    sludge.flow_mgd = influent.flow_mgd * 0.02 * sludgePumpRate;
    sludge.tss_mg_l = influent.tss_mg_l * tssRemovalFraction / (0.02 * Math.max(sludgePumpRate, 0.01));

    // Alarms
    this.alarms = [];
    if (this.sludgeBlanketDepth_ft > this.maxBlanketDepth_ft) {
      this.alarms.push({
        id: 'blanket_high',
        processId: this.id,
        severity: 'critical',
        message: `Sludge blanket at ${this.sludgeBlanketDepth_ft.toFixed(1)} ft - solids washover!`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    } else if (this.sludgeBlanketDepth_ft > this.maxBlanketDepth_ft * 0.7) {
      this.alarms.push({
        id: 'blanket_warn',
        processId: this.id,
        severity: 'warning',
        message: `Sludge blanket rising: ${this.sludgeBlanketDepth_ft.toFixed(1)} ft`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }

    const powerDemand_kw = 2 * this.count; // scrapers and pumps

    return { effluent, sludge, powerDemand_kw, chemicalCosts_per_day: 0, alarms: this.alarms };
  }

  getStatus(): ProcessStatus {
    return {
      id: this.id,
      type: this.type,
      healthy: this.sludgeBlanketDepth_ft < this.maxBlanketDepth_ft,
      parameters: {
        sludgeBlanketDepth_ft: this.sludgeBlanketDepth_ft,
        maxBlanketDepth_ft: this.maxBlanketDepth_ft,
      },
      alarms: this.alarms,
    };
  }

  getState(): Record<string, number> {
    return {
      sludgeBlanketDepth_ft: this.sludgeBlanketDepth_ft,
    };
  }
}
