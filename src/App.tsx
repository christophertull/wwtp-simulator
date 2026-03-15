import { useEffect, useRef, useCallback, useState } from 'react';
import { useGameStore } from './state/gameStore';
import { MainMenu } from './ui/screens/MainMenu';
import { TopBar } from './ui/layout/TopBar';
import { PlantSchematic } from './ui/schematic/PlantSchematic';
import { ProcessDetailPanel } from './ui/panels/ProcessDetailPanel';
import { AlarmPanel } from './ui/panels/AlarmPanel';
import { EffluentPanel } from './ui/panels/EffluentPanel';
import { FinancePanel } from './ui/panels/FinancePanel';
import { EquipmentPanel } from './ui/panels/EquipmentPanel';
import { LabPanel } from './ui/panels/LabPanel';
import { EventsPanel } from './ui/panels/EventsPanel';
import { ScenarioPanel } from './ui/panels/ScenarioPanel';
import { TrendChart } from './ui/charts/TrendChart';
import { SaveLoadModal } from './ui/modals/SaveLoadModal';
import { ScenarioCompleteModal } from './ui/modals/ScenarioCompleteModal';
import { EncyclopediaModal } from './ui/modals/EncyclopediaModal';

export default function App() {
  const screen = useGameStore((s) => s.screen);
  const timeScale = useGameStore((s) => s.timeScale);
  const tick = useGameStore((s) => s.tick);
  const setTimeScale = useGameStore((s) => s.setTimeScale);
  const togglePause = useGameStore((s) => s.togglePause);
  const showSaveModal = useGameStore((s) => s.showSaveModal);
  const toggleSaveModal = useGameStore((s) => s.toggleSaveModal);
  const scenario = useGameStore((s) => s.scenario);
  const tickRef = useRef(tick);
  tickRef.current = tick;

  const timeScaleRef = useRef(timeScale);
  timeScaleRef.current = timeScale;

  const [showComplete, setShowComplete] = useState(false);
  const [showEncyclopedia, setShowEncyclopedia] = useState(false);
  const prevScenarioActive = useRef<boolean | null>(null);

  // Detect scenario completion
  useEffect(() => {
    if (scenario && prevScenarioActive.current === true && !scenario.active) {
      setShowComplete(true);
    }
    prevScenarioActive.current = scenario?.active ?? null;
  }, [scenario?.active]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        togglePause();
        break;
      case '1': setTimeScale(1); break;
      case '2': setTimeScale(2); break;
      case '3': setTimeScale(5); break;
      case '4': setTimeScale(10); break;
      case '0': setTimeScale(0); break;
      case 'Escape':
        setShowEncyclopedia(false);
        break;
      case 's':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          toggleSaveModal();
        }
        break;
      case 'h':
        setShowEncyclopedia((v) => !v);
        break;
    }
  }, [setTimeScale, togglePause, toggleSaveModal]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Simulation loop
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

  if (screen === 'menu') {
    return <MainMenu />;
  }

  return (
    <div className="app">
      <TopBar onToggleEncyclopedia={() => setShowEncyclopedia((v) => !v)} />
      <div className="main-content">
        <div className="schematic-area">
          <PlantSchematic />
          <div className="trend-area">
            <div className="trend-section">
              <div className="trend-label">BOD (mg/L)</div>
              <TrendChart seriesSet="effluent_bod" height={80} />
            </div>
            <div className="trend-section">
              <div className="trend-label">TSS (mg/L)</div>
              <TrendChart seriesSet="effluent_tss" height={80} />
            </div>
            <div className="trend-section">
              <div className="trend-label">NH3 (mg/L)</div>
              <TrendChart seriesSet="effluent_nh3" height={80} />
            </div>
            <div className="trend-section">
              <div className="trend-label">AERATION DO</div>
              <TrendChart seriesSet="aeration_do" height={80} />
            </div>
            <div className="trend-section">
              <div className="trend-label">MLSS</div>
              <TrendChart seriesSet="aeration_mlss" height={80} />
            </div>
            <div className="trend-section">
              <div className="trend-label">INFLUENT FLOW</div>
              <TrendChart seriesSet="flow" height={80} />
            </div>
          </div>
        </div>
        <div className="panels-area">
          <ScenarioPanel />
          <EventsPanel />
          <ProcessDetailPanel />
          <EffluentPanel />
          <LabPanel />
          <FinancePanel />
          <EquipmentPanel />
          <AlarmPanel />
        </div>
      </div>

      {showSaveModal && <SaveLoadModal onClose={toggleSaveModal} />}
      {showEncyclopedia && <EncyclopediaModal onClose={() => setShowEncyclopedia(false)} />}
      {showComplete && scenario && (
        <ScenarioCompleteModal
          scenario={scenario}
          onClose={() => setShowComplete(false)}
        />
      )}
    </div>
  );
}
