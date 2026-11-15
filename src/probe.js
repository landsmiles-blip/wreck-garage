// Opt-in hardware performance probe (?perf=1) so physical Android testing prints real FPS & draw calls
export function createPerfProbe() {
  const enabled = window.location.search.includes('perf');
  if (!enabled) {
    return {
      enabled: false,
      beginFrame() {},
      endFrame() {},
    };
  }

  const el = document.createElement('div');
  el.id = 'perf-probe';
  el.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:99;padding:6px 9px;border-radius:8px;' +
    'background:rgba(12,16,24,0.82);color:#9ef0b8;font:600 11px/1.35 ui-monospace,monospace;' +
    'pointer-events:none;border:1px solid rgba(158,240,184,0.28);white-space:pre;';
  el.textContent = 'PERF warming up (8s)...';
  document.body.appendChild(el);

  const bootAt = performance.now();
  let frameStart = 0;
  let frames = 0;
  let jsSum = 0;
  let winStart = performance.now();
  let warmupDone = false;

  return {
    enabled: true,
    beginFrame() {
      frameStart = performance.now();
    },
    endFrame(renderer, activeProps, activeDebris) {
      const now = performance.now();
      const jsMs = now - frameStart;
      if (!warmupDone && now - bootAt < 8000) {
        const rem = Math.ceil((8000 - (now - bootAt)) / 1000);
        el.textContent = `PERF warm-up: ${rem}s | calls:${renderer.info.render.calls} tris:${renderer.info.render.triangles}`;
        winStart = now;
        frames = 0;
        jsSum = 0;
        return;
      }
      warmupDone = true;
      frames++;
      jsSum += jsMs;
      const elapsed = now - winStart;
      if (elapsed >= 500) {
        const fps = (frames * 1000) / elapsed;
        const avgJs = jsSum / frames;
        const heapMb = performance.memory ? ` heap:${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)}M` : '';
        el.textContent =
          `FPS:${fps.toFixed(1)} JS:${avgJs.toFixed(2)}ms` +
          `\nCalls:${renderer.info.render.calls} Tris:${renderer.info.render.triangles}` +
          `\nProps:${activeProps} Debris:${activeDebris}${heapMb}`;
        winStart = now;
        frames = 0;
        jsSum = 0;
      }
    },
  };
}
