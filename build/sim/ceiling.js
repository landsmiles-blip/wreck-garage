// Wreck Garage — progression-ceiling measurement (ledger Letter 002, job 3).
// Question: when in a run does the 5-tier ladder run out, and how long is then spent at max tier
// with nothing new to unlock? Entry 002 proposes opening districts on tier-up; this shows when
// those tier-ups actually happen.
//
// The run model is build/sim/final.js, copied and left otherwise unchanged so the two stay
// comparable. final.js is untouched. Two constant sets are run side by side because final.js
// does NOT match the game, despite the comment at src/world.js:486 saying it does:
//   wear      final.js 1.85 - 0.08*tier      game world.js:488  1.45 - 0.07*tier
//   car drop  final.js +11 at 25-55%        game world.js:592  +22 at 45% (repair pickup)
// Neither set is the game: the hit model is still abstract (a per-second hit probability, not
// geometry). Read the output as tier C. The real tier-up times come from ?session=1 on a phone.
//
// Run: node build/sim/ceiling.js

function createRng(seed = 20261114) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const TIERS = [
  { threshold: 0, dmgResist: 1.0, partMult: 1.0, smashSpeed: 1.0 },
  { threshold: 10, dmgResist: 0.84, partMult: 1.8, smashSpeed: 1.12 },
  { threshold: 34, dmgResist: 0.70, partMult: 3.2, smashSpeed: 1.25 },
  { threshold: 82, dmgResist: 0.55, partMult: 5.5, smashSpeed: 1.40 },
  { threshold: 165, dmgResist: 0.42, partMult: 9.0, smashSpeed: 1.60 },
];
const PROPS = [
  { kind: 'fence_crate_bin', weight: 0.50, minTier: 0, dmg: 1.1, parts: 2.0 },
  { kind: 'sign_lamp_bench', weight: 0.30, minTier: 1, dmg: 2.2, parts: 3.5 },
  { kind: 'parked_sedan_van', weight: 0.20, minTier: 2, dmg: 4.4, parts: 7.0 },
];

const CONSTANTS = {
  'final.js': { wearBase: 1.85, wearPerTier: 0.08, carRepair: 11, carDrop: (skill) => 0.25 + 0.30 * skill },
  'game':     { wearBase: 1.45, wearPerTier: 0.07, carRepair: 22, carDrop: () => 0.45 },
};

function simulateRun(rng, skill, K) {
  let integrity = 100, elapsed = 0, partsCount = 0, tierIdx = 0, nextRepairAt = 12;
  const tierTimes = [0];
  const dt = 0.5;
  while (integrity > 0 && elapsed < 900) {
    elapsed += dt;
    const tier = TIERS[tierIdx];
    const heat = elapsed > 160 ? 1 + (elapsed - 160) / 210 : 1;
    integrity -= (K.wearBase - K.wearPerTier * tierIdx) * heat * dt;
    if (rng() < (0.09 + 0.84 * skill) * tier.smashSpeed * dt) {
      const r = rng();
      const prop = r < PROPS[0].weight ? PROPS[0] : r < PROPS[0].weight + PROPS[1].weight ? PROPS[1] : PROPS[2];
      integrity -= prop.dmg * (tierIdx >= prop.minTier ? 0.30 : 1.0) * tier.dmgResist * (0.85 + rng() * 0.3);
      partsCount += Math.ceil(prop.parts);
      if (prop.kind === 'parked_sedan_van' && rng() < K.carDrop(skill)) integrity = Math.min(100, integrity + K.carRepair);
      while (tierIdx + 1 < TIERS.length && partsCount >= TIERS[tierIdx + 1].threshold) {
        tierIdx++;
        tierTimes[tierIdx] = elapsed;
        integrity = Math.min(100, integrity + 18);
      }
    }
    if (elapsed >= nextRepairAt) {
      nextRepairAt += 11 + rng() * 3;
      if (rng() < 0.08 + 0.85 * skill) integrity = Math.min(100, integrity + 22);
    }
  }
  return { elapsed, tierTimes };
}

const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
const f = (v) => (v == null ? '  n/a' : `${v.toFixed(0).padStart(4)}s`);

const N = 3500;
const SKILLS = [['Passive', 0.1], ['Casual', 0.55], ['Hunter', 0.9]];
console.log(`=== Progression ceiling (N=${N} runs per row, seed 20261114) ===`);
console.log('constants  skill    | run med | T2 med | T3 med | T4 med | T5 med | reach T5 | at T5 med | share of run at T5');
for (const [kName, K] of Object.entries(CONSTANTS)) {
  const rng = createRng(20261114);
  for (const [sName, skill] of SKILLS) {
    const runs = Array.from({ length: N }, () => simulateRun(rng, skill, K));
    const t = [1, 2, 3, 4].map((i) => med(runs.map((r) => r.tierTimes[i]).filter((x) => x !== undefined)));
    const t5 = runs.filter((r) => r.tierTimes[4] !== undefined);
    const atT5 = med(t5.map((r) => r.elapsed - r.tierTimes[4]));
    const share = med(t5.map((r) => (r.elapsed - r.tierTimes[4]) / r.elapsed));
    console.log(
      `${kName.padEnd(10)} ${sName.padEnd(8)} | ${f(med(runs.map((r) => r.elapsed)))}  | ${f(t[0])} | ${f(t[1])} | ${f(t[2])} | ${f(t[3])} | ` +
        `${((t5.length / N) * 100).toFixed(1).padStart(6)}%  | ${f(atT5)}    | ${share == null ? 'n/a' : (share * 100).toFixed(0) + '%'}`
    );
  }
}
