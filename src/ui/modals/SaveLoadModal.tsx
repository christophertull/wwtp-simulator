import { useState, useEffect } from 'react';
import { saveGame, listSaves, deleteSave } from '../../utils/persistence';
import { useGameStore } from '../../state/gameStore';

interface SaveEntry {
  id: number;
  name: string;
  timestamp: number;
  gameTimeMs: number;
}

interface Props {
  onClose: () => void;
}

export function SaveLoadModal({ onClose }: Props) {
  const [saves, setSaves] = useState<SaveEntry[]>([]);
  const [saveName, setSaveName] = useState('');
  const [mode, setMode] = useState<'save' | 'load'>('save');
  const gameTimeMs = useGameStore((s) => s.gameTimeMs);
  const processStates = useGameStore((s) => s.processStates);
  const controls = useGameStore((s) => s.controls);

  useEffect(() => {
    listSaves().then(setSaves);
  }, []);

  const handleSave = async () => {
    const name = saveName || `Save ${new Date().toLocaleString()}`;
    const snapshot = {
      gameTimeMs,
      processStates,
      controls,
    };
    await saveGame(name, gameTimeMs, snapshot);
    setSaveName('');
    const updated = await listSaves();
    setSaves(updated);
  };

  const handleDelete = async (id: number) => {
    await deleteSave(id);
    const updated = await listSaves();
    setSaves(updated);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-tabs">
            <button
              className={`modal-tab ${mode === 'save' ? 'active' : ''}`}
              onClick={() => setMode('save')}
            >
              Save
            </button>
            <button
              className={`modal-tab ${mode === 'load' ? 'active' : ''}`}
              onClick={() => setMode('load')}
            >
              Load
            </button>
          </div>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>

        <div className="modal-body">
          {mode === 'save' && (
            <div className="save-form">
              <input
                type="text"
                placeholder="Save name..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="save-input"
              />
              <button className="save-btn" onClick={handleSave}>Save Game</button>
            </div>
          )}

          <div className="saves-list">
            {saves.length === 0 && <div className="muted">No saved games.</div>}
            {saves.map((save) => (
              <div key={save.id} className="save-entry">
                <div className="save-info">
                  <span className="save-name">{save.name}</span>
                  <span className="save-date">
                    {new Date(save.timestamp).toLocaleString()}
                  </span>
                  <span className="save-gametime">
                    Game time: {new Date(save.gameTimeMs).toLocaleString()}
                  </span>
                </div>
                <div className="save-actions">
                  <button className="eq-btn" onClick={() => handleDelete(save.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
