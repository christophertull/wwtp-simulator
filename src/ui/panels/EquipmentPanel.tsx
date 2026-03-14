import { useGameStore } from '../../state/gameStore';

export function EquipmentPanel() {
  const equipment = useGameStore((s) => s.equipment);
  const repairEquipment = useGameStore((s) => s.repairEquipment);
  const maintainEquipment = useGameStore((s) => s.maintainEquipment);

  if (!equipment || equipment.length === 0) return null;

  return (
    <div className="panel equipment-panel">
      <div className="panel-header">Equipment</div>
      <div className="panel-body">
        {equipment.map((eq) => (
          <div key={eq.id} className={`equipment-item ${eq.failed ? 'eq-failed' : eq.condition < 30 ? 'eq-warn' : ''}`}>
            <div className="eq-header">
              <span className="eq-name">{eq.name}</span>
              <span className={`eq-status ${eq.failed ? 'failed' : eq.running ? 'running' : 'stopped'}`}>
                {eq.failed ? 'FAILED' : eq.running ? 'RUN' : 'OFF'}
              </span>
            </div>
            <div className="eq-bar-container">
              <div
                className="eq-bar"
                style={{
                  width: `${eq.condition}%`,
                  background: eq.condition > 60 ? '#4caf50' : eq.condition > 30 ? '#ff9800' : '#f44336',
                }}
              />
            </div>
            <div className="eq-details">
              <span>{eq.condition.toFixed(0)}%</span>
              {eq.failed && !eq.repairStarted && (
                <button className="eq-btn" onClick={() => repairEquipment(eq.id)}>
                  Repair (${eq.repairCost.toLocaleString()})
                </button>
              )}
              {eq.failed && eq.repairStarted && (
                <span className="repairing">Repairing...</span>
              )}
              {!eq.failed && eq.condition < 70 && (
                <button className="eq-btn" onClick={() => maintainEquipment(eq.id)}>
                  Maintain (${eq.maintenanceCost.toLocaleString()})
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
