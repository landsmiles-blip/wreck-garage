import * as THREE from 'three';
import { GameAudio } from './audio.js';
import { loadAllModels } from './assetsLoader.js';
import { bridgeState, initBridge, saveBestScore, sendGameReady, triggerInterstitial } from './bridge.js';
import { InputController, readSteerMode } from './input.js';
import { createPerfProbe } from './probe.js';
import { createSessionLog } from './session.js';
import { MODEL_MANIFEST, TIERS, WreckWorld } from './world.js';

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
    const camDist = portrait ? 7.4 : 6.4;
    const camHeight = portrait ? 3.8 : 3.0;
    const lookAhead = portrait ? 3.0 : 3.8;

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
