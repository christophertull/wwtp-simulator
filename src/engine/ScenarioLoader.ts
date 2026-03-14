import type {
  ScenarioDefinition,
  ScenarioObjective,
  ScenarioTrigger,
  ScenarioCheckState,
} from './ScenarioSystem';

import tutorialData from '../../data/scenarios/tutorial.json';
import stormData from '../../data/scenarios/storm_event.json';
import spillData from '../../data/scenarios/industrial_spill.json';

/** Map of objective ID to check function for each scenario */
const CHECK_FUNCTIONS: Record<string, Record<string, (state: ScenarioCheckState) => boolean>> = {
  tutorial_basics: {
    observe_flow: () => true, // just needs time to pass
    adjust_blowers: (s) => s.aerationDo >= 1.8, // blower speed 0.8 should raise DO
    check_do: (s) => s.aerationDo >= 2.0,
    monitor_effluent: (s) => s.effluentBod < 30,
    collect_sample: () => true, // checked externally via lab system
    survive_24h: (s) => s.violationCount === 0,
  },
  storm_surge: {
    prepare: () => true, // auto-complete after first minute (player reviews)
    survive_storm: (s) => s.effluentTss < 45,
    no_violations: (s) => s.violationCount <= 3,
    budget_intact: (s) => s.budget > 0,
  },
  toxic_spill: {
    protect_biology: (s) => s.aerationMlss >= 1500,
    restore_nitrification: (s) => s.effluentNh3 < 5,
    manage_costs: (s) => s.violationCount * 10000 < 50000, // rough fines estimate
    document_response: () => true, // checked externally
  },
};

function loadScenario(data: Record<string, unknown>): ScenarioDefinition {
  const id = data.id as string;
  const checks = CHECK_FUNCTIONS[id] ?? {};

  const rawObjectives = data.objectives as Array<Record<string, unknown>>;
  const objectives: ScenarioObjective[] = rawObjectives.map((obj) => ({
    id: obj.id as string,
    description: obj.description as string,
    status: 'pending' as const,
    hint: obj.hint as string | undefined,
    requiredDuration_min: obj.requiredDuration_min as number | undefined,
    check: checks[obj.id as string] ?? (() => false),
  }));

  const rawTriggers = data.triggers as Array<Record<string, unknown>>;
  const triggers: ScenarioTrigger[] = rawTriggers.map((t) => ({
    atMinute: t.atMinute as number | undefined,
    afterObjectives: t.afterObjectives as string[] | undefined,
    action: t.action as ScenarioTrigger['action'],
  }));

  return {
    id,
    name: data.name as string,
    description: data.description as string,
    difficulty: data.difficulty as ScenarioDefinition['difficulty'],
    duration_min: data.duration_min as number,
    introMessage: data.introMessage as { title: string; text: string },
    objectives,
    triggers,
  };
}

export const SCENARIOS: ScenarioDefinition[] = [
  loadScenario(tutorialData as Record<string, unknown>),
  loadScenario(stormData as Record<string, unknown>),
  loadScenario(spillData as Record<string, unknown>),
];

export function getScenario(id: string): ScenarioDefinition | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
