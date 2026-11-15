// Sample-only CC0 MP3 audio player via decodeAudioData + BufferSource (no oscillators)
const SOUND_PATHS = {
  bg_music: 'assets/audio/bg_music.mp3',
  impact_wood: 'assets/audio/impact_wood.mp3',
  impact_metal_light: 'assets/audio/impact_metal_light.mp3',
  impact_metal_heavy: 'assets/audio/impact_metal_heavy.mp3',
  impact_glass: 'assets/audio/impact_glass.mp3',
  repair_pickup: 'assets/audio/repair_pickup.mp3',
  tier_up: 'assets/audio/tier_up.mp3',
  ui_click: 'assets/audio/ui_click.mp3',
  combo_fanfare: 'assets/audio/combo_fanfare.mp3',
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();
    this.musicNode = null;
    this.engineNode = null;
    this.engineGain = null;
    this.userMuted = false;
    this.platformAllowed = true;
    this.paused = false;
    this.unlocked = false;
    this.loadingStarted = false;
    this.lastPlayed = new Map();
  }

  ensureContext() {
    if (this.ctx) return this.ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.isAudible() ? 1 : 0;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  async preload() {
    if (this.loadingStarted) return;
    this.loadingStarted = true;
    const entries = Object.entries(SOUND_PATHS);
    await Promise.all(
      entries.map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          this.buffers.set(key, { raw: arr, decoded: null });
        } catch (_) {}
      })
    );
  }

  async getDecoded(key) {
    const entry = this.buffers.get(key);
    if (!entry || !this.ctx) return null;
    if (entry.decoded) return entry.decoded;
    try {
      const copy = entry.raw.slice(0);
      entry.decoded = await this.ctx.decodeAudioData(copy);
      return entry.decoded;
    } catch (_) {
      return null;
    }
  }

  isAudible() {
    return this.platformAllowed && !this.userMuted && !this.paused;
  }

  syncGain() {
    if (!this.ctx || !this.master) return;
    const target = this.isAudible() ? 1 : 0;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
    if (this.paused || !this.platformAllowed || this.userMuted) {
      if (this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    } else if (this.unlocked && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setPlatformAllowed(v) {
    this.platformAllowed = Boolean(v);
    this.syncGain();
  }

  setPaused(v) {
    this.paused = Boolean(v);
    this.syncGain();
  }

  toggleMute() {
    this.userMuted = !this.userMuted;
    this.syncGain();
    return this.userMuted;
  }

  async unlockAndStartMusic() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.unlocked = true;
    if (ctx.state === 'suspended' && this.isAudible()) {
      await ctx.resume().catch(() => {});
    }
    this.syncGain();
    if (!this.musicNode) {
      const buf = await this.getDecoded('bg_music');
      if (buf && !this.musicNode) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const g = ctx.createGain();
        g.gain.value = 0.42;
        src.connect(g).connect(this.master);
        src.start(0);
        this.musicNode = src;
      }
    }
  }

  updateEngine(speedRatio) {
    if (!this.unlocked || !this.isAudible() || !this.ctx) return;
    if (this.engineGain) {
      const targetGain = 0.08 + speedRatio * 0.22;
      this.engineGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
      if (this.engineNode) {
        const rate = 0.75 + speedRatio * 0.85;
        this.engineNode.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.05);
      }
    }
  }

  play(key, volume = 0.75, jitter = 0.08, pitch = 1.0) {
    if (!this.unlocked || !this.isAudible() || !this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    const prev = this.lastPlayed.get(key) || 0;
    if (now - prev < 42) return;
    this.lastPlayed.set(key, now);

    this.getDecoded(key).then((buf) => {
      if (!buf || !this.isAudible() || !this.ctx || this.ctx.state !== 'running') return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = pitch * (1 + (Math.random() * 2 - 1) * jitter);
      const g = this.ctx.createGain();
      g.gain.value = volume;
      src.connect(g).connect(this.master);
      src.start(0);
    });
  }
}
