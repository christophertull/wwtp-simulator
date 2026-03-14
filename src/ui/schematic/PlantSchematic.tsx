import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../../state/gameStore';

interface ProcessBox {
  id: string;
  label: string;
  storeKey: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

const PROCESSES: ProcessBox[] = [
  { id: 'preliminary', label: 'Screening\n& Grit', storeKey: 'preliminary', x: 50, y: 150, w: 100, h: 70, color: '#607d8b' },
  { id: 'primaryClarifier', label: 'Primary\nClarifier', storeKey: 'primaryClarifier', x: 200, y: 150, w: 110, h: 70, color: '#795548' },
  { id: 'aerationTank', label: 'Aeration\nTank', storeKey: 'aerationTank', x: 370, y: 150, w: 130, h: 70, color: '#2196f3' },
  { id: 'secondaryClarifier', label: 'Secondary\nClarifier', storeKey: 'secondaryClarifier', x: 560, y: 150, w: 110, h: 70, color: '#4caf50' },
  { id: 'disinfection', label: 'Disinfection', storeKey: 'disinfection', x: 720, y: 150, w: 100, h: 70, color: '#ff9800' },
  { id: 'sludgeDigester', label: 'Sludge\nDigester', storeKey: 'sludgeDigester', x: 370, y: 300, w: 120, h: 60, color: '#8d6e63' },
];

const PIPE_SEGMENTS = [
  { from: 'influent', to: 'preliminary' },
  { from: 'preliminary', to: 'primaryClarifier' },
  { from: 'primaryClarifier', to: 'aerationTank' },
  { from: 'aerationTank', to: 'secondaryClarifier' },
  { from: 'secondaryClarifier', to: 'disinfection' },
  { from: 'disinfection', to: 'effluent' },
];

export function PlantSchematic() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedProcess = useGameStore((s) => s.selectedProcess);
  const selectProcess = useGameStore((s) => s.selectProcess);
  const influent = useGameStore((s) => s.influent);
  const effluent = useGameStore((s) => s.effluent);
  const processStates = useGameStore((s) => s.processStates);
  const alarms = useGameStore((s) => s.alarms);

  const animOffset = useRef(0);

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

    ctx.clearRect(0, 0, rect.width, rect.height);

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Title
    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    ctx.fillText('TREATMENT TRAIN - PROCESS FLOW DIAGRAM', 50, 30);

    // Influent label
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText(`INFLUENT`, 10, 145);
    ctx.fillText(`${influent.flow_mgd.toFixed(2)} MGD`, 10, 158);
    ctx.fillText(`BOD: ${influent.bod_mg_l.toFixed(0)}`, 10, 171);
    ctx.fillText(`TSS: ${influent.tss_mg_l.toFixed(0)}`, 10, 184);

    // Effluent label
    ctx.fillStyle = '#888';
    ctx.fillText(`EFFLUENT`, 835, 145);
    ctx.fillText(`${effluent.flow_mgd.toFixed(2)} MGD`, 835, 158);
    ctx.fillText(`BOD: ${effluent.bod_mg_l.toFixed(1)}`, 835, 171);
    ctx.fillText(`TSS: ${effluent.tss_mg_l.toFixed(1)}`, 835, 184);
    ctx.fillText(`NH3: ${effluent.nh3_mg_l.toFixed(1)}`, 835, 197);

    // Draw pipes with animated flow particles
    animOffset.current = (animOffset.current + 0.5) % 20;

    for (const seg of PIPE_SEGMENTS) {
      const fromBox = PROCESSES.find((p) => p.id === seg.from);
      const toBox = PROCESSES.find((p) => p.id === seg.to);

      let x1: number, y1: number, x2: number, y2: number;

      if (!fromBox) {
        x1 = 45; y1 = 185;
      } else {
        x1 = fromBox.x + fromBox.w; y1 = fromBox.y + fromBox.h / 2;
      }

      if (!toBox) {
        x2 = 830; y2 = 185;
      } else {
        x2 = toBox.x; y2 = toBox.y + toBox.h / 2;
      }

      // Pipe line
      ctx.strokeStyle = '#334';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Animated flow particles
      ctx.fillStyle = '#4488cc88';
      const pipeLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      const dx = (x2 - x1) / pipeLength;
      const dy = (y2 - y1) / pipeLength;
      for (let d = animOffset.current; d < pipeLength; d += 20) {
        ctx.beginPath();
        ctx.arc(x1 + dx * d, y1 + dy * d, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // RAS recycle loop (secondary clarifier → aeration)
    const secClr = PROCESSES[3];
    const aer = PROCESSES[2];
    const priClr = PROCESSES[1];
    const digester = PROCESSES[5];
    const rasY = secClr.y + secClr.h + 20;
    ctx.strokeStyle = '#556';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(secClr.x + secClr.w / 2, secClr.y + secClr.h);
    ctx.lineTo(secClr.x + secClr.w / 2, rasY);
    ctx.lineTo(aer.x + aer.w / 2, rasY);
    ctx.lineTo(aer.x + aer.w / 2, aer.y + aer.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#888';
    ctx.font = '9px monospace';
    ctx.fillText('RAS', (secClr.x + aer.x + aer.w) / 2, rasY + 12);

    // Sludge line: primary clarifier → digester
    ctx.strokeStyle = '#8d6e6388';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(priClr.x + priClr.w / 2, priClr.y + priClr.h);
    ctx.lineTo(priClr.x + priClr.w / 2, digester.y + digester.h / 2);
    ctx.lineTo(digester.x, digester.y + digester.h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#8d6e63';
    ctx.font = '8px monospace';
    ctx.fillText('Sludge', priClr.x + priClr.w / 2 + 4, digester.y + digester.h / 2 - 6);

    // WAS line: secondary clarifier → digester
    ctx.strokeStyle = '#8d6e6388';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(secClr.x + secClr.w * 0.7, secClr.y + secClr.h);
    ctx.lineTo(secClr.x + secClr.w * 0.7, digester.y + digester.h / 2);
    ctx.lineTo(digester.x + digester.w, digester.y + digester.h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#8d6e63';
    ctx.fillText('WAS', secClr.x + secClr.w * 0.7 + 4, digester.y + digester.h / 2 - 6);

    // Draw process boxes
    for (const proc of PROCESSES) {
      const isSelected = selectedProcess === proc.id;
      const hasAlarm = alarms.some((a) => a.processId === proc.id || a.processId === proc.storeKey);
      const hasCritical = alarms.some((a) => (a.processId === proc.id || a.processId === proc.storeKey) && a.severity === 'critical');

      // Box shadow/glow for selected or alarm
      if (isSelected) {
        ctx.shadowColor = '#4488ff';
        ctx.shadowBlur = 12;
      } else if (hasCritical) {
        ctx.shadowColor = '#ff4444';
        ctx.shadowBlur = 8;
      } else if (hasAlarm) {
        ctx.shadowColor = '#ffaa00';
        ctx.shadowBlur = 6;
      }

      // Box fill
      ctx.fillStyle = proc.color + (isSelected ? 'dd' : '88');
      ctx.strokeStyle = isSelected ? '#fff' : hasAlarm ? '#ffaa00' : '#555';
      ctx.lineWidth = isSelected ? 2 : 1;
      roundRect(ctx, proc.x, proc.y, proc.w, proc.h, 6);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      const lines = proc.label.split('\n');
      lines.forEach((line, i) => {
        ctx.fillText(line, proc.x + proc.w / 2, proc.y + 25 + i * 14);
      });

      // Key parameter below box
      ctx.font = '9px monospace';
      ctx.fillStyle = '#aaa';
      const state = processStates[proc.storeKey];
      if (state) {
        const paramLines = getKeyParams(proc.storeKey, state);
        paramLines.forEach((line, i) => {
          ctx.fillText(line, proc.x + proc.w / 2, proc.y + proc.h + 14 + i * 12);
        });
      }

      ctx.textAlign = 'left';
    }

    // Permit limits legend
    ctx.fillStyle = '#666';
    ctx.font = '9px monospace';
    ctx.fillText('PERMIT LIMITS: BOD<60  TSS<60  NH3<5.0  Cl2<0.1', 50, rect.height - 15);

  }, [influent, effluent, processStates, alarms, selectedProcess]);

  // Animation loop
  useEffect(() => {
    let frameId: number;
    const loop = () => {
      draw();
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [draw]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const proc of PROCESSES) {
      if (x >= proc.x && x <= proc.x + proc.w && y >= proc.y && y <= proc.y + proc.h) {
        selectProcess(selectedProcess === proc.id ? null : proc.id);
        return;
      }
    }
    selectProcess(null);
  }, [selectProcess, selectedProcess]);

  return (
    <canvas
      ref={canvasRef}
      className="plant-schematic"
      onClick={handleClick}
      style={{ width: '100%', height: 400, cursor: 'pointer' }}
    />
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function getKeyParams(storeKey: string, state: Record<string, number>): string[] {
  switch (storeKey) {
    case 'preliminary':
      return [`Blinding: ${((state.blindingLevel ?? 0) * 100).toFixed(0)}%`];
    case 'primaryClarifier':
      return [`Blanket: ${(state.sludgeBlanketDepth_ft ?? 0).toFixed(1)} ft`];
    case 'aerationTank':
      return [
        `DO: ${(state.do_mg_l ?? 0).toFixed(1)} mg/L`,
        `MLSS: ${(state.mlss_mg_l ?? 0).toFixed(0)}`,
      ];
    case 'secondaryClarifier':
      return [
        `Blanket: ${(state.blanketDepth_ft ?? 0).toFixed(1)} ft`,
        `SVI: ${(state.svi ?? 0).toFixed(0)}`,
      ];
    case 'disinfection':
      return [`CT: ${(state.ct_achieved ?? 0).toFixed(0)}`];
    case 'sludgeDigester':
      return [
        `${(state.temperature_c ?? 0).toFixed(0)}C pH:${(state.ph ?? 0).toFixed(1)}`,
        `Gas: ${(state.biogas_ft3_day ?? 0).toFixed(0)} ft3/d`,
      ];
    default:
      return [];
  }
}
