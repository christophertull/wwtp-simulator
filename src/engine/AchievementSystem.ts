export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: 'operations' | 'compliance' | 'finance' | 'crisis' | 'mastery';
  unlocked: boolean;
  unlockedAt?: number;
  check: (stats: AchievementStats) => boolean;
}

export interface AchievementStats {
  totalGameMinutes: number;
  complianceStreak_days: number;
  totalViolations: number;
  budget: number;
  peakBudget: number;
  totalFines: number;
  samplesCollected: number;
  equipmentRepairs: number;
  eventsHandled: number;
  scenariosCompleted: number;
  maxTimeScale: number;
  effluentBod: number;
  effluentTss: number;
  effluentNh3: number;
  aerationMlss: number;
  aerationDo: number;
  biogas_kwh: number;
  stormsSurvived: number;
  spillsHandled: number;
}

const ACHIEVEMENT_DEFS: Array<Omit<Achievement, 'unlocked'>> = [
  // Operations
  {
    id: 'first_shift',
    name: 'First Shift',
    description: 'Operate the plant for 8 hours',
    category: 'operations',
    check: (s) => s.totalGameMinutes >= 480,
  },
  {
    id: 'veteran_operator',
    name: 'Veteran Operator',
    description: 'Operate the plant for 30 days',
    category: 'operations',
    check: (s) => s.totalGameMinutes >= 43200,
  },
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    description: 'Run the simulation at 10x speed',
    category: 'operations',
    check: (s) => s.maxTimeScale >= 10,
  },
  {
    id: 'lab_rat',
    name: 'Lab Rat',
    description: 'Collect 10 lab samples',
    category: 'operations',
    check: (s) => s.samplesCollected >= 10,
  },
  {
    id: 'wrench_turner',
    name: 'Wrench Turner',
    description: 'Complete 5 equipment repairs',
    category: 'operations',
    check: (s) => s.equipmentRepairs >= 5,
  },

  // Compliance
  {
    id: 'clean_streak_7',
    name: 'Clean Week',
    description: '7 consecutive days without violations',
    category: 'compliance',
    check: (s) => s.complianceStreak_days >= 7,
  },
  {
    id: 'clean_streak_30',
    name: 'Perfect Month',
    description: '30 consecutive days without violations',
    category: 'compliance',
    check: (s) => s.complianceStreak_days >= 30,
  },
  {
    id: 'crystal_clear',
    name: 'Crystal Clear',
    description: 'Achieve effluent BOD < 5 mg/L and TSS < 5 mg/L simultaneously',
    category: 'compliance',
    check: (s) => s.effluentBod < 5 && s.effluentTss < 5,
  },
  {
    id: 'zero_tolerance',
    name: 'Zero Tolerance',
    description: 'Complete a scenario with 0 violations',
    category: 'compliance',
    check: (s) => s.scenariosCompleted > 0 && s.totalViolations === 0,
  },

  // Finance
  {
    id: 'penny_pincher',
    name: 'Penny Pincher',
    description: 'Reach $750,000 budget',
    category: 'finance',
    check: (s) => s.peakBudget >= 750_000,
  },
  {
    id: 'millionaire',
    name: 'Millionaire',
    description: 'Accumulate $1,000,000 budget',
    category: 'finance',
    check: (s) => s.peakBudget >= 1_000_000,
  },
  {
    id: 'green_energy',
    name: 'Green Energy',
    description: 'Generate biogas energy from the digester',
    category: 'finance',
    check: (s) => s.biogas_kwh > 0,
  },

  // Crisis
  {
    id: 'storm_rider',
    name: 'Storm Rider',
    description: 'Maintain compliance through a storm event',
    category: 'crisis',
    check: (s) => s.stormsSurvived >= 1,
  },
  {
    id: 'toxic_avenger',
    name: 'Toxic Avenger',
    description: 'Survive an industrial spill without losing nitrification',
    category: 'crisis',
    check: (s) => s.spillsHandled >= 1,
  },
  {
    id: 'crisis_manager',
    name: 'Crisis Manager',
    description: 'Handle 5 random events without violations',
    category: 'crisis',
    check: (s) => s.eventsHandled >= 5,
  },

  // Mastery
  {
    id: 'scenario_one',
    name: 'Scenario Complete',
    description: 'Complete your first scenario',
    category: 'mastery',
    check: (s) => s.scenariosCompleted >= 1,
  },
  {
    id: 'scenario_all',
    name: 'Master Operator',
    description: 'Complete all scenarios',
    category: 'mastery',
    check: (s) => s.scenariosCompleted >= 3,
  },
  {
    id: 'nitrification_master',
    name: 'Nitrification Master',
    description: 'Achieve effluent NH3 < 1.0 mg/L',
    category: 'mastery',
    check: (s) => s.effluentNh3 < 1.0,
  },
];

export class AchievementSystem {
  private achievements: Achievement[];
  private stats: AchievementStats;

  constructor() {
    this.achievements = ACHIEVEMENT_DEFS.map((def) => ({
      ...def,
      unlocked: false,
    }));
    this.stats = {
      totalGameMinutes: 0,
      complianceStreak_days: 0,
      totalViolations: 0,
      budget: 500_000,
      peakBudget: 500_000,
      totalFines: 0,
      samplesCollected: 0,
      equipmentRepairs: 0,
      eventsHandled: 0,
      scenariosCompleted: 0,
      maxTimeScale: 1,
      effluentBod: 999,
      effluentTss: 999,
      effluentNh3: 999,
      aerationMlss: 0,
      aerationDo: 0,
      biogas_kwh: 0,
      stormsSurvived: 0,
      spillsHandled: 0,
    };
  }

  update(dt: number, partialStats: Partial<AchievementStats>): Achievement[] {
    this.stats.totalGameMinutes += dt;
    Object.assign(this.stats, partialStats);

    if (this.stats.budget > this.stats.peakBudget) {
      this.stats.peakBudget = this.stats.budget;
    }

    const newlyUnlocked: Achievement[] = [];

    for (const ach of this.achievements) {
      if (ach.unlocked) continue;

      if (ach.check(this.stats)) {
        ach.unlocked = true;
        ach.unlockedAt = Date.now();
        newlyUnlocked.push(ach);
      }
    }

    return newlyUnlocked;
  }

  incrementStat(key: keyof AchievementStats, amount: number = 1) {
    (this.stats[key] as number) += amount;
  }

  getAchievements(): Achievement[] {
    return this.achievements.map((a) => ({ ...a }));
  }

  getStats(): AchievementStats {
    return { ...this.stats };
  }

  getUnlockedCount(): number {
    return this.achievements.filter((a) => a.unlocked).length;
  }

  getTotalCount(): number {
    return this.achievements.length;
  }
}
