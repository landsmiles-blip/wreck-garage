// Take 3 economy: the single source of every number that the run length depends on.
// src/world.js, src/missions.js and build/sim/take3.js all import this, so the simulator can never
// again measure a different game from the one that ships (Letter 002 found final.js had drifted:
// wear 1.85 vs 1.45, repair +11 vs +22). Change a value here, then re-run
// `node build/sim/take3.js`; it exits non-zero if a session target is missed.
// Tuned against the simulation, not by feel. The feel check is Mumathai on the phone.
export const ECONOMY = {
  // Ladder. minParts per tier; dmgResist as before. smashSpeed is the simulator's proxy for a
  // bigger, faster truck hitting more often; the game gets that from speed and smash radius.
  tiers: [
    { minParts: 0, dmgResist: 1.0, smashSpeed: 1.0 },
    { minParts: 40, dmgResist: 0.84, smashSpeed: 1.12 },
    { minParts: 170, dmgResist: 0.70, smashSpeed: 1.25 },
    { minParts: 470, dmgResist: 0.55, smashSpeed: 1.40 },
    { minParts: 1050, dmgResist: 0.42, smashSpeed: 1.60 },
  ],

  // Damage clock. Wear per second falls a little with tier; heat multiplies it late in a run.
  wearBase: 1.3, // was 1.45
  wearPerTier: 0.07,
  heatStart: 420, // was 160: with the longer ladder, heat must not end runs before T5 (~350 s)
  heatSpan: 210,
  tierUpHeal: 18,

  // Repairs. Shipped v2 healed +22 every 11-14 s plus a 45% car drop and +18 on each of four
  // tier-ups inside 66 s, which kept the bar near full for four minutes (Letter 006). Take 3
  // spaces both kinds of repair out and the longer ladder spaces out the tier-up heals, so the
  // bar moves from the start (sim: casual median ~70 at 120 s instead of ~91).
  repairHeal: 22,
  repairFirstAt: 14,
  repairEveryMin: 14,
  repairEveryMax: 18,
  carRepairChance: 0.35,

  // Houses: the 12 perimeter houses become smashable when the top tier opens the yard.
  houseCount: 12,
  houseHp: 6,
  houseParts: 30,
  houseDmg: 6,
  houseHitShare: 0.15, // simulator only: share of top-tier hits that land on a house
  arenaHalfOpen: 40, // yard half-size once the walls drop (houses stand at |34|-|35|)

  // Missions: bonus parts on completion, growing with tier so they matter all the way up.
  missionParts: (tierIdx) => 12 + 10 * tierIdx,

  // Garage, kept between runs: each level trims wear a little, capped, so it helps without
  // making a skilled player immortal. Level n needs garageLevelParts(n) lifetime parts.
  garageWearCutPerLevel: 0.03,
  garageMaxLevel: 8,
  garageLevelParts: (level) => 400 * level * (level + 1) / 2,
};
