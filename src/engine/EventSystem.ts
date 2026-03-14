import type { WaterStream, Alarm } from './types';
import { createEmptyStream } from './types';
import { rng } from '../utils/random';

export type EventType =
  | 'industrial_spill'
  | 'toxic_discharge'
  | 'ph_shock'
  | 'grease_slug'
  | 'inspection'
  | 'power_outage'
  | 'pipe_break'
  | 'public_complaint';

export interface GameEvent {
  id: string;
  type: EventType;
  name: string;
  description: string;
  startTime: number;
  duration_min: number;
  severity: 'minor' | 'moderate' | 'severe';
  active: boolean;
  resolved: boolean;
  effects: EventEffects;
}

export interface EventEffects {
  influentModifier?: Partial<WaterStream>;
  flowMultiplier?: number;
  equipmentFailure?: string;      // equipment id to force-fail
  inspectionActive?: boolean;
  powerOutage?: boolean;
}

interface EventTemplate {
  type: EventType;
  name: string;
  description: string;
  probabilityPerDay: number;
  durationRange_min: [number, number];
  severity: 'minor' | 'moderate' | 'severe';
  effects: (r: ReturnType<typeof rng>) => EventEffects;
}

const EVENT_TEMPLATES: EventTemplate[] = [
  {
    type: 'industrial_spill',
    name: 'Industrial BOD Spill',
    description: 'A food processing plant upstream discharged high-strength waste.',
    probabilityPerDay: 0.02,
    durationRange_min: [120, 480],
    severity: 'moderate',
    effects: () => ({
      influentModifier: { bod_mg_l: 600, tss_mg_l: 400 },
    }),
  },
  {
    type: 'toxic_discharge',
    name: 'Toxic Industrial Discharge',
    description: 'Unknown chemical discharge detected in the collection system. Your biology is at risk.',
    probabilityPerDay: 0.005,
    durationRange_min: [60, 240],
    severity: 'severe',
    effects: () => ({
      influentModifier: { toxicity: 0.6, ph: 4.5 },
    }),
  },
  {
    type: 'ph_shock',
    name: 'pH Shock',
    description: 'Concrete washout from a construction site is raising influent pH.',
    probabilityPerDay: 0.015,
    durationRange_min: [60, 360],
    severity: 'minor',
    effects: () => ({
      influentModifier: { ph: 9.5 },
    }),
  },
  {
    type: 'grease_slug',
    name: 'Grease Slug',
    description: 'A restaurant dumped a large amount of grease. Primary clarifier is struggling.',
    probabilityPerDay: 0.025,
    durationRange_min: [120, 360],
    severity: 'minor',
    effects: () => ({
      influentModifier: { bod_mg_l: 450, tss_mg_l: 350 },
      flowMultiplier: 0.95,
    }),
  },
  {
    type: 'inspection',
    name: 'Surprise Inspection',
    description: 'Regulatory inspector is on site. All parameters will be closely monitored for the next 8 hours.',
    probabilityPerDay: 0.01,
    durationRange_min: [480, 480],
    severity: 'moderate',
    effects: () => ({
      inspectionActive: true,
    }),
  },
  {
    type: 'power_outage',
    name: 'Partial Power Outage',
    description: 'A transformer blew. Running on backup power — reduced blower capacity.',
    probabilityPerDay: 0.008,
    durationRange_min: [30, 180],
    severity: 'severe',
    effects: () => ({
      powerOutage: true,
    }),
  },
  {
    type: 'public_complaint',
    name: 'Odor Complaint',
    description: 'Neighbors are complaining about odors. City council is watching.',
    probabilityPerDay: 0.03,
    durationRange_min: [1440, 1440], // lasts a day
    severity: 'minor',
    effects: () => ({}),
  },
];

export class EventSystem {
  private activeEvents: GameEvent[] = [];
  private eventHistory: GameEvent[] = [];
  private nextEventId = 1;

  update(dtMinutes: number, gameTimeMs: number): {
    events: GameEvent[];
    alarms: Alarm[];
    influentModifier: Partial<WaterStream> | null;
    flowMultiplier: number;
    inspectionActive: boolean;
    powerOutage: boolean;
  } {
    const dtDays = dtMinutes / (60 * 24);
    const alarms: Alarm[] = [];
    let combinedInfluentMod: Partial<WaterStream> | null = null;
    let flowMultiplier = 1.0;
    let inspectionActive = false;
    let powerOutage = false;

    // Check for expired events
    for (const event of this.activeEvents) {
      if (event.active) {
        const elapsed = gameTimeMs - event.startTime;
        if (elapsed > event.duration_min * 60 * 1000) {
          event.active = false;
          event.resolved = true;
          alarms.push({
            id: `event_end_${event.id}`,
            processId: 'events',
            severity: 'info',
            message: `Event resolved: ${event.name}`,
            timestamp: gameTimeMs,
            acknowledged: false,
          });
        }
      }
    }

    // Remove resolved events from active list
    this.activeEvents = this.activeEvents.filter((e) => e.active);

    // Roll for new events
    const r = rng();
    for (const template of EVENT_TEMPLATES) {
      // Don't stack same event type
      if (this.activeEvents.some((e) => e.type === template.type)) continue;

      if (r.chance(template.probabilityPerDay * dtDays)) {
        const duration = r.intRange(template.durationRange_min[0], template.durationRange_min[1]);
        const event: GameEvent = {
          id: `event_${this.nextEventId++}`,
          type: template.type,
          name: template.name,
          description: template.description,
          startTime: gameTimeMs,
          duration_min: duration,
          severity: template.severity,
          active: true,
          resolved: false,
          effects: template.effects(r),
        };
        this.activeEvents.push(event);
        this.eventHistory.push(event);

        alarms.push({
          id: `event_start_${event.id}`,
          processId: 'events',
          severity: event.severity === 'severe' ? 'critical' : event.severity === 'moderate' ? 'warning' : 'info',
          message: `EVENT: ${event.name} — ${event.description}`,
          timestamp: gameTimeMs,
          acknowledged: false,
        });
      }
    }

    // Combine effects from all active events
    for (const event of this.activeEvents) {
      if (event.effects.influentModifier) {
        if (!combinedInfluentMod) combinedInfluentMod = {};
        Object.assign(combinedInfluentMod, event.effects.influentModifier);
      }
      if (event.effects.flowMultiplier) {
        flowMultiplier *= event.effects.flowMultiplier;
      }
      if (event.effects.inspectionActive) {
        inspectionActive = true;
      }
      if (event.effects.powerOutage) {
        powerOutage = true;
      }
    }

    return {
      events: [...this.activeEvents],
      alarms,
      influentModifier: combinedInfluentMod,
      flowMultiplier,
      inspectionActive,
      powerOutage,
    };
  }

  getActiveEvents(): GameEvent[] {
    return this.activeEvents.filter((e) => e.active);
  }

  getEventHistory(): GameEvent[] {
    return [...this.eventHistory];
  }

  /** Force trigger a specific event type (for scenarios) */
  triggerEvent(type: EventType, gameTimeMs: number, duration_min?: number): GameEvent | null {
    const template = EVENT_TEMPLATES.find((t) => t.type === type);
    if (!template) return null;

    const r = rng();
    const event: GameEvent = {
      id: `event_${this.nextEventId++}`,
      type: template.type,
      name: template.name,
      description: template.description,
      startTime: gameTimeMs,
      duration_min: duration_min ?? r.intRange(template.durationRange_min[0], template.durationRange_min[1]),
      severity: template.severity,
      active: true,
      resolved: false,
      effects: template.effects(r),
    };
    this.activeEvents.push(event);
    this.eventHistory.push(event);
    return event;
  }
}
