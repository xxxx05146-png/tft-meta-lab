import { readFile, writeFile, rename } from 'node:fs/promises';
import { collect } from './sources.mjs';

const cache = new URL('./data/cache.json', import.meta.url);
const initial = new URL('./data/initial.json', import.meta.url);
const temp = new URL(`./data/cache-${process.pid}.tmp`, import.meta.url);

export async function readSnapshot() {
  for (const path of [cache, initial]) {
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return { version: 1, attemptedAt: null, datasets: [], catalog: null, status: {} };
}

let inFlight;

export function sync() {
  if (!inFlight) {
    inFlight = (async () => {
      const snapshot = await collect(await readSnapshot(), { dragonVersion: process.env.TFT_DDRAGON_VERSION });
      await writeFile(temp, JSON.stringify(snapshot), 'utf8');
      await rename(temp, cache);
      return snapshot;
    })().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const snapshot = await sync();
  for (const [id, entry] of Object.entries(snapshot.status)) {
    console.log(id, entry.state, entry.reason || '');
  }
  for (const dataset of snapshot.datasets) {
    console.log(dataset.source, dataset.channel, `set ${dataset.set}`, dataset.patch || '', `${dataset.comps.length} bài`);
  }
  if (Object.values(snapshot.status).some(({ state }) => state !== 'ok')) process.exitCode = 1;
}
