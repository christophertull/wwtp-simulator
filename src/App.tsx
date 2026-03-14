import { useEffect, useRef } from 'react';
import { useGameStore } from './state/gameStore';
import { TopBar } from './ui/layout/TopBar';
import { PlantSchematic } from './ui/schematic/PlantSchematic';
import { ProcessDetailPanel } from './ui/panels/ProcessDetailPanel';
import { AlarmPanel } from './ui/panels/AlarmPanel';
import { EffluentPanel } from './ui/panels/EffluentPanel';

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

    const TICK_INTERVAL_MS = 1000; // 1 real second = 1 game-minute at 1x

    const loop = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;

      const scale = timeScaleRef.current;
      if (scale > 0) {
        accumulator += delta * scale;

        // Process accumulated time in ticks
        let ticksThisFrame = 0;
        const maxTicksPerFrame = 20; // prevent spiral of death
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
        </div>
        <div className="panels-area">
          <ProcessDetailPanel />
          <EffluentPanel />
          <AlarmPanel />
        </div>
      </div>
    </div>
  );
}
