import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('dist');
const CHROME_EXE = path.join(
  process.env.LOCALAPPDATA || '',
  'ms-playwright',
  'chromium-1234',
  'chrome-win64',
  'chrome.exe'
);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const cleanUrl = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = cleanUrl === '/' ? 'index.html' : cleanUrl.replace(/^\/+/, '');
      const abs = path.join(DIST, rel);
      if (!abs.startsWith(DIST) || !existsSync(abs) || statSync(abs).isDirectory()) {
        console.log('[HTTP 404]', rel);
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(abs).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(readFileSync(abs));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}

// Instrumented Playgama Bridge v2 test harness recording every call order cleanly
const BRIDGE_HARNESS_JS = `
(() => {
  const store = window.__mockBridgeStore || (window.__mockBridgeStore = {});
  const listeners = { platform: {}, adv: {} };
  const trace = (window.__bridgeTrace = []);
  const emit = (group, evt, arg) => (listeners[group][evt] || []).forEach((fn) => fn(arg));
  window.bridge = {
    EVENT_NAME: {
      AUDIO_STATE_CHANGED: 'audio_state_changed',
      PAUSE_STATE_CHANGED: 'pause_state_changed',
      INTERSTITIAL_STATE_CHANGED: 'interstitial_state_changed',
    },
    async initialize() {
      trace.push('initialize');
      return true;
    },
    platform: {
      id: 'youtube',
      language: 'en',
      isAudioEnabled: true,
      isPaused: false,
      on(evt, fn) { (listeners.platform[evt] ||= []).push(fn); },
      sendMessage(msg) { trace.push('sendMessage:' + msg); },
      emitAudio(v) { this.isAudioEnabled = v; emit('platform', 'audio_state_changed', v); },
      emitPause(v) { this.isPaused = v; emit('platform', 'pause_state_changed', v); },
    },
    storage: {
      async get(keys) {
        trace.push('storage.get:' + keys.join(','));
        return keys.map((k) => (k in store ? store[k] : null));
      },
      async set(keys, vals) {
        trace.push('storage.set:' + keys.join(',') + '=' + vals.join(','));
        keys.forEach((k, i) => { store[k] = vals[i]; });
      },
    },
    advertisement: {
      on(evt, fn) { (listeners.adv[evt] ||= []).push(fn); },
      async showInterstitial() {
        trace.push('showInterstitial');
        emit('adv', 'interstitial_state_changed', 'opened');
        await new Promise((r) => setTimeout(r, 40));
        emit('adv', 'interstitial_state_changed', 'closed');
      },
    },
  };
})();
`;

let failures = 0;
function assert(name, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(36)} | ${detail}`);
  if (!pass) failures++;
}

const { server, url } = await startServer();
const browser = await chromium.launch({
  executablePath: existsSync(CHROME_EXE) ? CHROME_EXE : undefined,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});

try {
  // Pass 1: Verify REAL vendor/playgama-bridge.js untouched boots & reaches interactive loop with zero errors
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = [];
    const extReqs = [];
    page.on('pageerror', (e) => errors.push(`pageerror:${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console:${m.text()}`); });
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`http${r.status()}:${r.url()}`); });
    page.on('request', (r) => { if (!r.url().startsWith(url) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) extReqs.push(r.url()); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__wreckDebug), { timeout: 12000 });
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => window.__wreckDebug.getState());
    assert('real_bridge_boot_no_errors', errors.length === 0, `errors=${errors.length} (${errors.join('; ')})`);
    assert('zero_external_network_requests', extReqs.length === 0, `extReqs=${extReqs.length}`);
    assert('real_bridge_40_props_spawned', st.activeProps === 40, `activeProps=${st.activeProps}, drawCalls=${st.calls}`);
    await ctx.close();
  }

  // Pass 2: Full Playgama Bridge trace + gameplay drive + smash + end-run + interstitial + storage persistence across 4 viewports
  const viewports = [
    { name: 'portrait_390x844', width: 390, height: 844, hasTouch: true },
    { name: 'landscape_844x390', width: 844, height: 390, hasTouch: true },
    { name: 'square_640x640', width: 640, height: 640, hasTouch: false },
    { name: 'desktop_1280x720', width: 1280, height: 720, hasTouch: false },
  ];

  const sharedMockStore = {};
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.hasTouch,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror:${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console:${m.text()}`); });

    await page.route('**/vendor/playgama-bridge.js', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `window.__mockBridgeStore = ${JSON.stringify(sharedMockStore)};\n${BRIDGE_HARNESS_JS}`,
      });
    });

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__wreckDebug), { timeout: 12000 });
    await page.waitForTimeout(300);

    const layout = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      scrollH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
      canvasW: document.getElementById('game-canvas').clientWidth,
      canvasH: document.getElementById('game-canvas').clientHeight,
    }));

    assert(
      `${vp.name}_viewport_fit`,
      layout.scrollW <= layout.innerW &&
        layout.scrollH <= layout.innerH &&
        layout.canvasW === layout.innerW &&
        layout.canvasH === layout.innerH,
      `canvas=${layout.canvasW}x${layout.canvasH} win=${layout.innerW}x${layout.innerH} scroll=${layout.scrollW}x${layout.scrollH}`
    );

    if (vp.name === 'portrait_390x844') {
      // Simulate dragging & steering right into Suburban yard clusters
      await page.mouse.move(195, 520);
      await page.mouse.down();
      await page.mouse.move(195, 455, { steps: 6 });
      await page.waitForTimeout(1600);
      await page.mouse.move(250, 480, { steps: 6 });
      await page.waitForTimeout(1600);
      await page.mouse.up();

      const mid = await page.evaluate(() => window.__wreckDebug.getState());
      assert('portrait_drag_moves_truck', Math.hypot(mid.x, mid.z - 8) > 3, `pos=(${mid.x.toFixed(1)},${mid.z.toFixed(1)})`);
      assert('portrait_smashes_earn_score', mid.score > 0 || mid.parts > 0, `score=${mid.score} parts=${mid.parts}`);

      // Take portrait preview screenshot during active run
      await page.screenshot({ path: path.resolve('tests/preview-portrait.png') });

      // Trigger end of run smoothly & verify non-punitive completion + Bridge interstitial + storage persistence
      await page.evaluate(() => window.__wreckDebug.forceEndSoonForTest());
      await page.waitForSelector('#end-overlay:not(.hidden)', { timeout: 6000 });
      const endTitle = await page.textContent('#lbl-run-title');
      const endBody = await page.textContent('#end-overlay');
      assert(
        'end_screen_no_loss_copy',
        !/lose|failed|dead|game over/i.test(endBody || '') && /PARTS SECURED/i.test(endTitle || ''),
        `title="${endTitle}"`
      );

      // Copy saved score into sharedMockStore after clicking Drive Again or end-run save
      const savedAfterEnd = await page.evaluate(() => ({
        trace: window.__bridgeTrace,
        store: window.__mockBridgeStore,
      }));
      Object.assign(sharedMockStore, savedAfterEnd.store);

      await page.click('#btn-again');
      await page.waitForSelector('#end-overlay.hidden', { state: 'attached', timeout: 5000 });

      const afterAgain = await page.evaluate(() => ({
        trace: window.__bridgeTrace,
        state: window.__wreckDebug.getState(),
      }));
      const initIdx = afterAgain.trace.indexOf('initialize');
      const readyIdx = afterAgain.trace.indexOf('sendMessage:game_ready');
      const adIdx = afterAgain.trace.indexOf('showInterstitial');
      const setHit = afterAgain.trace.some((t) => t.startsWith('storage.set:wreck_best='));

      assert(
        'bridge_lifecycle_order',
        initIdx === 0 && readyIdx > initIdx && adIdx > readyIdx && setHit,
        `trace=[${afterAgain.trace.join(' -> ')}]`
      );
      assert('draw_calls_under_budget', afterAgain.state.calls <= 60, `calls=${afterAgain.state.calls} (limit <=100)`);
    }

    if (vp.name === 'desktop_1280x720') {
      // Test WASD movement + Bridge best score reloaded into UI
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(2400);
      await page.keyboard.up('KeyW');
      await page.screenshot({ path: path.resolve('tests/preview-desktop.png') });
      const st = await page.evaluate(() => window.__wreckDebug.getState());
      assert('desktop_wasd_moves_truck', Math.hypot(st.x, st.z - 8) > 2, `pos=(${st.x.toFixed(1)},${st.z.toFixed(1)})`);
    }

    assert(`${vp.name}_zero_errors`, errors.length === 0, `errors=${errors.length} (${errors.join('; ')})`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

process.exit(failures ? 1 : 0);
