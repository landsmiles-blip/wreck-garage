import * as THREE from 'three';
import { GameAudio } from './audio.js';
import { loadAllModels } from './assetsLoader.js';
import { bridgeState, initBridge, saveBestScore, sendGameReady, triggerInterstitial } from './bridge.js';
import { InputController, readSteerMode } from './input.js';
import { createPerfProbe } from './probe.js';
import { createSessionLog } from './session.js';
import { MODEL_MANIFEST, TIERS, WreckWorld } from './world.js';

// Camera trial (ledger Letters 003-006, Finding 9). ?cam=scaled pulls the chase camera back and up
// as the truck grows, because at T5 the truck is 1.88 x 1.62 x 1.45 while v2's camera offset is a
// constant, so the reward (growth) hides the road ahead. Default stays the shipped v2 camera
// (Rule 11) until Mumathai picks.
// Not "full proportional" scaling: scaling every distance by the truck's growth keeps the truck
// the same size on screen at every tier, which erases the transformation the player earned.
// The T5 offsets are chosen from measured screen coverage (__wreckDebug.measureCoverage), and
// ?camT5=dist,height overrides them for tuning on the phone.
const CAM_MODE = new URLSearchParams(window.location.search).get('cam') === 'scaled' ? 'scaled' : 'v2';
const CAM_T5 = { portrait: { dist: 12.5, height: 7.6, look: 4.2 }, landscape: { dist: 10.8, height: 6.0, look: 5.0 } };
{
  const o = new URLSearchParams(window.location.search).get('camT5');
  const [d, h] = (o || '').split(',').map(Number);
  if (d > 0 && h > 0) {
    CAM_T5.portrait.dist = CAM_T5.landscape.dist = d;
    CAM_T5.portrait.height = CAM_T5.landscape.height = h;
  }
}
// The camera eases toward the new framing over ~0.7 s instead of following the truck's scale,
// which snaps on tier-up (world.js syncPlayerTierVisuals). Easing it is what stops the lurch.
const CAM_GROW_RATE = 1.5;

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
    onTierUp: () => {
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
      endOverlay.classList.remove('hidden');
    },
  });

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
      camYaw: smoothYaw,
      steerMode,
      activeProps: world.props.length,
      ended: world.player.ended,
      calls: renderer.info.render.calls,
    }),
    forceEndSoonForTest: () => {
      world.player.integrity = 0.2;
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
      return { tier: world.player.tierIdx + 1, camMode: CAM_MODE, w, h, cover: +(all / (w * h)).toFixed(3), coverTopHalf: +(top / (w * h / 2)).toFixed(3) };
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
    const g = CAM_MODE === 'scaled' ? camGrow : 0;
    const t5 = portrait ? CAM_T5.portrait : CAM_T5.landscape;
    const camDist = lerp(portrait ? 7.4 : 6.4, t5.dist, g);
    const camHeight = lerp(portrait ? 3.8 : 3.0, t5.height, g);
    const lookAhead = lerp(portrait ? 3.0 : 3.8, t5.look, g);

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
