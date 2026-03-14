import { useGameStore } from '../../state/gameStore';

const SEVERITY_COLORS = {
  minor: 'var(--accent-blue)',
  moderate: 'var(--accent-orange)',
  severe: 'var(--accent-red)',
};

export function EventsPanel() {
  const activeEvents = useGameStore((s) => s.activeEvents);
  const regulatory = useGameStore((s) => s.regulatory);

  const hasEvents = (activeEvents && activeEvents.length > 0) || (regulatory && regulatory.escalationLevel !== 'compliant');

  if (!hasEvents) return null;

  return (
    <div className="panel events-panel">
      <div className="panel-header">
        Active Events
        {activeEvents && activeEvents.length > 0 && (
          <span className="badge">{activeEvents.length}</span>
        )}
      </div>
      <div className="panel-body">
        {/* Regulatory Status */}
        {regulatory && regulatory.escalationLevel !== 'compliant' && (
          <div className="event-card regulatory-card">
            <div className="event-severity" style={{ color: 'var(--accent-red)' }}>
              REGULATORY
            </div>
            <div className="event-name">
              {formatEscalation(regulatory.escalationLevel)}
            </div>
            <div className="event-desc">
              {regulatory.violationCount30Day} violations in 30 days.
              {regulatory.finesTotal > 0 && ` Total fines: $${regulatory.finesTotal.toLocaleString()}`}
            </div>
            {regulatory.complianceStreak_days > 0 && (
              <div className="event-desc" style={{ color: 'var(--accent-green)' }}>
                Compliance streak: {regulatory.complianceStreak_days} days
              </div>
            )}
          </div>
        )}

        {/* Active Events */}
        {(activeEvents || []).map((event) => (
          <div key={event.id} className="event-card">
            <div className="event-severity" style={{ color: SEVERITY_COLORS[event.severity] }}>
              {event.severity.toUpperCase()}
            </div>
            <div className="event-name">{event.name}</div>
            <div className="event-desc">{event.description}</div>
            <div className="event-timer">
              {formatRemainingTime(event.startTime, event.duration_min)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatEscalation(level: string): string {
  switch (level) {
    case 'warning_letter': return 'Warning Letter Issued';
    case 'notice_of_violation': return 'Notice of Violation';
    case 'consent_order': return 'CONSENT ORDER';
    case 'closure_risk': return 'CLOSURE RISK';
    default: return level;
  }
}

function formatRemainingTime(startTime: number, duration_min: number): string {
  const endTime = startTime + duration_min * 60 * 1000;
  const remaining_min = Math.max(0, (endTime - Date.now()) / 60000);
  if (remaining_min > 60) return `~${Math.ceil(remaining_min / 60)}h remaining`;
  return `~${Math.ceil(remaining_min)}min remaining`;
}
