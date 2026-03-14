import { useEffect, useRef } from 'react';
import { useGameStore } from './state/gameStore';
import { TopBar } from './ui/layout/TopBar';
import { PlantSchematic } from './ui/schematic/PlantSchematic';
import { ProcessDetailPanel } from './ui/panels/ProcessDetailPanel';
import { AlarmPanel } from './ui/panels/AlarmPanel';
import { EffluentPanel } from './ui/panels/EffluentPanel';
import { FinancePanel } from './ui/panels/FinancePanel';
import { EquipmentPanel } from './ui/panels/EquipmentPanel';
import { TrendChart } from './ui/charts/TrendChart';

export default function App() {
  const timeScale = useGameStore((s) => s.timeScale);
  const tick = useGameStore((s) => s.tick);
  const tickRef = useRef(tick);
  tickRef.current = tick;

  const timeScaleRef = useRef(timeScale);
  timeScaleRef.current = timeScale;

  // Simulation loop - runs ticks based on timeScale
  useEffect(() => {
    let lastTime = performance.now();
    let accumulator = 0;
    let frameId: number;

    const TICK_INTERVAL_MS = 1000;

    const loop = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;

      const scale = timeScaleRef.current;
      if (scale > 0) {
        accumulator += delta * scale;

        let ticksThisFrame = 0;
        const maxTicksPerFrame = 20;
        while (accumulator >= TICK_INTERVAL_MS && ticksThisFrame < maxTicksPerFrame) {
          tickRef.current();
          accumulator -= TICK_INTERVAL_MS;
          ticksThisFrame++;
        }
        if (ticksThisFrame >= maxTicksPerFrame) {
          accumulator = 0;
        }
      }

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div className="app">
      <TopBar />
      <div className="main-content">
        <div className="schematic-area">
          <PlantSchematic />
          <div className="trend-area">
            <div className="trend-section">
              <div className="trend-label">EFFLUENT QUALITY</div>
              <TrendChart seriesSet="effluent" height={100} />
            </div>
            <div className="trend-section">
              <div className="trend-label">AERATION</div>
              <TrendChart seriesSet="aeration" height={100} />
            </div>
            <div className="trend-section">
              <div className="trend-label">INFLUENT FLOW</div>
              <TrendChart seriesSet="flow" height={100} />
            </div>
          </div>
        </div>
        <div className="panels-area">
          <ProcessDetailPanel />
          <EffluentPanel />
          <FinancePanel />
          <EquipmentPanel />
          <AlarmPanel />
        </div>
      </div>
    </div>
  );
}
