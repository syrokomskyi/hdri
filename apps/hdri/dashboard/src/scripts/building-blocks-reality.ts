/*
<MODULE_CONTRACT>
<purpose>Creates interactive ripple effect on canvas</purpose>
<non-goals>
  <item>Does not handle non-canvas elements</item>
  <item>Does not provide custom color schemes</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of ripple effect</item>
</CHANGE_SUMMARY>
*/

type Wave = {
  x: number;
  y: number;
  startMs: number;
  speedPxPerMs: number;
  bandPx: number;
  strength: number;
};

const BG_COLOR = { r: 250, g: 250, b: 249 }; // #fafaf9 — matches --bg
const DARK_TARGET = { r: 148, g: 163, b: 184 }; // #94a3b8 — --muted, darken target for active blocks

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function initBuildingBlocksReality(
  canvas: HTMLCanvasElement,
  idleBoost = 1,
  baseContrast = 0,
): () => void {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const motion = prefersReducedMotion ? 0.25 : 1;

  let rafId = 0;
  let lastDrawMs = 0;
  const TARGET_FPS = 30;
  const FRAME_INTERVAL = 1000 / TARGET_FPS;

  let isVisible = false;
  let dpr = 1;
  let width = 0;
  let height = 0;
  let cols = 0;
  let rows = 0;
  let cell = 0;

  let intensities: Float32Array | null = null;
  let targets: Float32Array | null = null;

  const waves: Wave[] = [];
  let nextWaveAtMs = 0;

  const pointer = {
    x: 0,
    y: 0,
    active: false,
    lastMoveMs: 0,
  };

  const scheduleNextWave = (nowMs: number) => {
    const base = 5000 + Math.random() * 2000;
    const intervalMs = prefersReducedMotion ? base * 2.5 : base;
    nextWaveAtMs = nowMs + intervalMs;
  };

  const spawnWave = (nowMs: number) => {
    if (width <= 0 || height <= 0) return;

    waves.push({
      x: Math.random() * width,
      y: Math.random() * height,
      startMs: nowMs,
      speedPxPerMs: 0.55 * motion,
      bandPx: Math.max(14, cell * 0.85),
      strength: 0.9 * motion,
    });

    while (waves.length > 3) waves.shift();
    scheduleNextWave(nowMs);
  };

  const computeGrid = (widthOverride?: number, heightOverride?: number) => {
    const nextWidth = Math.max(1, Math.ceil(widthOverride ?? window.innerWidth));
    const nextHeight = Math.max(1, Math.ceil(heightOverride ?? window.innerHeight));

    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    canvas.width = Math.round(nextWidth * dpr);
    canvas.height = Math.round(nextHeight * dpr);

    width = nextWidth;
    height = nextHeight;

    let idealCellSize = 22;
    if (width < 200) idealCellSize = 18;
    if (width < 100) idealCellSize = 16;

    let calculatedCols = Math.round(width / idealCellSize);
    calculatedCols = Math.max(3, calculatedCols);

    cell = width / calculatedCols;
    cols = calculatedCols;
    rows = Math.ceil(height / cell);

    const count = cols * rows;
    intensities = new Float32Array(count);
    targets = new Float32Array(count);

    const nowMs = performance.now();
    waves.length = 0;
    spawnWave(nowMs);
  };

  const getIndex = (c: number, r: number) => r * cols + c;

  let lastInputMs = 0;
  const INPUT_THROTTLE = 32;

  let rafPointerPending = false;
  let pendingPointer: {
    clientX: number;
    clientY: number;
    nowMs: number;
    active: boolean;
  } | null = null;

  const setPointerFromEvent = (clientX: number, clientY: number, nowMs: number) => {
    if (nowMs - lastInputMs < INPUT_THROTTLE) return;
    lastInputMs = nowMs;

    pendingPointer = { clientX, clientY, nowMs, active: true };
    if (rafPointerPending) return;
    rafPointerPending = true;

    requestAnimationFrame(() => {
      rafPointerPending = false;
      const p = pendingPointer;
      pendingPointer = null;
      if (!p) return;

      pointer.x = p.clientX;
      pointer.y = p.clientY;
      pointer.active = p.active;
      pointer.lastMoveMs = p.nowMs;
    });
  };

  const onMouseMove = (e: MouseEvent) => {
    setPointerFromEvent(e.clientX, e.clientY, performance.now());
  };

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    setPointerFromEvent(t.clientX, t.clientY, performance.now());
  };

  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    setPointerFromEvent(t.clientX, t.clientY, performance.now());
  };

  const onTouchEnd = () => {
    pendingPointer = {
      clientX: 0,
      clientY: 0,
      nowMs: performance.now(),
      active: false,
    };
    if (rafPointerPending) return;
    rafPointerPending = true;

    requestAnimationFrame(() => {
      rafPointerPending = false;
      pendingPointer = null;
      pointer.active = false;
    });
  };

  const draw = (nowMs: number) => {
    if (!isVisible) return;

    rafId = window.requestAnimationFrame(draw);

    const elapsed = nowMs - lastDrawMs;
    if (elapsed < FRAME_INTERVAL) return;
    lastDrawMs = nowMs - (elapsed % FRAME_INTERVAL);

    if (!intensities || !targets) return;

    if (nowMs >= nextWaveAtMs) spawnWave(nowMs);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < targets.length; i++) targets[i] = 0;

    // Cursor glow
    if (pointer.active && nowMs - pointer.lastMoveMs < 3000) {
      const radiusPx = Math.max(cell * 5.0, 150);
      const radiusSq = radiusPx * radiusPx;

      const minC = Math.max(0, Math.floor((pointer.x - radiusPx) / cell));
      const maxC = Math.min(cols - 1, Math.ceil((pointer.x + radiusPx) / cell));
      const minR = Math.max(0, Math.floor((pointer.y - radiusPx) / cell));
      const maxR = Math.min(rows - 1, Math.ceil((pointer.y + radiusPx) / cell));

      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          const cx = c * cell + cell * 0.5;
          const cy = r * cell + cell * 0.5;
          const dx = pointer.x - cx;
          const dy = pointer.y - cy;
          const distSq = dx * dx + dy * dy;
          if (distSq > radiusSq) continue;

          const dist = Math.sqrt(distSq);
          const t = clamp01(1 - dist / radiusPx);
          const glow = t * t;
          const idx = getIndex(c, r);
          targets[idx] = Math.max(targets[idx], glow);
        }
      }
    }

    // Ripple waves
    for (const wave of waves) {
      const elapsedMs = nowMs - wave.startMs;
      const radius = elapsedMs * wave.speedPxPerMs;
      const maxRadius = Math.hypot(width, height) + wave.bandPx * 2;
      if (radius > maxRadius) continue;

      const minC = Math.max(0, Math.floor((wave.x - radius - wave.bandPx) / cell));
      const maxC = Math.min(cols - 1, Math.ceil((wave.x + radius + wave.bandPx) / cell));
      const minR = Math.max(0, Math.floor((wave.y - radius - wave.bandPx) / cell));
      const maxR = Math.min(rows - 1, Math.ceil((wave.y + radius + wave.bandPx) / cell));

      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          const cx = c * cell + cell * 0.5;
          const cy = r * cell + cell * 0.5;
          const dist = Math.hypot(cx - wave.x, cy - wave.y);

          const delta = Math.abs(dist - radius);
          if (delta > wave.bandPx) continue;

          const t = clamp01(1 - delta / wave.bandPx);
          const pulse = t * t * wave.strength;
          const idx = getIndex(c, r);
          targets[idx] = Math.max(targets[idx], pulse);
        }
      }
    }

    // Update state
    const ease = 0.12;
    const decay = 0.94;

    for (let i = 0; i < intensities.length; i++) {
      const next = intensities[i] * decay + (targets[i] - intensities[i]) * ease;
      intensities[i] = clamp01(next);
    }

    // Render blocks
    const gap = Math.max(1, Math.floor(cell * 0.12));
    const size = cell - gap;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = getIndex(c, r);
        const a = intensities[idx];

        const seed = (c * 73856093) ^ (r * 19349663);
        const flicker =
          (0.008 + 0.008 * idleBoost) * motion +
          (0.012 + 0.012 * idleBoost) * motion * Math.sin(nowMs / 900 + (seed % 1000));

        const alpha = clamp01(flicker + a * 0.85);
        if (alpha < 0.01) continue;

        const x = c * cell + gap * 0.5;
        const y = r * cell + gap * 0.5;

        // Darken toward DARK_TARGET — baseContrast gives minimum visibility across all blocks
        const darken = clamp01(baseContrast + a * 0.6);
        const rr = Math.round(BG_COLOR.r + (DARK_TARGET.r - BG_COLOR.r) * darken);
        const gg = Math.round(BG_COLOR.g + (DARK_TARGET.g - BG_COLOR.g) * darken);
        const bb = Math.round(BG_COLOR.b + (DARK_TARGET.b - BG_COLOR.b) * darken);

        ctx.fillStyle = `rgba(${rr}, ${gg}, ${bb}, ${alpha})`;
        ctx.fillRect(x, y, size, size);
      }
    }

    // Remove finished waves
    for (let i = waves.length - 1; i >= 0; i--) {
      const wave = waves[i];
      const elapsedMs = nowMs - wave.startMs;
      const radius = elapsedMs * wave.speedPxPerMs;
      const maxRadius = Math.hypot(width, height) + wave.bandPx * 2;
      if (radius > maxRadius) waves.splice(i, 1);
    }
  };

  computeGrid();

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });

  const onResize = () => {
    computeGrid(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  const observer = new IntersectionObserver(
    ([entry]) => {
      const wasVisible = isVisible;
      isVisible = entry.isIntersecting;

      if (isVisible && !wasVisible) {
        lastDrawMs = performance.now();
        rafId = window.requestAnimationFrame(draw);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("touchstart", onTouchStart, { passive: true });
        window.addEventListener("touchmove", onTouchMove, { passive: true });
        window.addEventListener("touchend", onTouchEnd, { passive: true });
      } else if (!isVisible && wasVisible) {
        window.cancelAnimationFrame(rafId);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("touchstart", onTouchStart);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onTouchEnd);
      }
    },
    { threshold: 0 },
  );
  observer.observe(canvas);

  return () => {
    window.cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    observer.disconnect();
  };
}
