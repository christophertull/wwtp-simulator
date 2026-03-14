import { SCENARIOS } from '../../engine/ScenarioLoader';
import type { ScenarioDefinition } from '../../engine/ScenarioSystem';

interface Props {
  onSelect: (scenario: ScenarioDefinition) => void;
  onSandbox: () => void;
  onClose: () => void;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  tutorial: '#4fc3f7',
  easy: '#66bb6a',
  medium: '#ffa726',
  hard: '#ef5350',
};

export function ScenarioSelectModal({ onSelect, onSandbox, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal scenario-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>SELECT MODE</span>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>

        <div className="modal-body">
          <div
            className="scenario-card sandbox-card"
            onClick={onSandbox}
          >
            <div className="scenario-card-title">Sandbox Mode</div>
            <div className="scenario-card-desc">
              Free play with no objectives. Experiment with the plant at your own pace.
            </div>
            <div className="scenario-card-diff" style={{ color: '#aaa' }}>
              No time limit
            </div>
          </div>

          <div className="scenario-divider">--- SCENARIOS ---</div>

          {SCENARIOS.map((s) => (
            <div
              key={s.id}
              className="scenario-card"
              onClick={() => onSelect(s)}
            >
              <div className="scenario-card-title">{s.name}</div>
              <div className="scenario-card-desc">{s.description}</div>
              <div className="scenario-card-meta">
                <span
                  className="scenario-card-diff"
                  style={{ color: DIFFICULTY_COLORS[s.difficulty] ?? '#aaa' }}
                >
                  {s.difficulty.toUpperCase()}
                </span>
                <span className="scenario-card-time">
                  {s.duration_min > 0
                    ? `${Math.floor(s.duration_min / 60)}h game time`
                    : 'Unlimited'}
                </span>
              </div>
              <div className="scenario-card-objectives">
                {s.objectives.length} objectives
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
