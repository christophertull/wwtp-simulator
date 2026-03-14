import { useGameStore } from '../../state/gameStore';

export function FinancePanel() {
  const finance = useGameStore((s) => s.finance);

  if (!finance) return null;

  const netDaily = finance.daily.revenue + finance.daily.biogasCredit
    - finance.daily.energy - finance.daily.chemicals - finance.daily.labor
    - finance.daily.sludgeDisposal - finance.daily.fines;

  return (
    <div className="panel finance-panel">
      <div className="panel-header">
        Finance
        <span className={`badge ${finance.budget > 0 ? 'badge-green' : 'badge-red'}`}>
          ${formatMoney(finance.budget)}
        </span>
      </div>
      <div className="panel-body">
        <div className="section-label">DAILY RATES</div>
        <table className="finance-table">
          <tbody>
            <tr className="revenue-row">
              <td>Revenue</td>
              <td className="amount positive">+${formatMoney(finance.daily.revenue)}</td>
            </tr>
            {finance.daily.biogasCredit > 0 && (
              <tr className="revenue-row">
                <td>Biogas Credit</td>
                <td className="amount positive">+${formatMoney(finance.daily.biogasCredit)}</td>
              </tr>
            )}
            <tr>
              <td>Energy</td>
              <td className="amount negative">-${formatMoney(finance.daily.energy)}</td>
            </tr>
            <tr>
              <td>Chemicals</td>
              <td className="amount negative">-${formatMoney(finance.daily.chemicals)}</td>
            </tr>
            <tr>
              <td>Labor</td>
              <td className="amount negative">-${formatMoney(finance.daily.labor)}</td>
            </tr>
            <tr>
              <td>Sludge Disposal</td>
              <td className="amount negative">-${formatMoney(finance.daily.sludgeDisposal)}</td>
            </tr>
            {finance.daily.fines > 0 && (
              <tr className="fine-row">
                <td>Fines</td>
                <td className="amount negative">-${formatMoney(finance.daily.fines)}</td>
              </tr>
            )}
            <tr className="net-row">
              <td><strong>Net/Day</strong></td>
              <td className={`amount ${netDaily >= 0 ? 'positive' : 'negative'}`}>
                <strong>{netDaily >= 0 ? '+' : '-'}${formatMoney(Math.abs(netDaily))}</strong>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="section-label">MONTH TO DATE</div>
        <div className="readings-row">
          <span>Revenue: ${formatMoney(finance.monthly.revenue)}</span>
        </div>
        <div className="readings-row">
          <span>Expenses: ${formatMoney(finance.monthly.expenses)}</span>
        </div>
        {finance.monthly.fines > 0 && (
          <div className="readings-row" style={{ color: 'var(--accent-red)' }}>
            <span>Fines: ${formatMoney(finance.monthly.fines)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatMoney(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return (amount / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1_000) return (amount / 1_000).toFixed(1) + 'k';
  return amount.toFixed(0);
}
