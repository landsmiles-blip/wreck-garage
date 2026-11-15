// Opt-in session logger (?session=1) for measuring how long an uninstructed player plays.
// Why it exists: nobody had ever measured a session, and every design argument on this game
// was reasoning until that number exists (Letter 001 item 2).
// Memory only. No storage (Playgama 3.2.1 forbids any save path but bridge.storage, and this is
// not progress anyway) and no network (1.2.5). The observer reads it off the screen: the panel
// appears on the end screen and on the pause screen, so it never shows during play and cannot
// coach the player. The same data goes to console.log as JSON for a tethered phone.

export function createSessionLog(host) {
  const enabled = new URLSearchParams(window.location.search).get('session') === '1';
  if (!enabled) {
    return { enabled: false, frame() {}, event() {}, render() {} };
  }

  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  const log = {
    steer: new URLSearchParams(window.location.search).get('steer') || 'camlatch',
    cam: new URLSearchParams(window.location.search).get('cam') || 'take3',
    firstInputAt: null,
    lastInputAt: null,
    longestIdle: 0,
    runs: [],
    events: [],
  };
  let run = null;
  let prevParts = 0;
  let idleStart = null;

  const startRun = () => {
    // integrity: one sample every 10 s, to settle Finding 11 (does the damage clock stop?).
    run = { startedAt: now(), endedAt: null, tierUps: [], smashes: 0, score: 0, parts: 0, peakTier: 0, integrity: [], minIntegrity: 100 };
    log.runs.push(run);
    prevParts = 0;
  };
  startRun();

  const fmt = (s) => (s == null ? '-' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

  const api = {
    enabled: true,
    // Called every unpaused frame. Smashes are detected from the parts counter rising, so
    // world.js needs no hook of its own for this.
    frame(state, inputActive) {
      const t = now();
      if (inputActive) {
        if (log.firstInputAt == null) log.firstInputAt = t;
        if (idleStart != null) log.longestIdle = Math.max(log.longestIdle, t - idleStart);
        idleStart = null;
        log.lastInputAt = t;
      } else if (log.firstInputAt != null && idleStart == null) {
        idleStart = t;
      }
      if (run && !run.endedAt) {
        run.minIntegrity = Math.min(run.minIntegrity, state.integrity);
        const runT = t - run.startedAt;
        if (runT >= run.integrity.length * 10) run.integrity.push(Math.round(state.integrity));
      }
      if (run && !run.endedAt && state.parts > prevParts) {
        run.smashes++;
        prevParts = state.parts;
      }
    },
    event(type, data = {}) {
      const t = now();
      log.events.push({ t: +t.toFixed(2), type, ...data });
      if (type === 'tier_up' && run) {
        run.tierUps.push({ tier: data.tierIdx + 1, at: +(t - run.startedAt).toFixed(1) });
        run.peakTier = data.tierIdx;
      } else if (type === 'run_end' && run) {
        run.endedAt = t;
        run.score = data.score;
        run.parts = data.parts;
        console.log('[wreck-session]', JSON.stringify(log));
      } else if (type === 'drive_again') {
        startRun();
      }
    },
    render(el) {
      if (!el) return;
      const t = now();
      const lines = [
        `SESSION LOG  steer=${log.steer} cam=${log.cam}`,
        `on page ${fmt(t)}  first input ${fmt(log.firstInputAt)}  last input ${fmt(log.lastInputAt)}`,
        `longest idle ${log.longestIdle.toFixed(0)}s  runs ${log.runs.length}  missions done ${log.events.filter((e) => e.type === 'mission_done').length}  garage LV ${log.events.filter((e) => e.type === 'garage').pop()?.level ?? '-'}`,
      ];
      log.runs.forEach((r, i) => {
        const dur = (r.endedAt ?? t) - r.startedAt;
        const tiers = r.tierUps.map((u) => `T${u.tier}@${u.at}s`).join(' ') || 'no tier-up';
        lines.push(`#${i + 1} ${fmt(dur)}${r.endedAt ? '' : ' (live)'} smashes ${r.smashes} score ${r.score} | ${tiers}`);
        lines.push(`   integrity /10s: ${r.integrity.join(' ')} (min ${Math.round(r.minIntegrity)})`);
      });
      el.textContent = lines.join('\n');
    },
  };
  host.__wreckSession = log;
  return api;
}
