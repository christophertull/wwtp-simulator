import { useState } from 'react';
import { useGameStore } from '../../state/gameStore';
import { ScenarioSelectModal } from '../modals/ScenarioSelectModal';
import type { ScenarioDefinition } from '../../engine/ScenarioSystem';

export function MainMenu() {
  const [showScenarios, setShowScenarios] = useState(false);
  const startScenario = useGameStore((s) => s.startScenario);
  const startSandbox = useGameStore((s) => s.startSandbox);

  const handleSelect = (scenario: ScenarioDefinition) => {
    startScenario(scenario);
  };

  return (
    <div className="main-menu">
      <div className="menu-content">
        <div className="menu-title">FLOWSTATE</div>
        <div className="menu-subtitle">Wastewater Treatment Plant Simulator</div>

        <div className="menu-tagline">
          Manage a municipal wastewater treatment plant.
          Balance biological processes, maintain compliance, and protect public health.
        </div>

        <div className="menu-buttons">
          <button className="menu-btn primary" onClick={() => setShowScenarios(true)}>
            New Game
          </button>
          <button className="menu-btn" onClick={startSandbox}>
            Quick Start (Sandbox)
          </button>
        </div>

        <div className="menu-info">
          <div className="menu-info-item">Press <kbd>Space</kbd> to pause/resume</div>
          <div className="menu-info-item">Press <kbd>1-4</kbd> for speed control</div>
          <div className="menu-info-item">Click process units on the schematic to inspect</div>
        </div>
      </div>

      {showScenarios && (
        <ScenarioSelectModal
          onSelect={handleSelect}
          onSandbox={startSandbox}
          onClose={() => setShowScenarios(false)}
        />
      )}
    </div>
  );
}
