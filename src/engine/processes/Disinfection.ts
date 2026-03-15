import type {
  ProcessModel, WaterStream, ControlInputs,
  ProcessOutput, ProcessStatus, Alarm,
} from '../types';
import { ProcessType, cloneStream } from '../types';
import { clamp } from '../../utils/units';

const CHLORINE_COST_PER_LB = 0.50;
const BISULFITE_COST_PER_LB = 0.40;

export class Disinfection implements ProcessModel {
  id = 'disinfection';
  type = ProcessType.DISINFECTION;

  private contactTime_min = 30;
  private ct_achieved = 0;
  private residualPreDechlor = 0;
  private residualFinal = 0;
  private alarms: Alarm[] = [];

  update(dt: number, influent: WaterStream, controls: ControlInputs): ProcessOutput {
    const chlorineDose_mg_l = clamp((controls.chlorineDose as number) ?? 2.0, 0, 15);
    const bisulfiteDose_mg_l = clamp((controls.bisulfiteDose as number) ?? 0.8, 0, 10);

    // Chlorine demand: BOD and TSS exert demand, plus small base from dissolved organics
    const baseDemand = 0.5;
    const chlorineDemand = influent.bod_mg_l * 0.05 + influent.tss_mg_l * 0.02 + baseDemand;

    // Residual after contact chamber (before dechlorination)
    this.residualPreDechlor = clamp(chlorineDose_mg_l - chlorineDemand, 0, chlorineDose_mg_l);

    // CT calculated from pre-dechlorination residual
    this.ct_achieved = this.residualPreDechlor * this.contactTime_min;

    // Dechlorination: bisulfite neutralizes chlorine (~1 mg bisulfite per mg Cl2)
    const dechlorCapacity = bisulfiteDose_mg_l * 0.9; // 90% efficiency
    this.residualFinal = clamp(this.residualPreDechlor - dechlorCapacity, 0, this.residualPreDechlor);

    const effluent = cloneStream(influent);
    effluent.chlorine_residual_mg_l = this.residualFinal;

    // Chemical costs
    const chlorineUsed_lb_day = chlorineDose_mg_l * influent.flow_mgd * 8.34;
    const bisulfiteUsed_lb_day = bisulfiteDose_mg_l * influent.flow_mgd * 8.34;
    const chemicalCosts_per_day = chlorineUsed_lb_day * CHLORINE_COST_PER_LB
      + bisulfiteUsed_lb_day * BISULFITE_COST_PER_LB;

    // Alarms
    this.alarms = [];
    if (this.ct_achieved < 20) {
      this.alarms.push({
        id: 'low_ct',
        processId: this.id,
        severity: 'critical',
        message: `CT value ${this.ct_achieved.toFixed(1)} below minimum 20 mg-min/L`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    } else if (this.ct_achieved < 30) {
      this.alarms.push({
        id: 'low_ct_warn',
        processId: this.id,
        severity: 'warning',
        message: `CT value ${this.ct_achieved.toFixed(1)} — target ≥30 mg-min/L`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }
    if (this.residualFinal > 0.1) {
      this.alarms.push({
        id: 'high_residual',
        processId: this.id,
        severity: 'warning',
        message: `Chlorine residual ${this.residualFinal.toFixed(2)} mg/L exceeds permit (0.1). Increase bisulfite.`,
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
      healthy: this.ct_achieved >= 20 && this.residualFinal <= 0.1,
      parameters: {
        ct_achieved: this.ct_achieved,
        residual_pre_dechlor: this.residualPreDechlor,
        residual_final: this.residualFinal,
      },
      alarms: this.alarms,
    };
  }

  getState(): Record<string, number> {
    return {
      ct_achieved: this.ct_achieved,
      residual_pre_dechlor: this.residualPreDechlor,
      residual_final: this.residualFinal,
    };
  }
}
