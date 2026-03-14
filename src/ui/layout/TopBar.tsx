import { useGameStore } from '../../state/gameStore';

const TIME_SCALES = [
  { label: '⏸', value: 0 },
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
  { label: '5×', value: 5 },
  { label: '10×', value: 10 },
];

export function TopBar() {
  const gameTimeMs = useGameStore((s) => s.gameTimeMs);
  const timeScale = useGameStore((s) => s.timeScale);
  const setTimeScale = useGameStore((s) => s.setTimeScale);
  const totalPower_kw = useGameStore((s) => s.totalPower_kw);
  const violations = useGameStore((s) => s.allViolations);

  const date = new Date(gameTimeMs);
  const timeStr = date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  return (
    <div className="top-bar">
      <div className="top-bar-section">
        <span className="game-title">FlowState</span>
        <span className="subtitle">WWTP Simulator</span>
      </div>

      <div className="top-bar-section">
        <span className="clock">{timeStr}</span>
      </div>

      <div className="top-bar-section time-controls">
        {TIME_SCALES.map(({ label, value }) => (
          <button
            key={value}
            className={`time-btn ${timeScale === value ? 'active' : ''}`}
            onClick={() => setTimeScale(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="top-bar-section">
        <span className="stat">
          Power: {totalPower_kw.toFixed(0)} kW
        </span>
        <span className={`stat ${violations.length > 0 ? 'violations' : ''}`}>
          Violations: {violations.length}
        </span>
      </div>
    </div>
  );
}
