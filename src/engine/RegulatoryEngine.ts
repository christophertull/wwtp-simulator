import type { WaterStream, Violation, PermitLimits, Alarm } from './types';

export type EscalationLevel = 'compliant' | 'warning_letter' | 'notice_of_violation' | 'consent_order' | 'closure_risk';

export interface RegulatoryState {
  violations: Violation[];
  violationCount30Day: number;
  violationCountTotal: number;
  escalationLevel: EscalationLevel;
  finesPending: number;
  finesTotal: number;
  inspectionActive: boolean;
  lastInspection: number | null;
  inspectionFindings: string[];
  complianceStreak_days: number; // consecutive days in compliance
}

const FINE_PER_VIOLATION = 10_000;
const FINE_ESCALATION = 1.5;
const ESCALATION_THRESHOLDS: [number, EscalationLevel][] = [
  [1, 'warning_letter'],
  [3, 'notice_of_violation'],
  [6, 'consent_order'],
  [12, 'closure_risk'],
];

export class RegulatoryEngine {
  private state: RegulatoryState;
  private permit: PermitLimits;
  private violationLog: Violation[] = [];
  private dailyEffluentSamples: WaterStream[] = [];
  private lastDayChecked = -1;

  constructor(permit: PermitLimits) {
    this.permit = permit;
    this.state = {
      violations: [],
      violationCount30Day: 0,
      violationCountTotal: 0,
      escalationLevel: 'compliant',
      finesPending: 0,
      finesTotal: 0,
      inspectionActive: false,
      lastInspection: null,
      inspectionFindings: [],
      complianceStreak_days: 0,
    };
  }

  /** Check effluent against permit limits. Call each tick. */
  checkCompliance(
    effluent: WaterStream,
    gameTimeMs: number,
    inspectionActive: boolean,
  ): { violations: Violation[]; alarms: Alarm[]; fines: number } {
    const violations: Violation[] = [];
    const alarms: Alarm[] = [];
    let fines = 0;
    const ts = gameTimeMs;

    // Daily max checks (checked every tick, but only counted once per day)
    const gameDay = Math.floor(gameTimeMs / 86_400_000);

    if (effluent.bod_mg_l > this.permit.bod_mg_l.daily_max) {
      violations.push({ parameter: 'BOD', limit: this.permit.bod_mg_l.daily_max, actual: effluent.bod_mg_l, timestamp: ts });
    }
    if (effluent.tss_mg_l > this.permit.tss_mg_l.daily_max) {
      violations.push({ parameter: 'TSS', limit: this.permit.tss_mg_l.daily_max, actual: effluent.tss_mg_l, timestamp: ts });
    }

    // NH3 limit depends on season (summer = stricter)
    const month = new Date(gameTimeMs).getMonth();
    const isSummer = month >= 4 && month <= 9; // May-October
    const nh3Limit = isSummer ? this.permit.nh3_mg_l.monthly_avg_summer : this.permit.nh3_mg_l.monthly_avg_winter;
    if (effluent.nh3_mg_l > nh3Limit * 2.5) { // daily spike check (2.5x monthly limit)
      violations.push({ parameter: 'NH3-N', limit: nh3Limit * 2.5, actual: effluent.nh3_mg_l, timestamp: ts });
    }

    if (effluent.ph < this.permit.ph.min) {
      violations.push({ parameter: 'pH (low)', limit: this.permit.ph.min, actual: effluent.ph, timestamp: ts });
    }
    if (effluent.ph > this.permit.ph.max) {
      violations.push({ parameter: 'pH (high)', limit: this.permit.ph.max, actual: effluent.ph, timestamp: ts });
    }
    if (effluent.chlorine_residual_mg_l > this.permit.chlorine_residual_mg_l.daily_max) {
      violations.push({ parameter: 'Cl2 Residual', limit: this.permit.chlorine_residual_mg_l.daily_max, actual: effluent.chlorine_residual_mg_l, timestamp: ts });
    }

    // Record violations (only count new ones per day to avoid spamming)
    if (violations.length > 0 && gameDay !== this.lastDayChecked) {
      this.lastDayChecked = gameDay;
      this.violationLog.push(...violations);
      this.state.violationCountTotal += violations.length;
      this.state.complianceStreak_days = 0;

      // Calculate fines with escalation
      const escalationMultiplier = Math.pow(FINE_ESCALATION, Math.min(this.state.violationCount30Day, 10));
      fines = violations.length * FINE_PER_VIOLATION * escalationMultiplier;
      this.state.finesPending += fines;
      this.state.finesTotal += fines;

      for (const v of violations) {
        alarms.push({
          id: `violation_${v.parameter}_${ts}`,
          processId: 'regulatory',
          severity: 'critical',
          message: `PERMIT VIOLATION: ${v.parameter} = ${v.actual.toFixed(2)} (limit: ${v.limit}) — Fine: $${(fines / violations.length).toFixed(0)}`,
          timestamp: ts,
          acknowledged: false,
        });
      }
    } else if (violations.length === 0 && gameDay !== this.lastDayChecked) {
      this.lastDayChecked = gameDay;
      this.state.complianceStreak_days++;
    }

    // Update 30-day rolling violation count
    const thirtyDaysAgo = gameTimeMs - 30 * 86_400_000;
    this.state.violationCount30Day = this.violationLog.filter((v) => v.timestamp > thirtyDaysAgo).length;

    // Update escalation level
    this.state.escalationLevel = 'compliant';
    for (const [threshold, level] of ESCALATION_THRESHOLDS) {
      if (this.state.violationCount30Day >= threshold) {
        this.state.escalationLevel = level;
      }
    }

    // Escalation alarms
    if (this.state.escalationLevel === 'consent_order' && violations.length > 0) {
      alarms.push({
        id: `escalation_${ts}`,
        processId: 'regulatory',
        severity: 'critical',
        message: 'CONSENT ORDER: Continued violations may result in plant closure.',
        timestamp: ts,
        acknowledged: false,
      });
    }

    // Inspection effects
    this.state.inspectionActive = inspectionActive;
    if (inspectionActive && violations.length > 0) {
      this.state.inspectionFindings.push(
        ...violations.map((v) => `${v.parameter}: ${v.actual.toFixed(2)} exceeded limit ${v.limit}`)
      );
    }

    this.state.violations = violations;

    return { violations, alarms, fines };
  }

  collectFines(): number {
    const fines = this.state.finesPending;
    this.state.finesPending = 0;
    return fines;
  }

  getState(): RegulatoryState {
    return {
      ...this.state,
      violations: [...this.state.violations],
      inspectionFindings: [...this.state.inspectionFindings],
    };
  }
}
