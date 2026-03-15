import { useGameStore } from '../../state/gameStore';

export function AlarmPanel() {
  const alarms = useGameStore((s) => s.alarms);
  const violations = useGameStore((s) => s.allViolations);
  const dismissedViolations = useGameStore((s) => s.dismissedViolationCount);
  const dismissViolations = useGameStore((s) => s.dismissViolations);

  const unacknowledgedViolations = violations.slice(dismissedViolations);
  const totalActive = alarms.length + unacknowledgedViolations.length;

  return (
    <div className="panel alarm-panel">
      <div className="panel-header">
        Alarms & Violations
        {totalActive > 0 && <span className="badge">{totalActive}</span>}
      </div>
      <div className="panel-body">
        {totalActive === 0 && (
          <div className="muted">No active alarms.{dismissedViolations > 0 ? ` (${dismissedViolations} acknowledged)` : ''}</div>
        )}
        {alarms.map((alarm, i) => (
          <div key={`a-${i}`} className={`alarm-item alarm-${alarm.severity}`}>
            <span className="alarm-icon">
              {alarm.severity === 'critical' ? '!!' : alarm.severity === 'warning' ? '!' : 'i'}
            </span>
            {alarm.message}
          </div>
        ))}
        {unacknowledgedViolations.map((v, i) => (
          <div key={`v-${i}`} className="alarm-item alarm-critical">
            <span className="alarm-icon">V</span>
            VIOLATION: {v.parameter} = {v.actual.toFixed(1)} (limit: {v.limit})
          </div>
        ))}
        {unacknowledgedViolations.length > 0 && (
          <button className="dismiss-btn" onClick={dismissViolations}>
            Acknowledge All
          </button>
        )}
      </div>
    </div>
  );
}
