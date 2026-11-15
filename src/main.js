import * as THREE from 'three';
import { GameAudio } from './audio.js';
import { loadAllModels } from './assetsLoader.js';
import { bankParts, bridgeState, initBridge, saveBestScore, sendGameReady, triggerInterstitial } from './bridge.js';
import { ECONOMY } from './economy.js';
import { createMissions } from './missions.js';
import { InputController, readSteerMode } from './input.js';
import { createPerfProbe } from './probe.js';
import { createSessionLog } from './session.js';
import { MODEL_MANIFEST, TIERS, WreckWorld } from './world.js';

// Chase camera (ledger Letters 003-007, Finding 9). Take 3: high and looking down ~35 deg from the
// first second, because Mumathai found the low over-the-shoulder view unreadable at every tier,
// not only at T5. It still turns with the car and still pulls back and up as the truck grows: the
// v2 offsets were constant while the truck grows to 1.88 x 1.62 x 1.45, so at T5 the camera sat
// inside the bulldozer (74% of a portrait screen, 96% of a square one, measured).
// Not "full proportional" pull-back: if the camera backs off exactly as much as the truck grows,
// the truck covers the same share of the screen at every tier and the growth the player earned
// never shows. Frames are tuned from tools/measure-camera.mjs coverage plus screenshots.
// Overrides for tuning on the phone: ?cam1=dist,height and ?cam5=dist,height. ?cam=v2 restores
// the v2 prototype's low camera for comparison.
const CAM_PARAMS = new URLSearchParams(window.location.search);
const CAM_V2 = CAM_PARAMS.get('cam') === 'v2';
const CAM_FRAMES = {
  portrait: { t1: { dist: 8.0, height: 9.5, look: 3.0 }, t5: { dist: 12.0, height: 13.3, look: 4.0 } },
  landscape: { t1: { dist: 8.0, height: 8.0, look: 1.0 }, t5: { dist: 12.0, height: 11.5, look: 1.5 } },
};
if (CAM_V2) {
  CAM_FRAMES.portrait.t1 = CAM_FRAMES.portrait.t5 = { dist: 7.4, height: 3.8, look: 3.0 };
  CAM_FRAMES.landscape.t1 = CAM_FRAMES.landscape.t5 = { dist: 6.4, height: 3.0, look: 3.8 };
}
for (const [key, frame] of [['cam1', 't1'], ['cam5', 't5']]) {
  const [d, h] = (CAM_PARAMS.get(key) || '').split(',').map(Number);
  if (d > 0 && h > 0) {
    for (const o of ['portrait', 'landscape']) CAM_FRAMES[o][frame] = { ...CAM_FRAMES[o][frame], dist: d, height: h };
  }
}
// The camera eases toward the new framing over ~0.7 s instead of following the truck's scale,
// which snaps on tier-up (world.js syncPlayerTierVisuals). Easing it is what stops the lurch.
const CAM_GROW_RATE = 1.5;

// Shown small on the pause and end cards so a phone's build can be identified. Bump on every build
// handed to Mumathai.
const BUILD_TAG = 'take3 2026-11-15';

// Garage level from lifetime banked parts (src/economy.js; simulated in build/sim/take3.js).
function garageLevel(bank) {
  let lv = 0;
  while (lv < ECONOMY.garageMaxLevel && bank >= ECONOMY.garageLevelParts(lv + 1)) lv++;
  return lv;
}

const STRINGS = {
  en: {
    score: 'WRECK SCORE',
    integrity: 'INTEGRITY',
    cue: 'DRAG ANYWHERE OR WASD TO SMASH!',
    paused: 'PAUSED',
    pauseSub: 'Garage crew standing by.',
    resume: 'RESUME',
    runBadge: 'SUBURBAN RUN COMPLETE',
    runTitle: 'PARTS SECURED!',
    endScore: 'WRECK SCORE',
    endParts: 'PARTS COLLECTED',
    endTier: 'PEAK RIG',
    endBest: 'BEST SCORE',
    again: 'DRIVE AGAIN',
  },
};

function applyLocalization(lang) {
  const dict = STRINGS[lang] || STRINGS.en;
  document.getElementById('lbl-score').textContent = dict.score;
  document.getElementById('lbl-integrity').textContent = dict.integrity;
  document.getElementById('lbl-cue').textContent = dict.cue;
  document.getElementById('lbl-paused').textContent = dict.paused;
  document.getElementById('lbl-pause-sub').textContent = dict.pauseSub;
  document.getElementById('btn-resume').textContent = dict.resume;
  document.getElementById('lbl-run-badge').textContent = dict.runBadge;
  document.getElementById('lbl-run-title').textContent = dict.runTitle;
  document.getElementById('lbl-end-score').textContent = dict.endScore;
  document.getElementById('lbl-end-parts').textContent = dict.endParts;
  document.getElementById('lbl-end-tier').textContent = dict.endTier;
  document.getElementById('lbl-end-best').textContent = dict.endBest;
  document.getElementById('btn-again').textContent = dict.again;
}

async function boot() {
  const canvas = document.getElementById('game-canvas');
  const valScore = document.getElementById('val-score');
  const valTier = document.getElementById('val-tier');
  const tierPill = document.getElementById('tier-pill');
  const tierFill = document.getElementById('tier-fill');
  const integrityFill = document.getElementById('integrity-fill');
  const comboPill = document.getElementById('combo-pill');
  const valComboMult = document.getElementById('val-combo-mult');
  const valComboLbl = document.getElementById('val-combo-lbl');
  const comboFill = document.getElementById('combo-fill');
  const cueBanner = document.getElementById('cue-banner');
  const toastFeed = document.getElementById('toast-feed');
  const pauseOverlay = document.getElementById('pause-overlay');
  const endOverlay = document.getElementById('end-overlay');
  const btnMute = document.getElementById('btn-mute');
  const btnPause = document.getElementById('btn-pause');
  const btnResume = document.getElementById('btn-resume');
  const btnAgain = document.getElementById('btn-again');

  const audio = new GameAudio();
  const session = createSessionLog(window);
  // Session panels live inside the pause and end cards only, so the log never shows during play.
  const sessionPanels = [];
  if (session.enabled) {
    for (const id of ['pause-overlay', 'end-overlay']) {
      const panel = document.createElement('pre');
      panel.style.cssText =
        'margin:10px 0 0;padding:6px 8px;border-radius:8px;background:rgba(12,16,24,0.85);color:#9ef0b8;' +
        'font:600 10px/1.35 ui-monospace,monospace;text-align:left;white-space:pre-wrap;max-height:30vh;overflow:auto;';
      document.querySelector(`#${id} .card`).appendChild(panel);
      sessionPanels.push(panel);
    }
  }
  const renderSession = () => sessionPanels.forEach((el) => session.render(el));
  let manualPause = false;
  let contextLost = false;
  let world = null;

  const isGamePaused = () => manualPause || bridgeState.platformPaused || bridgeState.adOpen || contextLost || document.hidden;

  const syncPauseAndAudio = () => {
    const paused = isGamePaused();
    audio.setPlatformAllowed(bridgeState.platformAudio);
    audio.setPaused(paused);
    if (manualPause && (!world || !world.player.ended)) {
      renderSession();
      pauseOverlay.classList.remove('hidden');
    } else {
      pauseOverlay.classList.add('hidden');
    }
    btnMute.textContent = audio.userMuted || !bridgeState.platformAudio ? '🔇' : '🔊';
  };

  // Required step 1: Initialize Playgama Bridge BEFORE Three.js renderer or asset fetch
  await initBridge({
    onAudioChange: () => syncPauseAndAudio(),
    onPauseChange: () => syncPauseAndAudio(),
    onAdState: () => syncPauseAndAudio(),
  });
  applyLocalization(bridgeState.language);
  syncPauseAndAudio();

  // Three.js Renderer + Responsive Camera (zero black bars across 9:16, 16:9, 1:1)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    contextLost = true;
    syncPauseAndAudio();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    syncPauseAndAudio();
  });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 48, 95);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 135);
  const camOffset = new THREE.Vector3();

  const updateViewport = () => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const aspect = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.fov = aspect < 0.85 ? 54 : aspect < 1.2 ? 48 : 44;
    camera.updateProjectionMatrix();
  };
  updateViewport();
  window.addEventListener('resize', updateViewport);

  // Sunlit lighting rig (2 cheap lights, single directional shadow map)
  const hemi = new THREE.HemisphereLight(0xfff8e7, 0x546848, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff5de, 1.35);
  sun.position.set(22, 36, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 110;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  scene.add(sun);

  // Load all CC0 meshopt GLBs + MP3 audio concurrently
  const [models] = await Promise.all([loadAllModels(MODEL_MANIFEST), audio.preload()]);

  const pushToast = (text, tone = 'default') => {
    if (toastFeed.children.length >= 3) toastFeed.firstElementChild?.remove();
    const item = document.createElement('div');
    item.className = `toast-item ${tone}`;
    item.textContent = text;
    toastFeed.appendChild(item);
    setTimeout(() => item.remove(), 950);
  };

  let hudNeedsScoreSync = true;

  // Missions (src/missions.js). Completing one pays bonus parts through the world so tier-ups and
  // score stay in one place.
  const missions = createMissions();
  const missionList = document.getElementById('mission-list');
  const shownMissionIds = new Set();
  const renderMissions = () => {
    missionList.textContent = '';
    for (const m of missions.slots) {
      const row = document.createElement('div');
      row.className = `mission-item${shownMissionIds.has(m.id) ? '' : ' fresh'}`;
      shownMissionIds.add(m.id);
      const label = document.createElement('span');
      label.textContent = m.text;
      const prog = document.createElement('span');
      prog.className = 'mission-prog';
      prog.textContent = m.type === 'combo' ? '' : `${m.progress}/${m.target}`;
      row.append(label, prog);
      missionList.appendChild(row);
    }
  };
  let missionsDone = 0;
  const settleMissions = (done) => {
    for (const d of done) {
      missionsDone++;
      pushToast(`MISSION DONE +${d.reward} PARTS`, 'gold');
      audio.play('combo_fanfare', 0.8, 0.05, 1.1);
      session.event('mission_done', { text: d.text, reward: d.reward });
      world.addBonusParts(d.reward);
    }
    renderMissions();
  };
  const applyGarage = () => {
    world.garageWearMult = 1 - garageLevel(bridgeState.bank) * ECONOMY.garageWearCutPerLevel;
  };

  world = new WreckWorld(scene, models, {
    onSfx: (key, vol, pitch = 1.0) => audio.play(key, vol, 0.08, pitch),
    onToast: (txt, tone) => pushToast(txt, tone),
    onComboUpdate: (c) => {
      if (c.active) {
        comboPill.classList.remove('hidden');
        comboPill.classList.toggle('rampage', c.isRampage);
        valComboMult.textContent = `${c.multiplier}x`;
        valComboLbl.textContent = c.isRampage ? 'RAMPAGE!' : c.multiplier >= 5 ? 'SUPER CRUSH!' : c.multiplier >= 3 ? 'MEGA SMASH!' : 'DOUBLE WRECK!';
        comboFill.style.width = `${(c.ratio * 100).toFixed(1)}%`;
      } else {
        comboPill.classList.add('hidden');
      }
    },
    onComboFanfare: (mult) => {
      audio.play('combo_fanfare', 0.85, 0.05, mult >= 5 ? 1.25 : 1.0);
    },
    onSmash: (key, mult) => settleMissions(missions.onSmash(key, mult, world.player.elapsed)),
    onRepair: () => settleMissions(missions.onRepair()),
    onTierUp: () => {
      missions.setTier(world.player.tierIdx);
      session.event('tier_up', { tierIdx: world.player.tierIdx });
      tierPill.classList.add('flash');
      setTimeout(() => tierPill.classList.remove('flash'), 650);
    },
    onRunEnded: async (summary) => {
      input.clearPointer();
      comboPill.classList.add('hidden');
      session.event('run_end', { score: summary.score, parts: summary.parts, tier: summary.tierName });
      renderSession();
      const best = await saveBestScore(summary.score);
      document.getElementById('end-score').textContent = summary.score.toLocaleString();
      document.getElementById('end-parts').textContent = summary.parts.toLocaleString();
      document.getElementById('end-tier').textContent = summary.tierName;
      document.getElementById('end-best').textContent = best.toLocaleString();
      // Garage: bank this run's parts (Bridge storage) and show progress to the next level, the
      // reason to press Drive Again (kept between runs).
      const lvBefore = garageLevel(bridgeState.bank);
      const bank = await bankParts(summary.parts);
      const lv = garageLevel(bank);
      const from = ECONOMY.garageLevelParts(lv);
      const to = ECONOMY.garageLevelParts(lv + 1);
      document.getElementById('end-garage-lv').textContent = `LV ${lv}${lv > lvBefore ? '  LEVEL UP!' : ''}`;
      if (lv >= ECONOMY.garageMaxLevel) {
        document.getElementById('end-garage-fill').style.width = '100%';
        document.getElementById('end-garage-sub').textContent = 'Garage maxed: your rig wears slowest.';
      } else {
        document.getElementById('end-garage-fill').style.width = `${(((bank - from) / (to - from)) * 100).toFixed(1)}%`;
        document.getElementById('end-garage-sub').textContent =
          `${(to - bank).toLocaleString()} parts to LV ${lv + 1}: each level, your rig wears ${Math.round(ECONOMY.garageWearCutPerLevel * 100)}% slower.`;
      }
      session.event('garage', { bank, level: lv });
      endOverlay.classList.remove('hidden');
    },
  });

  applyGarage();
  renderMissions();
  for (const id of ['build-tag-pause', 'build-tag-end']) document.getElementById(id).textContent = BUILD_TAG;

  const steerMode = readSteerMode();
  world.steerMode = steerMode;
  let latchedYaw = Math.PI;
  let latchedGesture = -1;

  const input = new InputController(canvas, () => {
    audio.unlockAndStartMusic();
    cueBanner.classList.add('gone');
  });

  btnMute.addEventListener('click', () => {
    audio.unlockAndStartMusic();
    audio.toggleMute();
    audio.play('ui_click', 0.6);
    syncPauseAndAudio();
  });

  btnPause.addEventListener('click', () => {
    if (world.player.ended) return;
    audio.unlockAndStartMusic();
    audio.play('ui_click', 0.6);
    manualPause = !manualPause;
    session.event(manualPause ? 'pause' : 'resume');
    syncPauseAndAudio();
  });

  btnResume.addEventListener('click', () => {
    audio.play('ui_click', 0.6);
    manualPause = false;
    syncPauseAndAudio();
  });

  // Never binds Escape (Rule 1.5.2 & Google Design §2); P toggles pause on desktop
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' && !world.player.ended) {
      manualPause = !manualPause;
      syncPauseAndAudio();
    }
  });

  document.addEventListener('visibilitychange', () => syncPauseAndAudio());
  window.addEventListener('blur', () => syncPauseAndAudio());

  let smoothYaw = Math.PI;
  let camGrow = 0;
  const lerp = (a, b, t) => a + (b - a) * t;
  const camTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  btnAgain.addEventListener('click', async () => {
    audio.unlockAndStartMusic();
    audio.play('ui_click', 0.65);
    session.event('drive_again');
    btnAgain.disabled = true;
    await triggerInterstitial();
    endOverlay.classList.add('hidden');
    world.resetRun();
    missions.reset();
    renderMissions();
    applyGarage();
    smoothYaw = Math.PI;
    hudNeedsScoreSync = true;
    btnAgain.disabled = false;
  });

  // Auto fade opening cue after 4s even if idle
  setTimeout(() => cueBanner.classList.add('gone'), 4000);

  const probe = createPerfProbe();
  let lastT = performance.now();
  let renderedFrames = 0;

  // Test hook exposed safely only for read-only verification inspection
  window.__wreckDebug = {
    getState: () => ({
      x: world.player.x,
      z: world.player.z,
      score: world.player.score,
      parts: world.player.parts,
      integrity: world.player.integrity,
      tierIdx: world.player.tierIdx,
      yaw: world.player.yaw,
      yardOpen: world.yardOpen,
      housesStanding: world.props.filter((pr) => pr.def.key === 'house').length,
      bank: bridgeState.bank,
      garageLevel: garageLevel(bridgeState.bank),
      wearMult: world.garageWearMult,
      missions: missions.slots.map((m) => `${m.text} ${m.progress}/${m.target}`),
      missionsDone,
      camYaw: smoothYaw,
      steerMode,
      activeProps: world.props.length,
      ended: world.player.ended,
      calls: renderer.info.render.calls,
    }),
    forceEndSoonForTest: () => {
      world.player.integrity = 0.2;
    },
    // Test-only: put the truck at (x, z) facing yaw, for checking collisions with the houses.
    teleportForTest: (x, z, yaw) => {
      world.player.x = x;
      world.player.z = z;
      world.player.yaw = yaw;
    },
    // Test-only: jump the ladder to tier i (upward only), for camera coverage measurement.
    setTierForTest: (i) => {
      world.player.parts = Math.max(world.player.parts, TIERS[i].minParts);
      world.checkTierAdvance();
    },
    // Fraction of the viewport the player's vehicle covers, overall and in the top half (the road
    // ahead). Renders one frame with only the vehicle visible and counts its pixels.
    measureCoverage: () => {
      const hidden = [];
      scene.children.forEach((o) => {
        if (o !== world.playerRoot && !o.isLight && o.visible) { o.visible = false; hidden.push(o); }
      });
      const bg = scene.background;
      const fog = scene.fog;
      scene.background = new THREE.Color(0x000000);
      scene.fog = null;
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      hidden.forEach((o) => { o.visible = true; });
      scene.background = bg;
      scene.fog = fog;
      let all = 0;
      let top = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (px[i] + px[i + 1] + px[i + 2] > 24) { all++; if (y >= h / 2) top++; }
        }
      }
      return { tier: world.player.tierIdx + 1, camMode: CAM_V2 ? 'v2' : 'take3', w, h, cover: +(all / (w * h)).toFixed(3), coverTopHalf: +(top / (w * h / 2)).toFixed(3) };
    },
  };

  function tick(now) {
    requestAnimationFrame(tick);
    probe.beginFrame();

    const rawDt = (now - lastT) * 0.001;
    lastT = now;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));

    if (!isGamePaused()) {
      const vec = input.getVector();
      // 'camlatch' reads the stick against the camera yaw from when this touch/hold began.
      if (input.gestureId !== latchedGesture) {
        latchedGesture = input.gestureId;
        latchedYaw = smoothYaw;
      }
      world.update(dt, vec, steerMode === 'camlatch' ? latchedYaw : smoothYaw);
      session.frame(world.player, vec.magnitude > 0);
      hudNeedsScoreSync = true;
    }

    // Dr. Parking / Arcade dynamic chase camera
    const p = world.player;
    const portrait = camera.aspect < 0.9;

    // Follow vehicle yaw smoothly with shortest angle wrap
    let yawDiff = p.yaw - smoothYaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    smoothYaw += yawDiff * Math.min(1, dt * 5.2);

    // Over-the-shoulder arcade perspective
    const growTarget = (TIERS[p.tierIdx].scaleY - 1) / (TIERS[TIERS.length - 1].scaleY - 1);
    camGrow += (growTarget - camGrow) * Math.min(1, dt * CAM_GROW_RATE);
    const fr = portrait ? CAM_FRAMES.portrait : CAM_FRAMES.landscape;
    const camDist = lerp(fr.t1.dist, fr.t5.dist, camGrow);
    const camHeight = lerp(fr.t1.height, fr.t5.height, camGrow);
    const lookAhead = lerp(fr.t1.look, fr.t5.look, camGrow);

    const behindX = p.x - Math.sin(smoothYaw) * camDist;
    const behindZ = p.z - Math.cos(smoothYaw) * camDist;

    const shX = p.shake > 0 ? (Math.random() - 0.5) * p.shake * 0.55 : 0;
    const shY = p.shake > 0 ? (Math.random() - 0.5) * p.shake * 0.40 : 0;
    const shZ = p.shake > 0 ? (Math.random() - 0.5) * p.shake * 0.55 : 0;

    camTarget.set(behindX + shX, camHeight + shY, behindZ + shZ);
    camera.position.lerp(camTarget, Math.min(1, dt * 8.5));

    lookTarget.set(
      p.x + Math.sin(smoothYaw) * lookAhead,
      1.2,
      p.z + Math.cos(smoothYaw) * lookAhead
    );
    camera.lookAt(lookTarget);

    // Speed FOV kick for arcade velocity sensation
    const maxSpd = TIERS[p.tierIdx].speed;
    const speedRatio = Math.min(1, p.speed / (maxSpd || 1));
    const baseFov = portrait ? 54 : 46;
    const targetFov = baseFov + speedRatio * 8.0;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 6.0);
      camera.updateProjectionMatrix();
    }

    // Dynamic engine rev audio
    audio.updateEngine(speedRatio);

    if (hudNeedsScoreSync) {
      hudNeedsScoreSync = false;
      valScore.textContent = p.score.toLocaleString();
      const curTier = TIERS[p.tierIdx];
      const nextTier = TIERS[p.tierIdx + 1];
      valTier.textContent = `T${p.tierIdx + 1} ${curTier.name}`;
      if (nextTier) {
        const span = nextTier.minParts - curTier.minParts;
        const pct = Math.min(100, ((p.parts - curTier.minParts) / span) * 100);
        tierFill.style.width = `${pct.toFixed(1)}%`;
      } else {
        tierFill.style.width = '100%';
      }

      integrityFill.style.width = `${p.integrity.toFixed(1)}%`;
      integrityFill.classList.toggle('warn', p.integrity <= 50 && p.integrity > 25);
      integrityFill.classList.toggle('low', p.integrity <= 25);
    }

    renderer.render(scene, camera);
    probe.endFrame(renderer, world.props.length, world.debris.length);

    renderedFrames++;
    if (renderedFrames === 2) {
      sendGameReady();
    }
  }

  requestAnimationFrame(tick);
}

boot();
