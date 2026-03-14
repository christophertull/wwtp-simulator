import type {
  ProcessModel, WaterStream, ControlInputs,
  ProcessOutput, ProcessStatus, Alarm,
} from '../types';
import { ProcessType, cloneStream } from '../types';
import { clamp } from '../../utils/units';

const CHLORINE_COST_PER_LB = 0.50;

export class Disinfection implements ProcessModel {
  id = 'disinfection';
  type = ProcessType.DISINFECTION;

  private contactTime_min = 30;
  private ct_achieved = 0;
  private alarms: Alarm[] = [];

  update(dt: number, influent: WaterStream, controls: ControlInputs): ProcessOutput {
    const chlorineDose_mg_l = clamp((controls.chlorineDose as number) ?? 3.0, 0, 15);

    // CT = Concentration × Time
    // Chlorine demand from remaining BOD/TSS
    const chlorineDemand = influent.bod_mg_l * 0.05 + influent.tss_mg_l * 0.02;
    const residual = clamp(chlorineDose_mg_l - chlorineDemand, 0, chlorineDose_mg_l);
    this.ct_achieved = residual * this.contactTime_min;

    const effluent = cloneStream(influent);
    effluent.chlorine_residual_mg_l = residual;

    // Chemical cost
    const chlorineUsed_lb_day = chlorineDose_mg_l * influent.flow_mgd * 8.34;
    const chemicalCosts_per_day = chlorineUsed_lb_day * CHLORINE_COST_PER_LB;

    this.alarms = [];
    // Target CT for adequate disinfection: ~450 mg-min/L
    if (this.ct_achieved < 450) {
      this.alarms.push({
        id: 'low_ct',
        processId: this.id,
        severity: 'warning',
        message: `CT value ${this.ct_achieved.toFixed(0)} below target 450 mg-min/L`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }
    if (residual > 0.1) {
      this.alarms.push({
        id: 'high_residual',
        processId: this.id,
        severity: 'warning',
        message: `Chlorine residual ${residual.toFixed(2)} mg/L exceeds permit limit (0.1)`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }

    return { effluent, powerDemand_kw: 1, chemicalCosts_per_day, alarms: this.alarms };
  }

  getStatus(): ProcessStatus {
    return {
      id: this.id,
      type: this.type,
      healthy: this.ct_achieved >= 450,
      parameters: { ct_achieved: this.ct_achieved },
      alarms: this.alarms,
    };
  }

  getState(): Record<string, number> {
    return { ct_achieved: this.ct_achieved };
  }
}
