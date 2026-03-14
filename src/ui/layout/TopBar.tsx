import { useGameStore } from '../../state/gameStore';

const TIME_SCALES = [
  { label: '||', value: 0 },
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '5x', value: 5 },
  { label: '10x', value: 10 },
];

const WEATHER_ICONS: Record<string, string> = {
  clear: 'Clear',
  cloudy: 'Cloudy',
  rain: 'Rain',
  heavy_rain: 'Heavy Rain',
  storm: 'STORM',
};

export function TopBar() {
  const gameTimeMs = useGameStore((s) => s.gameTimeMs);
  const timeScale = useGameStore((s) => s.timeScale);
  const setTimeScale = useGameStore((s) => s.setTimeScale);
  const totalPower_kw = useGameStore((s) => s.totalPower_kw);
  const violations = useGameStore((s) => s.allViolations);
  const weather = useGameStore((s) => s.weather);
  const finance = useGameStore((s) => s.finance);
  const toggleSaveModal = useGameStore((s) => s.toggleSaveModal);
  const returnToMenu = useGameStore((s) => s.returnToMenu);

  const date = new Date(gameTimeMs);
  const timeStr = date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const weatherLabel = weather ? WEATHER_ICONS[weather.condition] || 'Clear' : 'Clear';
  const temp = weather?.temperature_c ?? 18;

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
        <span className={`stat ${weather?.stormActive ? 'storm-active' : ''}`}>
          {weatherLabel} {temp.toFixed(0)}C
        </span>
        <span className="stat">
          {totalPower_kw.toFixed(0)} kW
        </span>
        {finance && (
          <span className={`stat ${finance.budget < 50000 ? 'violations' : ''}`}>
            ${formatBudget(finance.budget)}
          </span>
        )}
        <span className={`stat ${violations.length > 0 ? 'violations' : ''}`}>
          {violations.length} violations
        </span>
        <button className="time-btn" onClick={toggleSaveModal}>
          SAVE
        </button>
        <button className="time-btn" onClick={returnToMenu}>
          MENU
        </button>
      </div>
    </div>
  );
}

function formatBudget(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return (amount / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(amount) >= 1_000) return (amount / 1_000).toFixed(0) + 'k';
  return amount.toFixed(0);
}
