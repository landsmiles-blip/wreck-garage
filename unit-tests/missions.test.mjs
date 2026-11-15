// Plain-node tests for src/missions.js. Run: node unit-tests/missions.test.mjs
import { createMissions } from '../src/missions.js';
import { ECONOMY } from '../src/economy.js';

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(40)} | ${detail}`);
  if (!ok) failures++;
};
const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// Always exactly three slots, and at most one of each non-smash type.
{
  let worst = 3, dupes = 0;
  for (let s = 1; s <= 200; s++) {
    const m = createMissions(seeded(s));
    for (let t = 0; t < 5; t++) {
      m.setTier(t);
      for (let i = 0; i < 40; i++) {
        m.onSmash(['cone', 'fence', 'box', 'sedan', 'dumpster', 'house'][i % 6], 1 + (i % 4), i * 0.5);
        if (i % 7 === 0) m.onRepair();
        worst = Math.min(worst, m.slots.length);
        const types = m.slots.filter((x) => x.type !== 'smash').map((x) => x.type);
        if (new Set(types).size !== types.length) dupes++;
      }
    }
  }
  check('always_three_slots', worst === 3, `min slots seen=${worst} (target 3)`);
  check('no_duplicate_special_types', dupes === 0, `duplicates=${dupes} (target 0)`);
}

// A smash mission completes on exactly its target count and pays the tier's reward.
{
  const m = createMissions(seeded(7));
  m.setTier(2);
  m.reset();
  m.setTier(2);
  let mission = m.slots.find((x) => x.type === 'smash');
  let guard = 0;
  while (!mission && guard++ < 50) { m.reset(); m.setTier(2); mission = m.slots.find((x) => x.type === 'smash'); }
  const key = mission.keys[0];
  let done = [];
  for (let i = 0; i < mission.target - 1; i++) done = done.concat(m.onSmash(key, 1, 100 + i * 20));
  const early = done.filter((d) => d.id === mission.id).length;
  done = m.onSmash(key, 1, 1000);
  const hit = done.find((d) => d.id === mission.id);
  check('smash_completes_on_target', early === 0 && !!hit, `early=${early} completedAtTarget=${!!hit} target=${mission.target}`);
  check('reward_matches_economy', hit && hit.reward === ECONOMY.missionParts(2), `reward=${hit?.reward} expected=${ECONOMY.missionParts(2)}`);
}

// Burst counts only smashes inside the 10 s window.
{
  const m = createMissions(seeded(11));
  let burst = m.slots.find((x) => x.type === 'burst');
  let guard = 0;
  while (!burst && guard++ < 200) { m.reset(); burst = m.slots.find((x) => x.type === 'burst'); }
  for (let i = 0; i < burst.target; i++) m.onSmash('zz', 1, i * 11); // 11 s apart: never two in window
  const still = m.slots.some((x) => x.id === burst.id);
  check('burst_respects_window', still, `burst still open after spaced smashes=${still}`);
}

process.exit(failures ? 1 : 0);
