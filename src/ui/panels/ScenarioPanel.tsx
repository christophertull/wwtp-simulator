import { useGameStore } from '../../state/gameStore';
import type { ScenarioObjectiveStatus } from '../../engine/ScenarioSystem';

const STATUS_ICONS: Record<ScenarioObjectiveStatus, string> = {
  pending: '[ ]',
  active: '[>]',
  completed: '[x]',
  failed: '[!]',
};

const STATUS_CLASS: Record<ScenarioObjectiveStatus, string> = {
  pending: 'muted',
  active: 'alarm-warning',
  completed: 'good',
  failed: 'alarm-critical',
};

export function ScenarioPanel() {
  const scenario = useGameStore((s) => s.scenario);

  if (!scenario || !scenario.active) return null;

  const activeObjectives = scenario.objectives.filter((o) => o.status !== 'pending');

  return (
    <div className="panel">
      <div className="panel-header">SCENARIO: {scenario.scenarioId?.toUpperCase()}</div>

      <div className="panel-body">
        <div className="scenario-objectives">
          {activeObjectives.map((obj) => (
            <div key={obj.id} className="scenario-objective">
              <span className={STATUS_CLASS[obj.status]}>
                {STATUS_ICONS[obj.status]}
              </span>
              <span className={obj.status === 'completed' ? 'muted' : ''}>
                {' '}{obj.description}
              </span>
              {obj.status === 'active' && obj.hint && (
                <div className="scenario-hint">{obj.hint}</div>
              )}
              {obj.status === 'active' && obj.requiredDuration_min && obj._progress !== undefined && (
                <div className="scenario-progress">
                  Progress: {Math.min(100, (obj._progress / obj.requiredDuration_min * 100)).toFixed(0)}%
                </div>
              )}
            </div>
          ))}
        </div>

        {scenario.messages.filter((m) => !m.read).length > 0 && (
          <div className="scenario-messages">
            {scenario.messages.filter((m) => !m.read).map((msg, i) => (
              <div key={i} className="scenario-message">
                <div className="scenario-msg-title">{msg.title}</div>
                <div className="scenario-msg-text">{msg.text}</div>
              </div>
            ))}
          </div>
        )}

        <div className="scenario-timer">
          Elapsed: {Math.floor(scenario.elapsedMinutes / 60)}h {Math.floor(scenario.elapsedMinutes % 60)}m
        </div>
      </div>
    </div>
  );
}
