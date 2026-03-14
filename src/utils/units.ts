// Unit conversion utilities for wastewater engineering

/** Million gallons per day → gallons per minute */
export function mgdToGpm(mgd: number): number {
  return mgd * 1_000_000 / 1440;
}

/** Gallons per minute → million gallons per day */
export function gpmToMgd(gpm: number): number {
  return (gpm * 1440) / 1_000_000;
}

/** mg/L concentration + flow (MGD) → lb/day mass loading */
export function massLoading(concentration_mg_l: number, flow_mgd: number): number {
  return concentration_mg_l * flow_mgd * 8.34;
}

/** lb/day mass loading + flow (MGD) → mg/L concentration */
export function concentrationFromMass(mass_lb_day: number, flow_mgd: number): number {
  if (flow_mgd <= 0) return 0;
  return mass_lb_day / (flow_mgd * 8.34);
}

/** Gallons → cubic feet */
export function galToCuFt(gal: number): number {
  return gal / 7.48;
}

/** Horsepower → kilowatts */
export function hpToKw(hp: number): number {
  return hp * 0.7457;
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Linear interpolation on a lookup curve: [[x0,y0],[x1,y1],...] */
export function interpolate(curve: [number, number][], x: number): number {
  if (curve.length === 0) return 0;
  if (x <= curve[0][0]) return curve[0][1];
  if (x >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];

  for (let i = 0; i < curve.length - 1; i++) {
    const [x0, y0] = curve[i];
    const [x1, y1] = curve[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return curve[curve.length - 1][1];
}
