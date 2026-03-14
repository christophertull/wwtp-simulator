import { useGameStore } from '../../state/gameStore';
import type { LabSample } from '../../engine/LabSystem';

const LOCATION_LABELS: Record<string, string> = {
  influent: 'Influent',
  effluent: 'Effluent',
  aeration: 'Aeration',
  primary_effluent: 'Primary Eff.',
};

const PARAM_LABELS: Record<string, string> = {
  ph: 'pH',
  do_mg_l: 'DO',
  tss_mg_l: 'TSS',
  bod_mg_l: 'BOD5',
  nh3_mg_l: 'NH3-N',
  no3_mg_l: 'NO3-N',
  tp_mg_l: 'TP',
  chlorine_residual_mg_l: 'Cl2',
  mlss_mg_l: 'MLSS',
};

export function LabPanel() {
  const labSamples = useGameStore((s) => s.labSamples);
  const collectSample = useGameStore((s) => s.collectSample);
  const gameTimeMs = useGameStore((s) => s.gameTimeMs);

  const recentSamples = (labSamples || []).slice(-6).reverse();

  return (
    <div className="panel lab-panel">
      <div className="panel-header">
        Laboratory
        <span className="badge" style={{ background: 'var(--accent-blue)' }}>
          {recentSamples.filter((s) => !isFullyRevealed(s, gameTimeMs)).length} pending
        </span>
      </div>
      <div className="panel-body">
        <div className="section-label">COLLECT SAMPLE</div>
        <div className="lab-buttons">
          <button className="eq-btn" onClick={() => collectSample('grab', 'influent')}>
            Influent Grab
          </button>
          <button className="eq-btn" onClick={() => collectSample('grab', 'effluent')}>
            Effluent Grab
          </button>
          <button className="eq-btn" onClick={() => collectSample('grab', 'aeration')}>
            Aeration Grab
          </button>
          <button className="eq-btn" onClick={() => collectSample('composite', 'effluent')}>
            Effluent Composite
          </button>
        </div>

        <div className="section-label">RECENT RESULTS</div>
        {recentSamples.length === 0 && (
          <div className="muted">No samples collected yet.</div>
        )}
        {recentSamples.map((sample) => (
          <SampleCard key={sample.id} sample={sample} gameTimeMs={gameTimeMs} />
        ))}
      </div>
    </div>
  );
}

function SampleCard({ sample, gameTimeMs }: { sample: LabSample; gameTimeMs: number }) {
  const fullyRevealed = isFullyRevealed(sample, gameTimeMs);
  const collectedDate = new Date(sample.collectedAt);
  const timeStr = `${collectedDate.getHours().toString().padStart(2, '0')}:${collectedDate.getMinutes().toString().padStart(2, '0')}`;

  return (
    <div className={`sample-card ${fullyRevealed ? '' : 'sample-pending'}`}>
      <div className="sample-header">
        <span className="sample-location">{LOCATION_LABELS[sample.location] || sample.location}</span>
        <span className="sample-type">{sample.type}</span>
        <span className="sample-time">{timeStr}</span>
        {!fullyRevealed && <span className="sample-status">analyzing...</span>}
      </div>
      {sample.results && (
        <div className="sample-results">
          {Object.entries(sample.results).map(([key, value]) => (
            <span key={key} className="sample-param">
              {PARAM_LABELS[key] || key}: {(value as number).toFixed(key === 'ph' ? 1 : key.includes('mg_l') ? 1 : 0)}
            </span>
          ))}
          {!fullyRevealed && (
            <span className="sample-param pending-param">BOD5: pending (5-day test)</span>
          )}
        </div>
      )}
    </div>
  );
}

function isFullyRevealed(sample: LabSample, gameTimeMs: number): boolean {
  return gameTimeMs >= sample.resultsAt;
}
