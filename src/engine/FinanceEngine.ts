export interface FinanceState {
  budget: number;
  totalRevenue: number;
  totalExpenses: number;
  // Daily rates
  daily: {
    revenue: number;
    energy: number;
    chemicals: number;
    labor: number;
    maintenance: number;
    sludgeDisposal: number;
    fines: number;
    biogasCredit: number;
  };
  // Running totals
  monthly: {
    revenue: number;
    expenses: number;
    fines: number;
  };
  energyPrice_per_kwh: number;
  violationFine: number;
}

export class FinanceEngine {
  private state: FinanceState;
  private servicePopulation: number;
  private monthlyResetTime: number = 0;

  constructor(config: {
    startingBudget: number;
    servicePopulation: number;
    energyPrice_per_kwh?: number;
    violationFine?: number;
  }) {
    this.servicePopulation = config.servicePopulation;
    const monthlyRevenue = config.servicePopulation * 3.5; // ~$3.50/person/month

    this.state = {
      budget: config.startingBudget,
      totalRevenue: 0,
      totalExpenses: 0,
      daily: {
        revenue: monthlyRevenue / 30,
        energy: 0,
        chemicals: 0,
        labor: 450, // ~$164k/year for small staff
        maintenance: 0,
        sludgeDisposal: 0,
        fines: 0,
        biogasCredit: 0,
      },
      monthly: { revenue: 0, expenses: 0, fines: 0 },
      energyPrice_per_kwh: config.energyPrice_per_kwh ?? 0.10,
      violationFine: config.violationFine ?? 10000,
    };
  }

  update(dtMinutes: number, inputs: {
    totalPower_kw: number;
    chemicalCosts_per_day: number;
    maintenanceCost: number;
    violationCount: number;
    biogasEnergy_kwh: number;
    sludgeProduction_gal: number;
  }): FinanceState {
    const dtDays = dtMinutes / (60 * 24);

    // Energy cost
    const energyCost = inputs.totalPower_kw * 24 * this.state.energyPrice_per_kwh * dtDays;

    // Chemical cost
    const chemCost = inputs.chemicalCosts_per_day * dtDays;

    // Labor (constant)
    const laborCost = this.state.daily.labor * dtDays;

    // Maintenance
    const maintCost = inputs.maintenanceCost;

    // Sludge disposal ($0.05/gal)
    const sludgeCost = inputs.sludgeProduction_gal * 0.05 * dtDays;

    // Fines
    const fines = inputs.violationCount * this.state.violationFine;

    // Biogas credit (offset energy costs)
    const biogasCredit = inputs.biogasEnergy_kwh * this.state.energyPrice_per_kwh * dtDays;

    // Revenue
    const revenue = this.state.daily.revenue * dtDays;

    // Net
    const totalDailyExpenses = energyCost + chemCost + laborCost + maintCost + sludgeCost + fines;
    const netIncome = revenue + biogasCredit - totalDailyExpenses;

    this.state.budget += netIncome;
    this.state.totalRevenue += revenue + biogasCredit;
    this.state.totalExpenses += totalDailyExpenses;

    // Update daily rates for display
    this.state.daily.energy = inputs.totalPower_kw * 24 * this.state.energyPrice_per_kwh;
    this.state.daily.chemicals = inputs.chemicalCosts_per_day;
    this.state.daily.maintenance = inputs.maintenanceCost / Math.max(dtDays, 0.001);
    this.state.daily.sludgeDisposal = inputs.sludgeProduction_gal * 0.05;
    this.state.daily.fines = fines / Math.max(dtDays, 0.001);
    this.state.daily.biogasCredit = inputs.biogasEnergy_kwh * this.state.energyPrice_per_kwh;

    // Monthly accumulation
    this.state.monthly.revenue += revenue;
    this.state.monthly.expenses += totalDailyExpenses;
    this.state.monthly.fines += fines;

    return this.getState();
  }

  resetMonthly() {
    this.state.monthly = { revenue: 0, expenses: 0, fines: 0 };
  }

  getState(): FinanceState {
    return { ...this.state, daily: { ...this.state.daily }, monthly: { ...this.state.monthly } };
  }
}
