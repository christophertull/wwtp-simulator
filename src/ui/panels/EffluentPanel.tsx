import { useGameStore } from '../../state/gameStore';

interface LimitCheck {
  label: string;
  value: number;
  limit: number;
  unit: string;
}

export function EffluentPanel() {
  const effluent = useGameStore((s) => s.effluent);
  const influent = useGameStore((s) => s.influent);
  const totalPower = useGameStore((s) => s.totalPower_kw);
  const chemCost = useGameStore((s) => s.totalChemicalCost_per_day);

  const checks: LimitCheck[] = [
    { label: 'BOD', value: effluent.bod_mg_l, limit: 60, unit: 'mg/L' },
    { label: 'TSS', value: effluent.tss_mg_l, limit: 60, unit: 'mg/L' },
    { label: 'NH3-N', value: effluent.nh3_mg_l, limit: 5.0, unit: 'mg/L' },
    { label: 'Cl2 Res.', value: effluent.chlorine_residual_mg_l, limit: 0.1, unit: 'mg/L' },
    { label: 'pH', value: effluent.ph, limit: 8.5, unit: '' },
  ];

  const energyCost_per_day = totalPower * 24 * 0.10; // $0.10/kWh

  return (
    <div className="panel effluent-panel">
      <div className="panel-header">Effluent & Compliance</div>
      <div className="panel-body">
        <div className="section-label">INFLUENT</div>
        <div className="readings-row">
          <span>Flow: {influent.flow_mgd.toFixed(2)} MGD</span>
          <span>BOD: {influent.bod_mg_l.toFixed(0)}</span>
          <span>TSS: {influent.tss_mg_l.toFixed(0)}</span>
        </div>

        <div className="section-label">EFFLUENT vs PERMIT LIMITS</div>
        <table className="compliance-table">
          <thead>
            <tr><th>Parameter</th><th>Value</th><th>Limit</th><th>Status</th></tr>
          </thead>
          <tbody>
            {checks.map((c) => {
              const pass = c.label === 'pH'
                ? c.value >= 6.5 && c.value <= 8.5
                : c.value <= c.limit;
              return (
                <tr key={c.label} className={pass ? '' : 'violation-row'}>
                  <td>{c.label}</td>
                  <td>{c.value.toFixed(2)} {c.unit}</td>
                  <td>{c.limit} {c.unit}</td>
                  <td className={pass ? 'pass' : 'fail'}>{pass ? 'OK' : 'FAIL'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="section-label">OPERATING COSTS</div>
        <div className="readings-row">
          <span>Power: ${energyCost_per_day.toFixed(0)}/day</span>
          <span>Chemicals: ${chemCost.toFixed(0)}/day</span>
        </div>
      </div>
    </div>
  );
}
