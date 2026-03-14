import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../../state/gameStore';

interface TrendSeries {
  key: string;
  label: string;
  color: string;
  unit: string;
  min?: number;
  max?: number;
}

const SERIES_SETS: Record<string, TrendSeries[]> = {
  effluent: [
    { key: 'effluent_bod', label: 'BOD', color: '#f44336', unit: 'mg/L', min: 0, max: 80 },
    { key: 'effluent_tss', label: 'TSS', color: '#ff9800', unit: 'mg/L', min: 0, max: 80 },
    { key: 'effluent_nh3', label: 'NH3', color: '#9c27b0', unit: 'mg/L', min: 0, max: 30 },
  ],
  aeration: [
    { key: 'aeration_do', label: 'DO', color: '#2196f3', unit: 'mg/L', min: 0, max: 10 },
    { key: 'aeration_mlss', label: 'MLSS', color: '#795548', unit: 'mg/L', min: 0, max: 6000 },
  ],
  flow: [
    { key: 'influent_flow', label: 'Flow', color: '#00bcd4', unit: 'MGD', min: 0, max: 15 },
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
    const margin = { top: 8, right: 8, bottom: 20, left: 40 };
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
    ctx.fillText(`${hoursRange.toFixed(0)}h span`, W / 2, H - 4);

    // Draw each series
    for (const s of series) {
      const values = trends.map((t) => t.values[s.key] ?? 0);
      const yMin = s.min ?? Math.min(...values);
      const yMax = s.max ?? Math.max(...values) * 1.1;
      const yRange = yMax - yMin || 1;

      // Y-axis labels (just for first series)
      if (s === series[0]) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 4; i++) {
          const val = yMax - (yRange * i) / 4;
          const y = margin.top + (plotH * i) / 4;
          ctx.fillText(val.toFixed(val > 100 ? 0 : 1), margin.left - 4, y + 3);
        }
      }

      // Line
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < trends.length; i++) {
        const x = margin.left + (i / (trends.length - 1)) * plotW;
        const y = margin.top + plotH - ((values[i] - yMin) / yRange) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
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
  }, [trends, series]);

  useEffect(() => {
    let frameId: number;
    const loop = () => {
      draw();
      frameId = requestAnimationFrame(loop);
    };
    // Only redraw every few frames
    const interval = setInterval(() => {
      frameId = requestAnimationFrame(draw);
    }, 500);
    draw();
    return () => {
      clearInterval(interval);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block' }}
    />
  );
}
