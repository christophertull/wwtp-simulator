import type {
  ProcessModel, WaterStream, ControlInputs,
  ProcessOutput, ProcessStatus, Alarm,
} from '../types';
import { ProcessType, cloneStream } from '../types';
import { clamp } from '../../utils/units';

export class PreliminaryTreatment implements ProcessModel {
  id = 'preliminary';
  type = ProcessType.SCREENING;

  private barSpacingMm = 6;
  private blindingLevel = 0; // 0-1, fraction of screen blocked
  private blindingRatePerHour = 0.02;
  private alarms: Alarm[] = [];

  update(dt: number, influent: WaterStream, controls: ControlInputs): ProcessOutput {
    const rakeSpeed = (controls.rakeSpeed as number) ?? 5; // cycles/min
    const dtHours = dt / 60;

    // Screen blinding accumulates, raking clears it
    const blindingIncrease = this.blindingRatePerHour * dtHours * (influent.tss_mg_l / 250);
    const rakingClearance = rakeSpeed * 0.01 * dtHours;
    this.blindingLevel = clamp(this.blindingLevel + blindingIncrease - rakingClearance, 0, 1);

    // If blinding > 0.8, flow restriction and alarm
    this.alarms = [];
    if (this.blindingLevel > 0.8) {
      this.alarms.push({
        id: 'screen_blinding',
        processId: this.id,
        severity: 'critical',
        message: `Screen blinding at ${(this.blindingLevel * 100).toFixed(0)}% - overflow risk!`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    } else if (this.blindingLevel > 0.5) {
      this.alarms.push({
        id: 'screen_blinding_warn',
        processId: this.id,
        severity: 'warning',
        message: `Screen blinding at ${(this.blindingLevel * 100).toFixed(0)}%`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }

    const effluent = cloneStream(influent);
    // Screening removes large solids (modeled as small TSS reduction)
    const screenEfficiency = (1 - this.blindingLevel) * 0.05;
    effluent.tss_mg_l *= (1 - screenEfficiency);
    // Grit removal (simplified - removes some TSS)
    effluent.tss_mg_l *= 0.95;

    // Flow reduction if severely blinded
    if (this.blindingLevel > 0.9) {
      effluent.flow_mgd *= 0.7;
    }

    const powerDemand_kw = rakeSpeed * 0.5; // small power draw

    return { effluent, powerDemand_kw, chemicalCosts_per_day: 0, alarms: this.alarms };
  }

  getStatus(): ProcessStatus {
    return {
      id: this.id,
      type: this.type,
      healthy: this.blindingLevel < 0.5,
      parameters: { blindingLevel: this.blindingLevel },
      alarms: this.alarms,
    };
  }

  getState(): Record<string, number> {
    return { blindingLevel: this.blindingLevel };
  }
}
