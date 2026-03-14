import Dexie from 'dexie';

interface SavedGame {
  id?: number;
  name: string;
  timestamp: number;
  gameTimeMs: number;
  // Serialized snapshot of game state
  snapshot: string;
}

class FlowStateDB extends Dexie {
  saves!: Dexie.Table<SavedGame, number>;

  constructor() {
    super('FlowStateDB');
    this.version(1).stores({
      saves: '++id, name, timestamp',
    });
  }
}

const db = new FlowStateDB();

export async function saveGame(name: string, gameTimeMs: number, stateSnapshot: object): Promise<number> {
  const id = await db.saves.add({
    name,
    timestamp: Date.now(),
    gameTimeMs,
    snapshot: JSON.stringify(stateSnapshot),
  });
  return id as number;
}

export async function loadGame(id: number): Promise<{ name: string; gameTimeMs: number; snapshot: object } | null> {
  const save = await db.saves.get(id);
  if (!save) return null;
  return {
    name: save.name,
    gameTimeMs: save.gameTimeMs,
    snapshot: JSON.parse(save.snapshot),
  };
}

export async function listSaves(): Promise<Array<{ id: number; name: string; timestamp: number; gameTimeMs: number }>> {
  const saves = await db.saves.orderBy('timestamp').reverse().toArray();
  return saves.map((s) => ({
    id: s.id!,
    name: s.name,
    timestamp: s.timestamp,
    gameTimeMs: s.gameTimeMs,
  }));
}

export async function deleteSave(id: number): Promise<void> {
  await db.saves.delete(id);
}
