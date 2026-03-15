import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../../state/gameStore';

interface TrendSeries {
  key: string;
  label: string;
  color: string;
  unit: string;
  complianceLimit?: number;
  complianceLimitLabel?: string;
}

const SERIES_SETS: Record<string, TrendSeries[]> = {
  effluent_bod: [
    { key: 'effluent_bod', label: 'BOD', color: '#f44336', unit: 'mg/L', complianceLimit: 60, complianceLimitLabel: 'Daily Max: 60' },
  ],
  effluent_tss: [
    { key: 'effluent_tss', label: 'TSS', color: '#ff9800', unit: 'mg/L', complianceLimit: 60, complianceLimitLabel: 'Daily Max: 60' },
  ],
  effluent_nh3: [
    { key: 'effluent_nh3', label: 'NH3', color: '#9c27b0', unit: 'mg/L', complianceLimit: 5, complianceLimitLabel: 'Limit: 5.0' },
  ],
  aeration_do: [
    { key: 'aeration_do', label: 'DO', color: '#2196f3', unit: 'mg/L' },
  ],
  aeration_mlss: [
    { key: 'aeration_mlss', label: 'MLSS', color: '#795548', unit: 'mg/L' },
  ],
  flow: [
    { key: 'influent_flow', label: 'Flow', color: '#00bcd4', unit: 'MGD' },
  ],
  // Legacy combined sets for backwards compatibility
  effluent: [
    { key: 'effluent_bod', label: 'BOD', color: '#f44336', unit: 'mg/L', complianceLimit: 60 },
    { key: 'effluent_tss', label: 'TSS', color: '#ff9800', unit: 'mg/L', complianceLimit: 60 },
    { key: 'effluent_nh3', label: 'NH3', color: '#9c27b0', unit: 'mg/L', complianceLimit: 5 },
  ],
  aeration: [
    { key: 'aeration_do', label: 'DO', color: '#2196f3', unit: 'mg/L' },
    { key: 'aeration_mlss', label: 'MLSS', color: '#795548', unit: 'mg/L' },
  ],
};

interface Props {
  seriesSet: keyof typeof SERIES_SETS;
  height?: number;
}

export function TrendChart({ seriesSet, height = 120 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trends = useGameStore((s) => s.trends);
  const series = SERIES_SETS[seriesSet] || SERIES_SETS.effluent;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const margin = { top: 8, right: 8, bottom: 20, left: 44 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    // Background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(W - margin.right, y);
      ctx.stroke();
    }

    if (trends.length < 2) {
      ctx.fillStyle = '#4b5563';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Collecting data...', W / 2, H / 2);
      return;
    }

    // Compute auto-scaled Y range across all series
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const s of series) {
      const values = trends.map((t) => t.values[s.key] ?? 0);
      const seriesMax = Math.max(...values);
      const seriesMin = Math.min(...values);
      if (seriesMax > yMax) yMax = seriesMax;
      if (seriesMin < yMin) yMin = seriesMin;
      // Include compliance limit in range
      if (s.complianceLimit !== undefined) {
        if (s.complianceLimit > yMax) yMax = s.complianceLimit;
      }
    }
    // Add padding
    yMin = Math.max(0, yMin - (yMax - yMin) * 0.05);
    yMax = yMax * 1.15;
    if (yMax <= yMin) yMax = yMin + 1;
    const yRange = yMax - yMin;

    // Time axis
    const timeRange = trends[trends.length - 1].time - trends[0].time;
    const hoursRange = timeRange / 3_600_000;

    ctx.fillStyle = '#6b7280';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const t = trends[0].time + (timeRange * i) / 4;
      const d = new Date(t);
      const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      const x = margin.left + (plotW * i) / 4;
      ctx.fillText(label, x, H - 4);
    }

    // Y-axis labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = yMax - (yRange * i) / 4;
      const y = margin.top + (plotH * i) / 4;
      ctx.fillText(val.toFixed(val > 100 ? 0 : 1), margin.left - 4, y + 3);
    }

    // Draw compliance limit lines
    for (const s of series) {
      if (s.complianceLimit !== undefined) {
        const limitY = margin.top + plotH - ((s.complianceLimit - yMin) / yRange) * plotH;
        if (limitY >= margin.top && limitY <= margin.top + plotH) {
          ctx.strokeStyle = '#f4433666';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(margin.left, limitY);
          ctx.lineTo(W - margin.right, limitY);
          ctx.stroke();
          ctx.setLineDash([]);

          // Label
          if (s.complianceLimitLabel) {
            ctx.fillStyle = '#f4433699';
            ctx.font = '8px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(s.complianceLimitLabel, W - margin.right - 2, limitY - 3);
          }
        }
      }
    }

    // Draw each series
    for (const s of series) {
      const values = trends.map((t) => t.values[s.key] ?? 0);

      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < trends.length; i++) {
        const x = margin.left + (i / (trends.length - 1)) * plotW;
        const y = margin.top + plotH - ((values[i] - yMin) / yRange) * plotH;
        const clampedY = Math.max(margin.top, Math.min(margin.top + plotH, y));
        if (i === 0) ctx.moveTo(x, clampedY);
        else ctx.lineTo(x, clampedY);
      }
      ctx.stroke();
    }

    // Legend
    ctx.textAlign = 'left';
    let legendX = margin.left + 4;
    for (const s of series) {
      ctx.fillStyle = s.color;
      ctx.fillRect(legendX, margin.top + 2, 8, 8);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '9px monospace';
      ctx.fillText(s.label, legendX + 11, margin.top + 9);
      legendX += ctx.measureText(s.label).width + 20;
    }

    // Span label
    ctx.fillStyle = '#4b5563';
    ctx.textAlign = 'right';
    ctx.fillText(`${hoursRange.toFixed(0)}h`, W - margin.right, margin.top + 9);
  }, [trends, series]);

  useEffect(() => {
    const interval = setInterval(() => {
      requestAnimationFrame(draw);
    }, 500);
    draw();
    return () => clearInterval(interval);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block' }}
    />
  );
}
