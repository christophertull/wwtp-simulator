import { useState } from 'react';

interface EncyclopediaEntry {
  id: string;
  title: string;
  category: string;
  content: string;
}

const ENTRIES: EncyclopediaEntry[] = [
  // Process Units
  {
    id: 'preliminary',
    title: 'Preliminary Treatment',
    category: 'Process Units',
    content: `Screening removes large debris (rags, sticks, plastics) that could damage equipment. Bar screens have openings of 6-25mm. Grit removal settles sand and gravel.

Key Control: Rake Speed — controls how often the bar screen is cleaned. Too slow causes blinding (blockage), reducing flow capacity.

Tip: If you see flow backing up or the screen blinding alarm, increase rake speed.`,
  },
  {
    id: 'primary_clarifier',
    title: 'Primary Clarifier',
    category: 'Process Units',
    content: `A large settling tank where heavy solids sink to the bottom as primary sludge. Typically removes 50-70% of TSS and 25-40% of BOD.

Key Parameter: Surface Overflow Rate (SOR) — flow divided by tank surface area. Higher SOR = less settling time = poorer removal.

Key Control: Sludge Pump Rate — removes settled sludge from the bottom. Too slow causes septic conditions; too fast wastes water.

Design: 600-1000 GPD/sq ft SOR at average flow.`,
  },
  {
    id: 'aeration',
    title: 'Aeration Basin',
    category: 'Process Units',
    content: `The heart of biological treatment. Microorganisms (activated sludge) consume organic matter (BOD) and ammonia in the wastewater.

Key Parameters:
- MLSS (Mixed Liquor Suspended Solids): 2,000-4,000 mg/L typical
- DO (Dissolved Oxygen): 1.5-3.0 mg/L target
- SRT (Solids Retention Time): 5-15 days for BOD removal, 10-25 for nitrification
- F:M Ratio: 0.05-0.15 for extended aeration

Key Controls:
- Blower Speed: Controls oxygen supply. Too low = no DO, treatment fails. Too high = wastes energy.
- RAS Rate: Returns settled sludge from the secondary clarifier to maintain MLSS.
- WAS Rate: Wastes excess biomass to control SRT. Critical for process stability.

The biology follows Monod kinetics — growth rate depends on substrate (BOD) and DO concentration.`,
  },
  {
    id: 'secondary_clarifier',
    title: 'Secondary Clarifier',
    category: 'Process Units',
    content: `Separates the activated sludge (biomass) from the treated water. The clarified effluent flows over weirs while sludge settles to the bottom.

Key Parameters:
- SVI (Sludge Volume Index): Measures how well sludge settles. <120 = good, 120-200 = fair, >200 = bulking.
- Blanket Depth: Height of settled sludge. If it reaches the weirs, solids wash out.

Filamentous Bulking: When SRT is too high or F:M ratio too low, filamentous bacteria dominate, causing poor settling (high SVI). Fix by reducing SRT (increase WAS rate).

Tip: Monitor blanket depth — if it exceeds 40% of clarifier depth, reduce influent flow or increase RAS rate.`,
  },
  {
    id: 'disinfection',
    title: 'Disinfection',
    category: 'Process Units',
    content: `Kills pathogenic organisms before discharge. This plant uses chlorine contact followed by dechlorination (sodium bisulfite).

Process Flow:
1. Chlorine is dosed into the contact chamber (30 min contact time)
2. CT is achieved during contact: CT = Residual × Time
3. After the contact chamber, bisulfite is added to remove remaining chlorine
4. Final effluent residual must be <0.1 mg/L per permit

Key Controls:
- Chlorine Dose: Sets the initial chlorine concentration. Must overcome chlorine demand (from BOD/TSS) to achieve residual.
- Bisulfite Dose: Removes chlorine after CT is achieved. ~1 mg bisulfite neutralizes ~1 mg chlorine (90% efficiency).

Strategy: Dose enough chlorine to achieve CT ≥ 20 mg·min/L, then use bisulfite to bring the final residual below 0.1 mg/L.

See also: CT Value (Disinfection) in the Operations section.`,
  },
  {
    id: 'digester',
    title: 'Anaerobic Digester',
    category: 'Process Units',
    content: `Stabilizes sludge by breaking down volatile solids (VS) in the absence of oxygen. Produces biogas (methane) that can be used for energy.

Key Parameters:
- VS Destruction: 40-60% of volatile solids are converted to biogas
- Temperature: Mesophilic digesters operate at 35°C (95°F)
- pH: Must stay above 6.8 — acid phase upset can crash the digester

Biogas: ~12 ft³ per lb VS destroyed, 65% methane content. Can offset plant energy costs.

Warning: Acid phase upset occurs when acid-producing bacteria outpace methane producers. Recovery takes weeks! Don't overfeed.`,
  },

  // Parameters
  {
    id: 'bod',
    title: 'BOD (Biochemical Oxygen Demand)',
    category: 'Water Quality',
    content: `Measures the oxygen consumed by microorganisms to decompose organic matter. The standard BOD5 test takes 5 days of incubation.

Typical values:
- Raw wastewater: 150-300 mg/L
- After primary treatment: 80-180 mg/L
- After secondary treatment: 5-30 mg/L
- NPDES permit limit: 30 mg/L monthly average

BOD represents the "strength" of the wastewater — higher BOD means more organic pollution.`,
  },
  {
    id: 'tss',
    title: 'TSS (Total Suspended Solids)',
    category: 'Water Quality',
    content: `Measures particles that can be filtered from water. Includes both organic and inorganic solids.

Typical values:
- Raw wastewater: 150-350 mg/L
- After primary treatment: 80-150 mg/L
- After secondary treatment: 5-30 mg/L
- NPDES permit limit: 30 mg/L monthly average

High effluent TSS usually indicates clarifier problems — check blanket depth, SVI, and hydraulic loading.`,
  },
  {
    id: 'ammonia',
    title: 'Ammonia (NH3-N)',
    category: 'Water Quality',
    content: `Ammonia from human waste is toxic to aquatic life. Biological nitrification converts NH3 to nitrate (NO3).

Typical values:
- Raw wastewater: 20-40 mg/L
- After nitrification: 0.5-3 mg/L
- Permit limit: 2 mg/L summer, 5 mg/L winter

Nitrifying bacteria are:
- Slow-growing (doubling time ~12 hours vs 20 min for heterotrophs)
- Sensitive to low DO (need >0.5 mg/L, prefer >2.0)
- Sensitive to low temperatures
- Sensitive to toxins

Loss of nitrification can take weeks to recover!`,
  },

  // Regulatory
  {
    id: 'npdes',
    title: 'NPDES Permit',
    category: 'Regulatory',
    content: `The National Pollutant Discharge Elimination System (NPDES) permit sets legal limits on what you can discharge.

Your permit limits:
- BOD: 30 mg/L monthly avg, 45 weekly avg, 60 daily max
- TSS: 30 mg/L monthly avg, 45 weekly avg, 60 daily max
- NH3: 2.0 mg/L summer, 5.0 mg/L winter (monthly avg)
- Total P: 1.0 mg/L monthly avg
- pH: 6.5-8.5
- Chlorine residual: 0.1 mg/L daily max

Violations trigger escalating enforcement:
1 violation → Warning letter
3 violations (30 days) → Notice of Violation
6 violations → Consent Order
12 violations → Closure Risk

Fines start at $10,000 per violation and escalate.`,
  },

  // Operations
  {
    id: 'srt',
    title: 'SRT (Solids Retention Time)',
    category: 'Operations',
    content: `SRT is the average time biomass spends in the system. It's the single most important control parameter.

SRT = Total solids in system / Solids removed per day

Control: Adjust WAS (Waste Activated Sludge) rate
- Higher WAS rate → Lower SRT → Younger biomass, higher F:M
- Lower WAS rate → Higher SRT → Older biomass, lower F:M

Guidelines:
- 3-5 days: BOD removal only (no nitrification)
- 8-15 days: Nitrification
- 15-25 days: Extended aeration (but risk of filamentous bulking)
- >25 days: High risk of bulking, poor settling

Target: 8-12 days for balanced nitrification and good settling.`,
  },
  {
    id: 'ct_value',
    title: 'CT Value (Disinfection)',
    category: 'Operations',
    content: `CT is the product of disinfectant Concentration (C, in mg/L) and contact Time (T, in minutes). It quantifies disinfection effectiveness.

CT = Chlorine Residual (mg/L) × Contact Time (min)

This Plant:
- Contact time: 30 minutes (fixed by basin size)
- CT target: ≥ 20 mg·min/L for adequate pathogen inactivation
- Permit limit: Final chlorine residual < 0.1 mg/L

How to Achieve Both:
The key is dechlorination. Chlorine does its disinfection work during the 30-minute contact period. After that, sodium bisulfite is added to neutralize the remaining chlorine before discharge.

Step-by-step:
1. Calculate chlorine demand: BOD × 0.05 + TSS × 0.02 + 0.5 (base demand)
2. Dose chlorine above the demand to get a residual. For CT ≥ 20, you need residual ≥ 0.67 mg/L (0.67 × 30 = 20.1)
3. Dose bisulfite to remove the residual. At 90% efficiency, ~0.75 mg/L bisulfite removes 0.67 mg/L chlorine.

Example (clean effluent: BOD=15, TSS=15):
- Demand = 15×0.05 + 15×0.02 + 0.5 = 1.55 mg/L
- Chlorine dose = 2.5 mg/L → Residual = 0.95 mg/L → CT = 28.5 (good!)
- Bisulfite dose = 1.0 mg/L → Removes 0.9 → Final residual = 0.05 (compliant!)

Troubleshooting:
- CT too low? Increase chlorine dose.
- Residual too high? Increase bisulfite dose.
- Both bad? You may need cleaner effluent (lower BOD/TSS = lower chlorine demand).`,
  },
  {
    id: 'do',
    title: 'Dissolved Oxygen (DO)',
    category: 'Operations',
    content: `Oxygen is essential for aerobic biological treatment. Blowers supply air to the aeration basin.

Target: 2.0-3.0 mg/L
- <0.5 mg/L: Heterotrophs slow down, nitrification stops
- 0.5-1.5 mg/L: Reduced treatment, nitrifiers stressed
- 2.0-3.0 mg/L: Optimal for both BOD removal and nitrification
- >4.0 mg/L: Wasting energy without benefit

DO is the most responsive control — changes within minutes when blower speed is adjusted.

Energy note: Aeration typically accounts for 50-60% of total plant energy use. Optimizing DO saves money.`,
  },
];

export function EncyclopediaModal({ onClose }: { onClose: () => void }) {
  const [selectedEntry, setSelectedEntry] = useState<EncyclopediaEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const categories = [...new Set(ENTRIES.map((e) => e.category))];

  const filtered = searchTerm
    ? ENTRIES.filter((e) =>
        e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.content.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : ENTRIES;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal encyclopedia-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>OPERATOR HANDBOOK</span>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>

        <div className="modal-body encyclopedia-body">
          <input
            type="text"
            className="save-input"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ marginBottom: 8 }}
          />

          <div className="encyclopedia-layout">
            <div className="encyclopedia-nav">
              {categories.map((cat) => {
                const catEntries = filtered.filter((e) => e.category === cat);
                if (catEntries.length === 0) return null;
                return (
                  <div key={cat}>
                    <div className="section-label">{cat}</div>
                    {catEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`encyclopedia-nav-item ${selectedEntry?.id === entry.id ? 'active' : ''}`}
                        onClick={() => setSelectedEntry(entry)}
                      >
                        {entry.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="encyclopedia-content">
              {selectedEntry ? (
                <div>
                  <div className="encyclopedia-title">{selectedEntry.title}</div>
                  <div className="encyclopedia-category">{selectedEntry.category}</div>
                  <div className="encyclopedia-text">
                    {selectedEntry.content.split('\n\n').map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="muted" style={{ padding: 20, textAlign: 'center' }}>
                  Select a topic from the left to learn more about plant operations.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
