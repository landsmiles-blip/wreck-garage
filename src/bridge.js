// Strict Playgama Bridge v2 wrapper (zero browser storage APIs, zero external URLs)
let readySent = false;

export const bridgeState = {
  bestScore: 0,
  language: 'en',
  platformAudio: true,
  platformPaused: false,
  adOpen: false,
  initialized: false,
  platformId: 'mock',
};

function getEventName(key, fallback) {
  const b = window.bridge;
  return b && b.EVENT_NAME && b.EVENT_NAME[key] ? b.EVENT_NAME[key] : fallback;
}

export async function initBridge({ onAudioChange, onPauseChange, onAdState }) {
  const b = window.bridge;
  if (!b || typeof b.initialize !== 'function') {
    bridgeState.initialized = true;
    return bridgeState;
  }

  await b.initialize();
  bridgeState.initialized = true;

  try {
    bridgeState.platformId = b.platform?.id || 'mock';
    bridgeState.language = b.platform?.language || 'en';
    if (typeof b.platform?.isAudioEnabled === 'boolean') {
      bridgeState.platformAudio = b.platform.isAudioEnabled;
    }
    if (typeof b.platform?.isPaused === 'boolean') {
      bridgeState.platformPaused = b.platform.isPaused;
    }
  } catch (_) {}

  try {
    b.platform?.on?.(getEventName('AUDIO_STATE_CHANGED', 'audio_state_changed'), (enabled) => {
      bridgeState.platformAudio = Boolean(enabled);
      onAudioChange?.(bridgeState.platformAudio);
    });
    b.platform?.on?.(getEventName('PAUSE_STATE_CHANGED', 'pause_state_changed'), (paused) => {
      bridgeState.platformPaused = Boolean(paused);
      onPauseChange?.(bridgeState.platformPaused);
    });
    b.advertisement?.on?.(getEventName('INTERSTITIAL_STATE_CHANGED', 'interstitial_state_changed'), (state) => {
      bridgeState.adOpen = state === 'opened' || state === 'loading';
      onAdState?.(state);
    });
  } catch (_) {}

  try {
    const saved = await b.storage?.get?.(['wreck_best']);
    if (Array.isArray(saved) && saved[0] != null && saved[0] !== '') {
      const parsed = Number.parseInt(saved[0], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        bridgeState.bestScore = parsed;
      }
    } else if (saved && typeof saved === 'object' && saved.wreck_best != null) {
      const parsed = Number.parseInt(saved.wreck_best, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        bridgeState.bestScore = parsed;
      }
    }
  } catch (_) {}

  return bridgeState;
}

export function sendGameReady() {
  if (readySent) return;
  readySent = true;
  try {
    window.bridge?.platform?.sendMessage?.('game_ready');
  } catch (_) {}
}

export async function saveBestScore(score) {
  if (score <= bridgeState.bestScore) return bridgeState.bestScore;
  bridgeState.bestScore = score;
  try {
    await window.bridge?.storage?.set?.(['wreck_best'], [String(score)]);
  } catch (_) {}
  return bridgeState.bestScore;
}

export async function triggerInterstitial() {
  const ad = window.bridge?.advertisement;
  if (!ad || typeof ad.showInterstitial !== 'function') return;
  try {
    await ad.showInterstitial();
  } catch (_) {}
}
