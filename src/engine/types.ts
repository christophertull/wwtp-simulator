// ── Core simulation types ──

export interface WaterStream {
  flow_mgd: number;
  tss_mg_l: number;
  bod_mg_l: number;
  nh3_mg_l: number;
  no3_mg_l: number;
  tp_mg_l: number;
  do_mg_l: number;
  ph: number;
  temperature_c: number;
  toxicity: number;
  chlorine_residual_mg_l: number;
}

export function createEmptyStream(): WaterStream {
  return {
    flow_mgd: 0,
    tss_mg_l: 0,
    bod_mg_l: 0,
    nh3_mg_l: 0,
    no3_mg_l: 0,
    tp_mg_l: 0,
    do_mg_l: 0,
    ph: 7.0,
    temperature_c: 18,
    toxicity: 0,
    chlorine_residual_mg_l: 0,
  };
}

export function cloneStream(s: WaterStream): WaterStream {
  return { ...s };
}

export interface ControlInputs {
  [key: string]: number | boolean;
}

export interface ProcessOutput {
  effluent: WaterStream;
  sludge?: WaterStream;
  powerDemand_kw: number;
  chemicalCosts_per_day: number;
  alarms: Alarm[];
}

export interface Alarm {
  id: string;
  processId: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface ProcessStatus {
  id: string;
  type: ProcessType;
  healthy: boolean;
  parameters: Record<string, number>;
  alarms: Alarm[];
}

export enum ProcessType {
  SCREENING = 'SCREENING',
  GRIT = 'GRIT',
  PRIMARY_CLARIFIER = 'PRIMARY_CLARIFIER',
  AERATION = 'AERATION',
  SECONDARY_CLARIFIER = 'SECONDARY_CLARIFIER',
  DISINFECTION = 'DISINFECTION',
  SLUDGE_DIGESTER = 'SLUDGE_DIGESTER',
}

export interface ProcessModel {
  id: string;
  type: ProcessType;
  update(dt: number, influent: WaterStream, controls: ControlInputs): ProcessOutput;
  getStatus(): ProcessStatus;
  getState(): Record<string, number>;
}

export interface GameClock {
  currentTime: number;       // ms since epoch (game world)
  timeScale: number;         // 0=paused, 1=normal, 2/5/10=fast
  tickIntervalMs: number;    // real-world ms per sim tick
  simMinutesPerTick: number; // game-world minutes per tick
}

export interface PermitLimits {
  bod_mg_l: { monthly_avg: number; weekly_avg: number; daily_max: number };
  tss_mg_l: { monthly_avg: number; weekly_avg: number; daily_max: number };
  nh3_mg_l: { monthly_avg_summer: number; monthly_avg_winter: number };
  tp_mg_l: { monthly_avg: number };
  ph: { min: number; max: number };
  chlorine_residual_mg_l: { daily_max: number };
}

export interface Violation {
  parameter: string;
  limit: number;
  actual: number;
  timestamp: number;
}

export interface PlantConfig {
  name: string;
  design_capacity_mgd: number;
  primary_clarifier: {
    count: number;
    surface_area_sqft: number;
    depth_ft: number;
  };
  aeration_basin: {
    count: number;
    volume_gal: number;
    target_mlss_mg_l: number;
    target_do_mg_l: number;
    target_srt_days: number;
  };
  secondary_clarifier: {
    count: number;
    surface_area_sqft: number;
    depth_ft: number;
  };
  blowers: {
    count: number;
    capacity_scfm: number;
    power_hp: number;
  };
}
