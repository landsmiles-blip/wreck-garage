// Three rotating missions (Take 3, ledger Letter 003 device 2). Pure logic: no DOM, no audio, no
// storage, so unit-tests/missions.test.mjs runs it under plain node.
// Why: the tier ladder alone gives one goal at a time, and between tier-ups a run has nothing to
// aim at. Three small goals always on screen change what each stretch of a run is about, using the
// props that already exist. A finished mission pays bonus parts (ECONOMY.missionParts) and a new
// one takes its slot immediately, so there is never an empty slot.

import { ECONOMY } from './economy.js';

// Prop keys from world.js PROP_DEFS grouped into what a player can recognise on screen.
const KINDS = [
  { id: 'cones', label: 'cones', keys: ['cone'], minTier: 0, base: 5 },
  { id: 'fences', label: 'fences', keys: ['fence', 'fence2'], minTier: 0, base: 5 },
  { id: 'crates', label: 'crates', keys: ['box'], minTier: 0, base: 4 },
  { id: 'planters', label: 'planters', keys: ['planter'], minTier: 0, base: 3 },
  { id: 'signs', label: 'signs & lamps', keys: ['sign', 'lamp'], minTier: 1, base: 3 },
  { id: 'dumpsters', label: 'dumpsters', keys: ['dumpster'], minTier: 1, base: 2 },
  { id: 'cars', label: 'cars', keys: ['sedan', 'delivery'], minTier: 2, base: 2 },
  { id: 'houses', label: 'houses', keys: ['house'], minTier: 4, base: 2 },
];
const COMBO_STEPS = [2, 3, 5, 10];
const BURST_WINDOW = 10; // seconds

export function createMissions(rng = Math.random) {
  let tier = 0;
  let nextId = 1;
  const smashTimes = [];
  const slots = [];

  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  function make(excludeTypes) {
    const types = ['smash', 'combo', 'burst', 'repair'].filter((t) => !excludeTypes.includes(t) || t === 'smash');
    const type = pick(types);
    if (type === 'combo') {
      const target = COMBO_STEPS[Math.min(COMBO_STEPS.length - 1, 1 + Math.floor(tier / 2) + (rng() < 0.4 ? 1 : 0))];
      return { id: nextId++, type, target, progress: 0, text: `Hit a ${target}x combo` };
    }
    if (type === 'burst') {
      const target = 4 + tier * 2;
      return { id: nextId++, type, target, progress: 0, text: `Smash ${target} in ${BURST_WINDOW}s` };
    }
    if (type === 'repair') {
      const target = tier >= 3 ? 3 : 2;
      return { id: nextId++, type, target, progress: 0, text: `Grab ${target} repairs` };
    }
    const kinds = KINDS.filter((k) => k.minTier <= tier && !slots.some((s) => s.kind === k.id));
    const kind = pick(kinds.length ? kinds : KINDS.filter((k) => k.minTier <= tier));
    const target = kind.base + Math.floor(tier * kind.base * 0.5);
    return { id: nextId++, type, kind: kind.id, keys: kind.keys, target, progress: 0, text: `Smash ${target} ${kind.label}` };
  }

  function refill() {
    while (slots.length < 3) slots.push(make(slots.map((s) => s.type)));
  }

  // Returns the missions completed by this event, each with its reward, and refills the slots.
  function settle() {
    const done = [];
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i].progress >= slots[i].target) {
        done.push({ ...slots[i], reward: ECONOMY.missionParts(tier) });
        slots.splice(i, 1);
      }
    }
    if (done.length) refill();
    return done;
  }

  refill();

  return {
    get slots() {
      return slots;
    },
    setTier(t) {
      tier = t;
    },
    onSmash(key, comboMult, now) {
      smashTimes.push(now);
      while (smashTimes.length && now - smashTimes[0] > BURST_WINDOW) smashTimes.shift();
      for (const m of slots) {
        if (m.type === 'smash' && m.keys.includes(key)) m.progress++;
        else if (m.type === 'combo') m.progress = Math.max(m.progress, comboMult >= m.target ? m.target : 0);
        else if (m.type === 'burst') m.progress = Math.max(m.progress, Math.min(m.target, smashTimes.length));
      }
      return settle();
    },
    onRepair() {
      for (const m of slots) if (m.type === 'repair') m.progress++;
      return settle();
    },
    reset() {
      tier = 0;
      smashTimes.length = 0;
      slots.length = 0;
      refill();
    },
  };
}
