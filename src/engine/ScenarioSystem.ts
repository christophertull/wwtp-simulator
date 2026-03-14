import type { PlantControls } from './SimulationLoop';

export type ScenarioObjectiveStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface ScenarioObjective {
  id: string;
  description: string;
  status: ScenarioObjectiveStatus;
  /** Check function: returns true if objective is met */
  check: (state: ScenarioCheckState) => boolean;
  /** Optional hint displayed when active */
  hint?: string;
  /** Minimum consecutive ticks the condition must be met */
  requiredDuration_min?: number;
  /** Internal: ticks condition has been met */
  _progress?: number;
}

export interface ScenarioTrigger {
  /** Game-time offset in minutes from scenario start */
  atMinute?: number;
  /** Trigger when all listed objective IDs are completed */
  afterObjectives?: string[];
  /** Action to take */
  action: ScenarioAction;
  fired?: boolean;
}

export type ScenarioAction =
  | { type: 'message'; title: string; text: string }
  | { type: 'activateObjective'; objectiveId: string }
  | { type: 'forceEvent'; eventType: string; severity?: number }
  | { type: 'setControls'; controls: Partial<PlantControls> }
  | { type: 'complete' };

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  difficulty: 'tutorial' | 'easy' | 'medium' | 'hard';
  /** Duration in game-minutes (0 = unlimited) */
  duration_min: number;
  objectives: ScenarioObjective[];
  triggers: ScenarioTrigger[];
  /** Optional starting control overrides */
  startingControls?: Partial<PlantControls>;
  /** Intro message shown on start */
  introMessage: { title: string; text: string };
}

/** State passed to objective check functions */
export interface ScenarioCheckState {
  effluentBod: number;
  effluentTss: number;
  effluentNh3: number;
  effluentDo: number;
  effluentCl2: number;
  influentFlow: number;
  aerationDo: number;
  aerationMlss: number;
  budget: number;
  violationCount: number;
  complianceStreak: number;
  elapsedMinutes: number;
}

export interface ScenarioState {
  scenarioId: string | null;
  active: boolean;
  startTimeMs: number;
  elapsedMinutes: number;
  objectives: ScenarioObjective[];
  messages: Array<{ title: string; text: string; timestamp: number; read: boolean }>;
  completed: boolean;
  failed: boolean;
  result?: { score: number; grade: string; summary: string };
}

export class ScenarioManager {
  private state: ScenarioState;
  private definition: ScenarioDefinition | null = null;
  private triggers: ScenarioTrigger[] = [];

  constructor() {
    this.state = this.emptyState();
  }

  private emptyState(): ScenarioState {
    return {
      scenarioId: null,
      active: false,
      startTimeMs: 0,
      elapsedMinutes: 0,
      objectives: [],
      messages: [],
      completed: false,
      failed: false,
    };
  }

  startScenario(definition: ScenarioDefinition, gameTimeMs: number): ScenarioState {
    this.definition = definition;
    this.triggers = definition.triggers.map((t) => ({ ...t, fired: false }));
    this.state = {
      scenarioId: definition.id,
      active: true,
      startTimeMs: gameTimeMs,
      elapsedMinutes: 0,
      objectives: definition.objectives.map((o) => ({ ...o, _progress: 0 })),
      messages: [{
        title: definition.introMessage.title,
        text: definition.introMessage.text,
        timestamp: gameTimeMs,
        read: false,
      }],
      completed: false,
      failed: false,
    };
    return { ...this.state };
  }

  update(dt: number, gameTimeMs: number, checkState: ScenarioCheckState): ScenarioState {
    if (!this.state.active || !this.definition) return { ...this.state };

    this.state.elapsedMinutes += dt;

    // Check objectives
    for (const obj of this.state.objectives) {
      if (obj.status !== 'active') continue;

      if (obj.check(checkState)) {
        const required = obj.requiredDuration_min ?? 1;
        obj._progress = (obj._progress ?? 0) + dt;
        if (obj._progress >= required) {
          obj.status = 'completed';
        }
      } else {
        obj._progress = 0;
      }
    }

    // Fire triggers
    for (const trigger of this.triggers) {
      if (trigger.fired) continue;

      let shouldFire = false;

      if (trigger.atMinute !== undefined && this.state.elapsedMinutes >= trigger.atMinute) {
        shouldFire = true;
      }

      if (trigger.afterObjectives) {
        const allComplete = trigger.afterObjectives.every((id) =>
          this.state.objectives.find((o) => o.id === id)?.status === 'completed'
        );
        shouldFire = allComplete;
      }

      if (shouldFire) {
        trigger.fired = true;
        this.executeAction(trigger.action, gameTimeMs);
      }
    }

    // Check for timeout / failure
    if (this.definition.duration_min > 0 && this.state.elapsedMinutes >= this.definition.duration_min) {
      const allComplete = this.state.objectives.every((o) => o.status === 'completed');
      if (!allComplete) {
        this.state.failed = true;
        this.state.active = false;
      }
    }

    // Check full completion
    const allObjectivesComplete = this.state.objectives.every((o) => o.status === 'completed');
    if (allObjectivesComplete && !this.state.completed) {
      this.state.completed = true;
      this.state.active = false;
      this.state.result = this.calculateScore(checkState);
    }

    return { ...this.state, objectives: this.state.objectives.map((o) => ({ ...o })) };
  }

  private executeAction(action: ScenarioAction, gameTimeMs: number) {
    switch (action.type) {
      case 'message':
        this.state.messages.push({
          title: action.title,
          text: action.text,
          timestamp: gameTimeMs,
          read: false,
        });
        break;
      case 'activateObjective': {
        const obj = this.state.objectives.find((o) => o.id === action.objectiveId);
        if (obj && obj.status === 'pending') obj.status = 'active';
        break;
      }
      case 'complete':
        this.state.completed = true;
        this.state.active = false;
        break;
    }
  }

  private calculateScore(checkState: ScenarioCheckState): { score: number; grade: string; summary: string } {
    let score = 0;

    // Time bonus: faster completion = higher score
    const defDuration = this.definition?.duration_min ?? 1440;
    const timeRatio = 1 - (this.state.elapsedMinutes / defDuration);
    score += Math.max(0, timeRatio * 30);

    // Effluent quality
    if (checkState.effluentBod < 30) score += 20;
    else if (checkState.effluentBod < 45) score += 10;
    if (checkState.effluentTss < 30) score += 20;
    else if (checkState.effluentTss < 45) score += 10;

    // Compliance
    score += Math.min(checkState.complianceStreak, 30);

    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
    const summary = score >= 75
      ? 'Excellent plant operation!'
      : score >= 50
        ? 'Adequate performance. Room for improvement.'
        : 'Needs work. Review your process controls.';

    return { score: Math.round(score), grade, summary };
  }

  getState(): ScenarioState {
    return { ...this.state, objectives: this.state.objectives.map((o) => ({ ...o })) };
  }

  markMessageRead(index: number) {
    if (this.state.messages[index]) {
      this.state.messages[index].read = true;
    }
  }

  abandon() {
    this.state.active = false;
    this.state.failed = true;
    this.definition = null;
  }
}
