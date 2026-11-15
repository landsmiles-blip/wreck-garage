// Wreck Garage — Take 3 economy simulation (ledger Letter 007). Re-run: node build/sim/take3.js
// Exit code 0 only if every gate passes; every gate prints its measured value beside its target.
//
// Why this exists: the shipped ladder was spent in 66 s for a casual player and repairs held the
// integrity bar near full for the first ~4 minutes (Letter 006), so after a minute nothing new
// arrived and nothing threatened. Take 3 changes four things together, because they share one hit
// rate and cannot be tuned apart: a longer ladder ending in breakable houses, damage that bites,
// three rotating missions, and a garage level kept between runs.
//
// Model: the per-second hit probability of build/sim/final.js (abstract, not geometry), so every
// number here is tier C until ?session=1 on a phone gives real tier-up and run times.
// The constants block below MUST match src/world.js and src/missions.js; the game imports the
// same values from src/economy.js, which this file also imports, so they cannot drift.

import { ECONOMY } from '../../src/economy.js';

const E = ECONOMY;

function createRng(seed = 20261115) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Prop mix as in final.js (fences/crates/cones, signs/lamps/bins, parked cars).
const PROPS = [
  { kind: 'light', weight: 0.50, minTier: 0, dmg: 1.1, parts: 2.0 },
  { kind: 'mid', weight: 0.30, minTier: 1, dmg: 2.2, parts: 3.5 },
  { kind: 'car', weight: 0.20, minTier: 2, dmg: 4.4, parts: 7.0 },
];

// skill: 0.1 passive, 0.55 casual, 0.9 hunter. Missions complete as a Poisson process whose rate
// rises with skill (an active player is doing what missions ask anyway).
const missionRate = (skill) => 1 / (150 - 120 * skill); // per second: passive ~1/138 s, casual ~1/84 s

function simulateRun(rng, skill, garageLevel) {
  let integrity = 100, t = 0, parts = 0, tier = 0, nextRepairAt = E.repairFirstAt, housesLeft = E.houseCount, houseHp = 0;
  const tierTimes = [0];
  let integrityAt120 = null, missions = 0, housesSmashed = 0;
  const wearMult = 1 - Math.min(E.garageMaxLevel, garageLevel) * E.garageWearCutPerLevel;
  const dt = 0.5;
  while (integrity > 0 && t < 1500) {
    t += dt;
    const T = E.tiers[tier];
    const heat = t > E.heatStart ? 1 + (t - E.heatStart) / E.heatSpan : 1;
    integrity -= (E.wearBase - E.wearPerTier * tier) * heat * wearMult * dt;

    if (rng() < (0.09 + 0.84 * skill) * T.smashSpeed * dt) {
      // After the yard opens at the top tier, a share of hits land on the houses.
      if (tier === E.tiers.length - 1 && housesLeft > 0 && rng() < E.houseHitShare) {
        houseHp += 2; // overmatched hitPower
        integrity -= E.houseDmg * 0.30 * T.dmgResist;
        if (houseHp >= E.houseHp) {
          houseHp = 0; housesLeft--; housesSmashed++;
          parts += E.houseParts;
        }
      } else {
        const r = rng();
        const prop = r < PROPS[0].weight ? PROPS[0] : r < PROPS[0].weight + PROPS[1].weight ? PROPS[1] : PROPS[2];
        integrity -= prop.dmg * (tier >= prop.minTier ? 0.30 : 1.0) * T.dmgResist * (0.85 + rng() * 0.3);
        parts += Math.ceil(prop.parts);
        // A crushed car drops a repair pickup; the player still has to drive over it.
        if (prop.kind === 'car' && rng() < E.carRepairChance && rng() < 0.3 + 0.6 * skill) {
          integrity = Math.min(100, integrity + E.repairHeal);
        }
      }
    }
    if (rng() < missionRate(skill) * dt) {
      missions++;
      parts += E.missionParts(tier);
    }
    while (tier + 1 < E.tiers.length && parts >= E.tiers[tier + 1].minParts) {
      tier++;
      tierTimes[tier] = t;
      integrity = Math.min(100, integrity + E.tierUpHeal);
    }
    if (t >= nextRepairAt) {
      nextRepairAt += E.repairEveryMin + rng() * (E.repairEveryMax - E.repairEveryMin);
      if (rng() < 0.08 + 0.85 * skill) integrity = Math.min(100, integrity + E.repairHeal);
    }
    if (integrityAt120 === null && t >= 120) integrityAt120 = integrity;
  }
  return { t, parts, tier, tierTimes, integrityAt120, missions, housesSmashed };
}

const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
const N = 3500;
const runSet = (skill, lvl, seed) => {
  const rng = createRng(seed);
  return Array.from({ length: N }, () => simulateRun(rng, skill, lvl));
};

const casual = runSet(0.55, 0, 1);
const passive = runSet(0.1, 0, 2);
const hunter = runSet(0.9, 0, 3);
const casualG5 = runSet(0.55, 5, 4);

const tierMed = (runs, i) => med(runs.map((r) => r.tierTimes[i]).filter((x) => x !== undefined));
const reach = (runs, i) => runs.filter((r) => r.tierTimes[i] !== undefined).length / runs.length;

console.log(`=== Take 3 economy (N=${N} runs per row; model tier C) ===`);
for (const [name, runs] of [['Passive', passive], ['Casual', casual], ['Hunter', hunter], ['Casual G5', casualG5]]) {
  const t = [1, 2, 3, 4].map((i) => tierMed(runs, i));
  console.log(
    `${name.padEnd(10)} run ${med(runs.map((r) => r.t)).toFixed(0).padStart(4)}s | T2 ${t[0].toFixed(0)}s T3 ${t[1].toFixed(0)}s ` +
      `T4 ${t[2].toFixed(0)}s T5 ${t[3].toFixed(0)}s | reach T5 ${(reach(runs, 4) * 100).toFixed(0)}% | ` +
      `missions ${med(runs.map((r) => r.missions))} | houses ${med(runs.map((r) => r.housesSmashed))}/${E.houseCount} | ` +
      `integrity@120s ${med(runs.map((r) => r.integrityAt120 ?? 0)).toFixed(0)}`
  );
}

let failures = 0;
const gate = (name, value, lo, hi, unit = 's') => {
  const ok = value >= lo && value <= hi;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(34)} | ${value.toFixed(2)}${unit} (target ${lo}-${hi}${unit})`);
};
console.log('');
gate('casual_T2', tierMed(casual, 1), 15, 25);
gate('casual_T3', tierMed(casual, 2), 60, 90);
gate('casual_T4', tierMed(casual, 3), 150, 210);
gate('casual_T5_houses_open', tierMed(casual, 4), 300, 420);
gate('casual_run_median', med(casual.map((r) => r.t)), 480, 600);
gate('passive_run_median', med(passive.map((r) => r.t)), 0, 150);
gate('casual_integrity_at_120s', med(casual.map((r) => r.integrityAt120 ?? 0)), 0, 75, '');
gate('garage5_vs_0_run_ratio', med(casualG5.map((r) => r.t)) / med(casual.map((r) => r.t)), 1.02, 1.4, 'x');
process.exit(failures ? 1 : 0);
