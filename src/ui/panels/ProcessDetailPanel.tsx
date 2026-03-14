import { useGameStore } from '../../state/gameStore';
import type { PlantControls } from '../../engine/SimulationLoop';

interface ControlDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  process: keyof PlantControls;
}

const CONTROL_DEFS: Record<string, ControlDef[]> = {
  preliminary: [
    { key: 'rakeSpeed', label: 'Rake Speed', min: 0, max: 10, step: 0.5, unit: 'cyc/min', process: 'preliminary' },
  ],
  primaryClarifier: [
    { key: 'sludgePumpRate', label: 'Sludge Pump', min: 0, max: 1, step: 0.05, unit: '(frac)', process: 'primaryClarifier' },
  ],
  aerationTank: [
    { key: 'blowerSpeed', label: 'Blower Speed', min: 0, max: 1, step: 0.05, unit: '(frac)', process: 'aerationTank' },
    { key: 'rasRate', label: 'RAS Rate', min: 0, max: 1.5, step: 0.05, unit: '×Q', process: 'aerationTank' },
    { key: 'wasRate', label: 'WAS Rate', min: 0, max: 0.1, step: 0.005, unit: '×Q', process: 'aerationTank' },
  ],
  secondaryClarifier: [
    { key: 'rasRate', label: 'RAS Rate', min: 0, max: 1.5, step: 0.05, unit: '×Q', process: 'secondaryClarifier' },
  ],
  disinfection: [
    { key: 'chlorineDose', label: 'Chlorine Dose', min: 0, max: 15, step: 0.5, unit: 'mg/L', process: 'disinfection' },
  ],
};

const PROCESS_LABELS: Record<string, string> = {
  preliminary: 'Screening & Grit Removal',
  primaryClarifier: 'Primary Clarifier',
  aerationTank: 'Aeration Tank',
  secondaryClarifier: 'Secondary Clarifier',
  disinfection: 'Chlorine Disinfection',
};

export function ProcessDetailPanel() {
  const selectedProcess = useGameStore((s) => s.selectedProcess);
  const processStates = useGameStore((s) => s.processStates);
  const controls = useGameStore((s) => s.controls);
  const setControl = useGameStore((s) => s.setControl);
  const alarms = useGameStore((s) => s.alarms);

  if (!selectedProcess) {
    return (
      <div className="panel detail-panel">
        <div className="panel-header">Process Detail</div>
        <div className="panel-body muted">Click a process on the schematic to inspect it.</div>
      </div>
    );
  }

  const controlDefs = CONTROL_DEFS[selectedProcess] || [];
  const state = processStates[selectedProcess] || {};
  const processAlarms = alarms.filter(
    (a) => a.processId === selectedProcess || a.processId === selectedProcess.replace(/([A-Z])/g, '_$1').toLowerCase()
  );

  return (
    <div className="panel detail-panel">
      <div className="panel-header">{PROCESS_LABELS[selectedProcess] || selectedProcess}</div>

      <div className="panel-body">
        {/* State readings */}
        <div className="section-label">READINGS</div>
        <div className="readings-grid">
          {Object.entries(state).map(([key, value]) => (
            <div key={key} className="reading">
              <span className="reading-label">{formatLabel(key)}</span>
              <span className="reading-value">{formatValue(key, value)}</span>
            </div>
          ))}
        </div>

        {/* Controls */}
        {controlDefs.length > 0 && (
          <>
            <div className="section-label">CONTROLS</div>
            {controlDefs.map((def) => {
              const processControls = controls[def.process] as Record<string, number>;
              const currentValue = (processControls?.[def.key] as number) ?? def.min;
              return (
                <div key={def.key} className="control-row">
                  <label className="control-label">
                    {def.label}: {currentValue.toFixed(2)} {def.unit}
                  </label>
                  <input
                    type="range"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={currentValue}
                    onChange={(e) => setControl(def.process, def.key, parseFloat(e.target.value))}
                    className="control-slider"
                  />
                </div>
              );
            })}
          </>
        )}

        {/* Alarms */}
        {processAlarms.length > 0 && (
          <>
            <div className="section-label">ALARMS</div>
            {processAlarms.map((alarm, i) => (
              <div key={i} className={`alarm-item alarm-${alarm.severity}`}>
                {alarm.message}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/mg l/i, '(mg/L)')
    .replace(/ft/i, '(ft)')
    .replace(/days/i, '(days)');
}

function formatValue(key: string, value: number): string {
  if (key.includes('mg_l')) return value.toFixed(1);
  if (key.includes('ft')) return value.toFixed(1);
  if (key.includes('days')) return value.toFixed(1);
  if (key.includes('ratio')) return value.toFixed(3);
  if (key.includes('Level')) return (value * 100).toFixed(0) + '%';
  return value.toFixed(1);
}
