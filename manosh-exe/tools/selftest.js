'use strict';
/* Headless simulation of manosh's life. Run: npm test */
const path = require('path');
const fs = require('fs');
const { createBrain } = require('../src/renderer/brain.js');
const meta = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/sprites/manosh.json'), 'utf8'));

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error('  FAIL:', m); } };

function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function simulate({ seed, hours, wander, hour, fuzz }) {
  const rand = mulberry(seed);
  const b = { left: 100, right: 1800, floor: 1000 };
  const fxs = {}, says = [];
  const env = {
    rand, unit: () => 3, bounds: () => b, hour: () => hour, settings: () => ({ wander, chatty: true }),
    say: (t) => says.push(t), fx: (k) => { fxs[k] = (fxs[k] || 0) + 1; },
  };
  const brain = createBrain(env);
  brain.start(900, 1000);
  const time = {}, visited = new Set(); let lastState = null, stateStart = 0, maxStay = 0, maxStayState = '';
  const acts = []; const dt = 1 / 30; const steps = Math.floor(hours * 3600 / dt);
  let nextFuzz = 5 + rand() * 60;
  for (let i = 0; i < steps; i++) {
    brain.update(dt);
    const s = brain.state;
    time[s] = (time[s] || 0) + dt; visited.add(s);
    if (s !== lastState) { if (lastState && !['carried'].includes(lastState)) { const d = brain.time - stateStart; if (d > maxStay) { maxStay = d; maxStayState = lastState; } } lastState = s; stateStart = brain.time; acts.push(s); }
    ok(Number.isFinite(brain.x) && Number.isFinite(brain.y), `NaN position in ${s}`);
    ok(brain.x >= b.left - 1 && brain.x <= b.right + 1, `x out of bounds (${brain.x}) in ${s}`);
    ok(brain.y <= b.floor + 1, `y below floor (${brain.y}) in ${s}`);
    ok(meta.frames[brain.frame] !== undefined, `unknown frame "${brain.frame}" in ${s}`);
    if (fuzz && brain.time > nextFuzz) {
      nextFuzz = brain.time + 5 + rand() * 90;
      const r = rand();
      if (r < 0.35) brain.poke();
      else if (r < 0.6) brain.command(['dance', 'jump', 'run', 'sit', 'sleep', 'look', 'coffee', 'stretch', 'wave', 'walk', 'wake', 'talk', 'code'][Math.floor(rand() * 13)]);
      else { brain.grab(300 + rand() * 1200, 200 + rand() * 600); for (let k = 0; k < 30; k++) { brain.dragTo(brain.x + 5, brain.y + 2); brain.update(dt); } brain.release(); }
    }
  }
  return { time, visited, maxStay, maxStayState, fxs, says, acts, brain };
}

console.log('manosh.exe self-test');
// 1. Sprite metadata sanity
console.log('- sprite sheet: ' + Object.keys(meta.frames).length + ' frames');
for (const n of ['sit_code_a', 'sit_code_b', 'sit_code_blink', 'sit_code_think', 'idle_a', 'walk_0', 'run_0', 'jump_up', 'sit_a', 'sleep_a', 'wake_0', 'dance_0', 'look_l', 'react_wave_a']) ok(meta.frames[n] !== undefined, 'missing frame ' + n);

// 2. Natural daytime life, wandering, with user interference
for (const seed of [1, 2, 3]) {
  const r = simulate({ seed, hours: 3, wander: true, hour: 14, fuzz: true });
  const total = Object.values(r.time).reduce((a, b) => a + b, 0);
  const pct = Object.entries(r.time).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / total).toFixed(0)}%`).join(', ');
  console.log(`- seed ${seed}: ${pct}`);
  console.log(`  longest stay ${r.maxStay.toFixed(0)}s (${r.maxStayState}); ${r.acts.length} transitions; fx ${JSON.stringify(r.fxs)}`);
  for (const s of ['idle', 'walk', 'run', 'jump', 'sit', 'sleep', 'wake', 'dance', 'look', 'react', 'coffee', 'stretch', 'code', 'fall', 'land']) ok(r.visited.has(s), `state never visited: ${s} (seed ${seed})`);
  ok(r.maxStay < 260, `stuck in ${r.maxStayState} for ${r.maxStay}s`);
  ok(r.says.length > 5, 'never speaks');
}

// 3. No-wander mode must never walk or run
const nw = simulate({ seed: 9, hours: 1, wander: false, hour: 14, fuzz: false });
ok(!nw.visited.has('walk') && !nw.visited.has('run'), 'walked despite wander=off');
console.log('- wander off: states ' + [...nw.visited].join(','));

// 4. Night: should sleep much more than day
const day = simulate({ seed: 5, hours: 2, wander: true, hour: 14, fuzz: false });
const night = simulate({ seed: 5, hours: 2, wander: true, hour: 2, fuzz: false });
const sleepShare = (r) => ((r.time.sleep || 0) + (r.time.wake || 0)) / Object.values(r.time).reduce((a, b) => a + b, 0);
console.log(`- sleep share day ${(100 * sleepShare(day)).toFixed(0)}% vs night ${(100 * sleepShare(night)).toFixed(0)}%`);
ok(sleepShare(night) > sleepShare(day), 'does not sleep more at night');

// 5. Repetition: same activity back-to-back should be rare
const r = simulate({ seed: 11, hours: 4, wander: true, hour: 15, fuzz: false });
const core = r.acts.filter((a) => !['idle', 'land', 'wake'].includes(a));
let rep = 0; for (let i = 1; i < core.length; i++) if (core[i] === core[i - 1]) rep++;
console.log(`- back-to-back repeats: ${rep}/${core.length} activities`);
ok(rep / core.length < 0.25, 'too repetitive');

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
