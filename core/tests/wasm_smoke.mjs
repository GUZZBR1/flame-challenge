// Smoke test for the Emscripten/embind build — exercises the collection
// APIs (MaterialRisk.all → vector<Material>, Chamber.drainEvents →
// vector<string>) that throw UnboundTypeError when their return types
// lack embind registrations.
//
// Build the wasm module first:
//   emcmake cmake -S core -B core/build-wasm -DEMSCRIPTEN=ON
//   emmake  cmake --build core/build-wasm --target ffengine_wasm
// Then run (Node ≥ 18 — the repo root is "type": "module"):
//   node core/tests/wasm_smoke.mjs [path/to/freefall_engine.js]

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath = resolve(process.argv[2] ?? 'core/build-wasm/freefall_engine.js');
const { default: createEngine } = await import(pathToFileURL(modulePath).href);
const ff = await createEngine();

let failures = 0;
const check = (cond, msg) => {
  if (!cond) { console.error(`FAIL: ${msg}`); ++failures; }
};

// --- MaterialRisk.all() → vector<Material> ---
const risks = new ff.MaterialRisk();
const mats = risks.all();
check(mats.size() > 0, 'MaterialRisk.all() must return the material table');
let heptane = null;
for (let i = 0; i < mats.size(); ++i) {
  const m = mats.get(i);
  check(typeof m.id === 'string' && m.locPct > 0,
        `material[${i}] must expose id/locPct fields`);
  if (m.id === 'heptane') heptane = m;
}
check(heptane !== null && heptane.coolFlameCapable === true,
      'heptane must be present and cool-flame capable');

// --- Chamber.drainEvents() → vector<string> ---
const ch = new ff.Chamber(risks);
check(ch.drainEvents().size() === 0,
      'drainEvents on a fresh chamber returns an empty vector');

ch.configure({
  investigationId: 'flex',
  materialId: 'heptane',
  model: 'droplet',
  o2Pct: 10.5,
  flowCms: 0,
  pressureKpa: 101,
  slabLengthCm: 30,
  dropletD0Mm: 0.3,
  partialGravity: false,
  seed: 3,
});

let sawCool = false;
for (let i = 0; i < 2000 && !ch.finished(); ++i) {
  ch.step(0.01);
  if (ch.coolFlame()) sawCool = true;
}
check(sawCool, 'chamber must surface the cool-flame regime');
check(ch.finished(), 'cool flame must end at fuel exhaustion');

const events = ch.drainEvents();
const names = [];
for (let i = 0; i < events.size(); ++i) names.push(events.get(i));
check(names.includes('cool-flame-onset'), 'events must include cool-flame-onset');
check(names.includes('extinguished'), 'events must include extinguished');

// stateJson must stay valid JSON for transport consumers
const state = JSON.parse(ch.stateJson());
check(state.model === 'droplet' && state.finished === true,
      'stateJson must report a finished droplet run');

mats.delete();
events.delete();
ch.delete();

if (failures === 0) console.log('wasm smoke test passed');
process.exit(failures ? 1 : 0);
