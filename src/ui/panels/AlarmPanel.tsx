import { useGameStore } from '../../state/gameStore';

export function AlarmPanel() {
  const alarms = useGameStore((s) => s.alarms);
  const violations = useGameStore((s) => s.allViolations);

  return (
    <div className="panel alarm-panel">
      <div className="panel-header">
        Alarms & Violations
        {alarms.length > 0 && <span className="badge">{alarms.length}</span>}
      </div>
      <div className="panel-body">
        {alarms.length === 0 && violations.length === 0 && (
          <div className="muted">No active alarms.</div>
        )}
        {alarms.map((alarm, i) => (
          <div key={`a-${i}`} className={`alarm-item alarm-${alarm.severity}`}>
            <span className="alarm-icon">
              {alarm.severity === 'critical' ? '!!' : alarm.severity === 'warning' ? '!' : 'i'}
            </span>
            {alarm.message}
          </div>
        ))}
        {violations.slice(-5).map((v, i) => (
          <div key={`v-${i}`} className="alarm-item alarm-critical">
            <span className="alarm-icon">V</span>
            VIOLATION: {v.parameter} = {v.actual.toFixed(1)} (limit: {v.limit})
          </div>
        ))}
      </div>
    </div>
  );
}
