// Wreck Garage — Stage 1 Economy & Damage-Clock Simulation (02-standards.md Gate)
// Deterministic PRNG so results are 100% re-runnable across sessions.

function createRng(seed = 20261114) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const TIERS = [
  { name: 'Rust-Bucket', threshold: 0, dmgResist: 1.0, partMult: 1.0, smashSpeed: 1.0 },
  { name: 'Patched Up', threshold: 10, dmgResist: 0.84, partMult: 1.8, smashSpeed: 1.12 },
  { name: 'Sporty', threshold: 34, dmgResist: 0.70, partMult: 3.2, smashSpeed: 1.25 },
  { name: 'Muscle', threshold: 82, dmgResist: 0.55, partMult: 5.5, smashSpeed: 1.40 },
  { name: 'Bulldozer-Class', threshold: 165, dmgResist: 0.42, partMult: 9.0, smashSpeed: 1.60 },
];

// Prop weights in Suburban zone: [minComfortableTier, dmg, parts]
const PROPS = [
  { kind: 'fence_crate_bin', weight: 0.50, minTier: 0, dmg: 1.1, parts: 2.0 },
  { kind: 'sign_lamp_bench', weight: 0.30, minTier: 1, dmg: 2.2, parts: 3.5 },
  { kind: 'parked_sedan_van', weight: 0.20, minTier: 2, dmg: 4.4, parts: 7.0 },
];

function simulateRun(rng, skill /* 0=passive, 0.55=casual, 0.9=repair-hunter */) {
  let integrity = 100;
  let elapsed = 0;
  let partsCount = 0;
  let score = 0;
  let tierIdx = 0;
  let repairsGrabbed = 0;
  let nextRepairAt = 12;
  const tierTimes = [0];

  const dt = 0.5;
  const maxSeconds = 900;

  while (integrity > 0 && elapsed < maxSeconds) {
    elapsed += dt;
    const tier = TIERS[tierIdx];

    // Structural wear + gentle late-run heat escalation
    const heat = elapsed > 160 ? 1 + (elapsed - 160) / 210 : 1;
    integrity -= (1.85 - 0.08 * tierIdx) * heat * dt;

    // Passive aim hits very few targets; active steering hits dense lines
    const hitProb = (0.09 + 0.84 * skill) * tier.smashSpeed * dt;
    if (rng() < hitProb) {
      const r = rng();
      const prop = r < PROPS[0].weight ? PROPS[0] : r < PROPS[0].weight + PROPS[1].weight ? PROPS[1] : PROPS[2];
      const overmatchFactor = tierIdx >= prop.minTier ? 0.30 : 1.0;
      const dmgTaken = prop.dmg * overmatchFactor * tier.dmgResist * (0.85 + rng() * 0.3);
      integrity -= dmgTaken;

      const gained = Math.round(prop.parts * tier.partMult);
      partsCount += Math.ceil(prop.parts);
      score += gained;

      // Crushed sedans/vans drop field repair bolts on higher-skill sweeps
      if (prop.kind === 'parked_sedan_van' && rng() < 0.25 + 0.30 * skill) {
        integrity = Math.min(100, integrity + 11);
        repairsGrabbed++;
      }

      while (tierIdx + 1 < TIERS.length && partsCount >= TIERS[tierIdx + 1].threshold) {
        tierIdx++;
        tierTimes[tierIdx] = elapsed;
        integrity = Math.min(100, integrity + 18);
      }
    }

    // Periodic repair pickup spawns in cleared space
    if (elapsed >= nextRepairAt) {
      nextRepairAt += 11 + rng() * 3;
      if (rng() < 0.08 + 0.85 * skill) {
        integrity = Math.min(100, integrity + 22);
        repairsGrabbed++;
      }
    }
  }

  return { elapsed, partsCount, score, tierIdx, tierTimes, repairsGrabbed };
}

function summarize(name, runs) {
  const sorted = [...runs].sort((a, b) => a.elapsed - b.elapsed);
  const median = sorted[Math.floor(sorted.length * 0.5)].elapsed;
  const p25 = sorted[Math.floor(sorted.length * 0.25)].elapsed;
  const p75 = sorted[Math.floor(sorted.length * 0.75)].elapsed;
  const avgScore = runs.reduce((s, r) => s + r.score, 0) / runs.length;
  const avgTier = runs.reduce((s, r) => s + (r.tierIdx + 1), 0) / runs.length;
  const t2Times = runs.map((r) => r.tierTimes[1]).filter((t) => t !== undefined);
  const t3Times = runs.map((r) => r.tierTimes[2]).filter((t) => t !== undefined);
  const t5Rate = (runs.filter((r) => r.tierIdx === 4).length / runs.length) * 100;
  const medT2 = t2Times.length ? t2Times.sort((a, b) => a - b)[Math.floor(t2Times.length / 2)] : null;
  const medT3 = t3Times.length ? t3Times.sort((a, b) => a - b)[Math.floor(t3Times.length / 2)] : null;

  console.log(
    `${name.padEnd(22)} | med ${median.toFixed(1)}s (IQR ${p25.toFixed(0)}-${p75.toFixed(0)}s)` +
      ` | T2@${medT2 ? medT2.toFixed(1) + 's' : 'N/A'} | T3@${medT3 ? medT3.toFixed(1) + 's' : 'N/A'}` +
      ` | avgTier ${avgTier.toFixed(2)}/5 | T5 ${t5Rate.toFixed(1)}% | avgScore ${Math.round(avgScore)}`
  );
  return { median, medT2, t5Rate };
}

const rng = createRng(20261114);
const N = 3500;
const passive = Array.from({ length: N }, () => simulateRun(rng, 0.1));
const casual = Array.from({ length: N }, () => simulateRun(rng, 0.55));
const hunter = Array.from({ length: N }, () => simulateRun(rng, 0.9));

console.log('=== Wreck Garage Damage-Clock & Tier Simulation (N=10,500 runs) ===');
const sP = summarize('Passive / Blind', passive);
const sC = summarize('Casual Smasher', casual);
const sH = summarize('Active Repair-Hunter', hunter);

// Gate checks: T2 < 15s for casual, clear skill differentiation, active runs extend multi-minute
const pass = sC.medT2 !== null && sC.medT2 <= 15 && sC.median >= 90 && sH.median >= 240;
console.log(`\nGate Check: medT2=${sC.medT2?.toFixed(1)}s (target <=15.0s), casualMed=${sC.median.toFixed(1)}s (target >=90s), activeMed=${sH.median.toFixed(1)}s (target >=240s) -> ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
