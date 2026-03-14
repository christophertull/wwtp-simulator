import { useGameStore } from '../../state/gameStore';
import type { ScenarioState } from '../../engine/ScenarioSystem';

interface Props {
  scenario: ScenarioState;
  onClose: () => void;
}

export function ScenarioCompleteModal({ scenario, onClose }: Props) {
  const returnToMenu = useGameStore((s) => s.returnToMenu);

  const isComplete = scenario.completed;
  const isFailed = scenario.failed;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <span>{isComplete ? 'SCENARIO COMPLETE' : 'SCENARIO FAILED'}</span>
        </div>

        <div className="modal-body">
          {isComplete && scenario.result && (
            <div className="scenario-result">
              <div className="result-grade">{scenario.result.grade}</div>
              <div className="result-score">Score: {scenario.result.score}/100</div>
              <div className="result-summary">{scenario.result.summary}</div>
            </div>
          )}

          {isFailed && (
            <div className="scenario-result">
              <div className="result-grade fail">F</div>
              <div className="result-summary">
                Time ran out before all objectives were completed.
              </div>
            </div>
          )}

          <div className="scenario-objectives-summary">
            {scenario.objectives.map((obj) => (
              <div key={obj.id} className="objective-summary-row">
                <span className={obj.status === 'completed' ? 'good' : 'alarm-critical'}>
                  {obj.status === 'completed' ? '[x]' : '[ ]'}
                </span>
                {' '}{obj.description}
              </div>
            ))}
          </div>

          <div className="modal-actions">
            <button className="menu-btn" onClick={onClose}>
              Continue Playing
            </button>
            <button className="menu-btn primary" onClick={returnToMenu}>
              Main Menu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
