import { create } from 'zustand';
import { SimulationLoop } from '../engine/SimulationLoop';
import type {
  SimulationState, PlantControls, WeatherState, Equipment,
  FinanceState, GameEvent, LabSample, RegulatoryState,
} from '../engine/SimulationLoop';
import type { WaterStream, Alarm, Violation } from '../engine/types';
import { createEmptyStream } from '../engine/types';

// Default 5 MGD plant config
const DEFAULT_PLANT_CONFIG = {
  averageFlow_mgd: 3.8,
  primaryClarifier: { count: 2, surface_area_sqft: 1963, depth_ft: 12 },
  aerationTank: {
    volume_gal: 750_000,
    blower_count: 3,
    blower_capacity_scfm: 2000,
    blower_power_hp: 150,
  },
  secondaryClarifier: { count: 2, surface_area_sqft: 3318, depth_ft: 14 },
  digester: { volume_gal: 300_000 },
  servicePopulation: 25_000,
  startingBudget: 500_000,
};

const DEFAULT_CONTROLS: PlantControls = {
  preliminary: { rakeSpeed: 5 },
  primaryClarifier: { sludgePumpRate: 0.5 },
  aerationTank: { blowerSpeed: 0.7, rasRate: 0.5, wasRate: 0.01 },
  secondaryClarifier: { rasRate: 0.5 },
  disinfection: { chlorineDose: 3.0 },
  sludgeDigester: { feedRate: 0.5, tempSetpoint: 35, mixingIntensity: 0.7 },
};

interface TrendPoint {
  time: number;
  values: Record<string, number>;
}

interface GameStore {
  sim: SimulationLoop;
  running: boolean;
  timeScale: number;

  gameTimeMs: number;
  influent: WaterStream;
  effluent: WaterStream;
  processStates: Record<string, Record<string, number>>;
  totalPower_kw: number;
  totalChemicalCost_per_day: number;
  alarms: Alarm[];
  violations: Violation[];
  allViolations: Violation[];
  weather: WeatherState | null;
  finance: FinanceState | null;
  equipment: Equipment[];
  activeEvents: GameEvent[];
  labSamples: LabSample[];
  regulatory: RegulatoryState | null;

  controls: PlantControls;
  trends: TrendPoint[];
  selectedProcess: string | null;

  setTimeScale: (scale: number) => void;
  togglePause: () => void;
  setControl: (process: keyof PlantControls, key: string, value: number | boolean) => void;
  selectProcess: (id: string | null) => void;
  repairEquipment: (id: string) => void;
  maintainEquipment: (id: string) => void;
  collectSample: (type: 'grab' | 'composite', location: 'influent' | 'effluent' | 'aeration' | 'primary_effluent') => void;
  tick: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  sim: new SimulationLoop(DEFAULT_PLANT_CONFIG),
  running: false,
  timeScale: 1,

  gameTimeMs: Date.now(),
  influent: createEmptyStream(),
  effluent: createEmptyStream(),
  processStates: {},
  totalPower_kw: 0,
  totalChemicalCost_per_day: 0,
  alarms: [],
  violations: [],
  allViolations: [],
  weather: null,
  finance: null,
  equipment: [],
  activeEvents: [],
  labSamples: [],
  regulatory: null,

  controls: DEFAULT_CONTROLS,
  trends: [],
  selectedProcess: null,

  setTimeScale: (scale) => set({ timeScale: scale, running: scale > 0 }),
  togglePause: () => {
    const { timeScale } = get();
    if (timeScale === 0) {
      set({ timeScale: 1, running: true });
    } else {
      set({ timeScale: 0, running: false });
    }
  },

  setControl: (process, key, value) => {
    const { controls } = get();
    set({
      controls: {
        ...controls,
        [process]: { ...controls[process], [key]: value },
      },
    });
  },

  selectProcess: (id) => set({ selectedProcess: id }),

  repairEquipment: (id) => {
    get().sim.repairEquipment(id);
  },

  maintainEquipment: (id) => {
    get().sim.maintainEquipment(id);
  },

  collectSample: (type, location) => {
    get().sim.collectLabSample(type, location);
  },

  tick: () => {
    const { sim, controls, timeScale, trends } = get();
    if (timeScale === 0) return;

    const dt = 1;
    const result: SimulationState = sim.tick(dt, controls);

    // Trend sampling
    const newTrends = [...trends];
    const lastTrend = newTrends[newTrends.length - 1];
    if (!lastTrend || result.gameTimeMs - lastTrend.time >= 15 * 60 * 1000) {
      newTrends.push({
        time: result.gameTimeMs,
        values: {
          effluent_bod: result.effluentFinal.bod_mg_l,
          effluent_tss: result.effluentFinal.tss_mg_l,
          effluent_nh3: result.effluentFinal.nh3_mg_l,
          effluent_do: result.effluentFinal.do_mg_l,
          influent_flow: result.influent.flow_mgd,
          aeration_do: result.processStates.aerationTank?.do_mg_l ?? 0,
          aeration_mlss: result.processStates.aerationTank?.mlss_mg_l ?? 0,
          power_kw: result.totalPower_kw,
        },
      });
      if (newTrends.length > 96) newTrends.shift();
    }

    set({
      gameTimeMs: result.gameTimeMs,
      influent: result.influent,
      effluent: result.effluentFinal,
      processStates: result.processStates,
      totalPower_kw: result.totalPower_kw,
      totalChemicalCost_per_day: result.totalChemicalCost_per_day,
      alarms: result.alarms,
      violations: result.violations,
      allViolations: [...get().allViolations, ...result.violations],
      weather: result.weather,
      finance: result.finance,
      equipment: result.equipment,
      activeEvents: result.activeEvents,
      labSamples: result.labSamples,
      regulatory: result.regulatory,
      trends: newTrends,
    });
  },
}));
