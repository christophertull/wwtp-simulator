import type { Alarm } from './types';
import { rng } from '../utils/random';
import { clamp } from '../utils/units';

export interface Equipment {
  id: string;
  name: string;
  processId: string;
  type: 'blower' | 'pump' | 'scraper' | 'mixer' | 'uv_bank' | 'chemical_feed';
  condition: number;          // 0-100
  running: boolean;
  power_kw: number;
  degradationRate: number;    // condition loss per day when running
  maintenanceInterval_days: number;
  maintenanceCost: number;
  lastMaintenance: number;    // game time ms
  failureProbability: number; // base probability per day, scales with condition
  failed: boolean;
  repairCost: number;
  repairTime_days: number;
  repairStarted: number | null;
}

export class EquipmentManager {
  private equipment: Equipment[] = [];
  private alarms: Alarm[] = [];

  constructor(plantConfig: {
    blowerCount: number;
    blowerPower_hp: number;
    processIds: string[];
  }) {
    const blowerKw = plantConfig.blowerPower_hp * 0.7457;

    // Create blowers
    for (let i = 0; i < plantConfig.blowerCount; i++) {
      this.equipment.push({
        id: `blower_${i + 1}`,
        name: `Blower #${i + 1}`,
        processId: 'aerationTank',
        type: 'blower',
        condition: 95 + rng().range(-5, 5),
        running: i < plantConfig.blowerCount - 1, // last one is standby
        power_kw: blowerKw,
        degradationRate: 0.15,
        maintenanceInterval_days: 90,
        maintenanceCost: 2500,
        lastMaintenance: 0,
        failureProbability: 0.002,
        failed: false,
        repairCost: 15000,
        repairTime_days: 3,
        repairStarted: null,
      });
    }

    // Primary clarifier scraper
    this.equipment.push({
      id: 'primary_scraper',
      name: 'Primary Clarifier Scraper',
      processId: 'primaryClarifier',
      type: 'scraper',
      condition: 90,
      running: true,
      power_kw: 2,
      degradationRate: 0.08,
      maintenanceInterval_days: 180,
      maintenanceCost: 3000,
      lastMaintenance: 0,
      failureProbability: 0.001,
      failed: false,
      repairCost: 8000,
      repairTime_days: 2,
      repairStarted: null,
    });

    // RAS pump
    this.equipment.push({
      id: 'ras_pump',
      name: 'RAS Pump',
      processId: 'secondaryClarifier',
      type: 'pump',
      condition: 92,
      running: true,
      power_kw: 15,
      degradationRate: 0.12,
      maintenanceInterval_days: 120,
      maintenanceCost: 2000,
      lastMaintenance: 0,
      failureProbability: 0.002,
      failed: false,
      repairCost: 10000,
      repairTime_days: 2,
      repairStarted: null,
    });

    // WAS pump
    this.equipment.push({
      id: 'was_pump',
      name: 'WAS Pump',
      processId: 'secondaryClarifier',
      type: 'pump',
      condition: 88,
      running: true,
      power_kw: 10,
      degradationRate: 0.10,
      maintenanceInterval_days: 120,
      maintenanceCost: 1800,
      lastMaintenance: 0,
      failureProbability: 0.002,
      failed: false,
      repairCost: 8000,
      repairTime_days: 1,
      repairStarted: null,
    });

    // Digester mixer
    this.equipment.push({
      id: 'digester_mixer',
      name: 'Digester Mixer',
      processId: 'sludgeDigester',
      type: 'mixer',
      condition: 85,
      running: true,
      power_kw: 15,
      degradationRate: 0.10,
      maintenanceInterval_days: 180,
      maintenanceCost: 4000,
      lastMaintenance: 0,
      failureProbability: 0.001,
      failed: false,
      repairCost: 12000,
      repairTime_days: 5,
      repairStarted: null,
    });

    // Chlorine feed pump
    this.equipment.push({
      id: 'chlorine_feed',
      name: 'Chlorine Feed Pump',
      processId: 'disinfection',
      type: 'chemical_feed',
      condition: 90,
      running: true,
      power_kw: 1,
      degradationRate: 0.10,
      maintenanceInterval_days: 90,
      maintenanceCost: 500,
      lastMaintenance: 0,
      failureProbability: 0.003,
      failed: false,
      repairCost: 3000,
      repairTime_days: 1,
      repairStarted: null,
    });
  }

  update(dtMinutes: number, gameTimeMs: number): {
    alarms: Alarm[];
    maintenanceCost: number;
    failedEquipment: string[];
  } {
    const dtDays = dtMinutes / (60 * 24);
    this.alarms = [];
    let maintenanceCost = 0;
    const failedEquipment: string[] = [];

    for (const eq of this.equipment) {
      // Check if repair is complete
      if (eq.failed && eq.repairStarted !== null) {
        const repairElapsed = (gameTimeMs - eq.repairStarted) / (86_400_000);
        if (repairElapsed >= eq.repairTime_days) {
          eq.failed = false;
          eq.repairStarted = null;
          eq.condition = 80; // repaired but not new
          eq.running = true;
        }
      }

      if (eq.failed) {
        failedEquipment.push(eq.id);
        continue;
      }

      // Degradation when running
      if (eq.running) {
        eq.condition = clamp(eq.condition - eq.degradationRate * dtDays, 0, 100);
      }

      // Random failure - probability increases as condition drops
      if (eq.running && eq.condition < 50) {
        const failProb = eq.failureProbability * (2 - eq.condition / 50) * dtDays;
        if (rng().chance(failProb)) {
          eq.failed = true;
          eq.running = false;
          this.alarms.push({
            id: `${eq.id}_failure`,
            processId: eq.processId,
            severity: 'critical',
            message: `${eq.name} has FAILED! Repair needed ($${eq.repairCost.toLocaleString()})`,
            timestamp: gameTimeMs,
            acknowledged: false,
          });
        }
      }

      // Scheduled maintenance check
      const daysSinceMaintenance = (gameTimeMs - eq.lastMaintenance) / 86_400_000;
      if (daysSinceMaintenance > eq.maintenanceInterval_days && eq.condition < 70) {
        this.alarms.push({
          id: `${eq.id}_maintenance`,
          processId: eq.processId,
          severity: 'warning',
          message: `${eq.name} overdue for maintenance (condition: ${eq.condition.toFixed(0)}%)`,
          timestamp: gameTimeMs,
          acknowledged: false,
        });
      }

      // Low condition warning
      if (eq.condition < 30 && !eq.failed) {
        this.alarms.push({
          id: `${eq.id}_low_condition`,
          processId: eq.processId,
          severity: 'warning',
          message: `${eq.name} condition critical: ${eq.condition.toFixed(0)}%`,
          timestamp: gameTimeMs,
          acknowledged: false,
        });
      }
    }

    return { alarms: this.alarms, maintenanceCost, failedEquipment };
  }

  /** Perform maintenance on a piece of equipment */
  performMaintenance(equipmentId: string, gameTimeMs: number): { cost: number; success: boolean } {
    const eq = this.equipment.find((e) => e.id === equipmentId);
    if (!eq) return { cost: 0, success: false };

    eq.condition = clamp(eq.condition + 30, 0, 100);
    eq.lastMaintenance = gameTimeMs;
    return { cost: eq.maintenanceCost, success: true };
  }

  /** Start repairing a failed piece of equipment */
  startRepair(equipmentId: string, gameTimeMs: number): { cost: number; success: boolean } {
    const eq = this.equipment.find((e) => e.id === equipmentId);
    if (!eq || !eq.failed || eq.repairStarted !== null) return { cost: 0, success: false };

    eq.repairStarted = gameTimeMs;
    return { cost: eq.repairCost, success: true };
  }

  getEquipment(): Equipment[] {
    return this.equipment.map((e) => ({ ...e }));
  }

  getEquipmentByProcess(processId: string): Equipment[] {
    return this.equipment.filter((e) => e.processId === processId).map((e) => ({ ...e }));
  }

  getAlarms(): Alarm[] {
    return this.alarms;
  }
}
