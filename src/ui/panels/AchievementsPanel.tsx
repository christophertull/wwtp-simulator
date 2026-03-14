import { useState } from 'react';
import type { Achievement } from '../../engine/AchievementSystem';

const CATEGORY_LABELS: Record<string, string> = {
  operations: 'OPERATIONS',
  compliance: 'COMPLIANCE',
  finance: 'FINANCE',
  crisis: 'CRISIS MANAGEMENT',
  mastery: 'MASTERY',
};

interface Props {
  achievements: Achievement[];
  unlockedCount: number;
  totalCount: number;
}

export function AchievementsPanel({ achievements, unlockedCount, totalCount }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <div className="panel">
        <div className="panel-header" onClick={() => setExpanded(true)} style={{ cursor: 'pointer' }}>
          ACHIEVEMENTS
          <span className="badge badge-green">
            {unlockedCount}/{totalCount}
          </span>
        </div>
      </div>
    );
  }

  const categories = ['operations', 'compliance', 'finance', 'crisis', 'mastery'];

  return (
    <div className="panel">
      <div className="panel-header" onClick={() => setExpanded(false)} style={{ cursor: 'pointer' }}>
        ACHIEVEMENTS
        <span className="badge badge-green">
          {unlockedCount}/{totalCount}
        </span>
      </div>
      <div className="panel-body">
        {categories.map((cat) => {
          const catAchievements = achievements.filter((a) => a.category === cat);
          if (catAchievements.length === 0) return null;
          return (
            <div key={cat}>
              <div className="section-label">{CATEGORY_LABELS[cat]}</div>
              {catAchievements.map((ach) => (
                <div
                  key={ach.id}
                  className={`achievement-item ${ach.unlocked ? 'unlocked' : ''}`}
                >
                  <span className="achievement-icon">
                    {ach.unlocked ? '[*]' : '[ ]'}
                  </span>
                  <div className="achievement-info">
                    <span className={`achievement-name ${ach.unlocked ? '' : 'muted'}`}>
                      {ach.name}
                    </span>
                    <span className="achievement-desc">{ach.description}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
