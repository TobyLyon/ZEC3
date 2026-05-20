/**
 * ASCII Geometric Shader Animation Engine
 * Renders mathematical fields as ASCII art on a single <canvas> using a glyph atlas.
 */

export type ShaderMode =
  | "waves"
  | "spiral"
  | "metaballs"
  | "plasma"
  | "tunnel"
  | "moire"
  | "pulse"
  | "grid-rotate";

export interface AsciiShaderOptions {
  canvas: HTMLCanvasElement;
  mode?: ShaderMode;
  palette?: string;
  density?: number; // base cell size in px (8-24)
  speed?: number; // time multiplier
  seed?: number;
  opacity?: number; // overall canvas opacity (0-1)
}

interface ShaderState {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  atlas: HTMLCanvasElement;
  glyphW: number;
  glyphH: number;
  ramp: string;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  buffer: Float32Array;
  indexBuf: Uint8Array;
  mode: ShaderMode;
  speed: number;
  seed: number;
  time: number;
  running: boolean;
  rafId: number;
  lastFrameTime: number;
  frameTimeAvg: number;
  baseDensity: number;
  currentDensity: number;
  resizeObserver: ResizeObserver | null;
}

const DEFAULT_RAMP = " .·:;=+x#%@";
const ADAPTIVE_THRESHOLD_HIGH = 20; // ms
const ADAPTIVE_THRESHOLD_LOW = 12; // ms
const ADAPTIVE_FRAMES = 10;

export function createAsciiShader(options: AsciiShaderOptions) {
  const {
    canvas,
    mode = "waves",
    palette = DEFAULT_RAMP,
    density = 14,
    speed = 1,
    seed = Math.random() * 1000,
    opacity = 1,
  } = options;

  const ctx = canvas.getContext("2d", { alpha: true })!;

  const state: ShaderState = {
    ctx,
    canvas,
    atlas: document.createElement("canvas"),
    glyphW: 0,
    glyphH: 0,
    ramp: palette,
    cols: 0,
    rows: 0,
    cellW: 0,
    cellH: 0,
    buffer: new Float32Array(0),
    indexBuf: new Uint8Array(0),
    mode,
    speed,
    seed,
    time: 0,
    running: false,
    rafId: 0,
    lastFrameTime: 0,
    frameTimeAvg: 16,
    baseDensity: density,
    currentDensity: density,
    resizeObserver: null,
  };

  // Build glyph atlas
  function buildAtlas() {
    const fontSize = Math.max(10, state.currentDensity);
    const atlasCtx = state.atlas.getContext("2d")!;
    const font = `${fontSize}px "JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace`;
    atlasCtx.font = font;

    // Measure glyph
    const metrics = atlasCtx.measureText("@");
    state.glyphW = Math.ceil(metrics.width);
    state.glyphH = fontSize;

    // Size atlas: one row of glyphs
    state.atlas.width = state.glyphW * state.ramp.length;
    state.atlas.height = state.glyphH;

    atlasCtx.font = font;
    atlasCtx.textBaseline = "top";
    atlasCtx.fillStyle = "rgba(91, 216, 232, 0.85)";

    for (let i = 0; i < state.ramp.length; i++) {
      atlasCtx.fillText(state.ramp[i], i * state.glyphW, 0);
    }
  }

  function computeGrid() {
    const w = canvas.width;
    const h = canvas.height;
    state.cellW = state.currentDensity;
    state.cellH = Math.round(state.currentDensity * 1.6);
    state.cols = Math.ceil(w / state.cellW);
    state.rows = Math.ceil(h / state.cellH);
    const total = state.cols * state.rows;
    if (state.buffer.length < total) {
      state.buffer = new Float32Array(total);
      state.indexBuf = new Uint8Array(total);
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    computeGrid();
  }

  // Field functions — all return 0..1
  const fields: Record<ShaderMode, (x: number, y: number, t: number) => number> = {
    waves(x, y, t) {
      const v1 = Math.sin(x * 3.0 + t * 1.2) * 0.5 + 0.5;
      const v2 = Math.sin(y * 4.0 + t * 0.8) * 0.5 + 0.5;
      const v3 = Math.sin((x + y) * 2.5 + t) * 0.5 + 0.5;
      return (v1 + v2 + v3) / 3.0;
    },

    spiral(x, y, t) {
      const r = Math.sqrt(x * x + y * y);
      const a = Math.atan2(y, x);
      return (Math.sin(r * 8.0 - a * 3.0 + t * 2.0) * 0.5 + 0.5);
    },

    metaballs(x, y, t) {
      let v = 0;
      const cx1 = Math.sin(t * 0.7) * 0.4;
      const cy1 = Math.cos(t * 0.5) * 0.4;
      const cx2 = Math.sin(t * 1.1 + 2.0) * 0.35;
      const cy2 = Math.cos(t * 0.9 + 1.0) * 0.35;
      const cx3 = Math.sin(t * 0.4 + 4.0) * 0.3;
      const cy3 = Math.cos(t * 0.6 + 3.0) * 0.3;

      const d1 = (x - cx1) * (x - cx1) + (y - cy1) * (y - cy1);
      const d2 = (x - cx2) * (x - cx2) + (y - cy2) * (y - cy2);
      const d3 = (x - cx3) * (x - cx3) + (y - cy3) * (y - cy3);

      v = 0.12 / (d1 + 0.01) + 0.1 / (d2 + 0.01) + 0.08 / (d3 + 0.01);
      return Math.min(1.0, v * 0.08);
    },

    plasma(x, y, t) {
      const v1 = Math.sin(x * 5.0 + t);
      const v2 = Math.sin(y * 5.0 + t * 1.3);
      const v3 = Math.sin((x + y) * 3.0 + t * 0.7);
      const v4 = Math.sin(Math.sqrt(x * x + y * y) * 6.0 - t * 1.5);
      return ((v1 + v2 + v3 + v4) / 4.0) * 0.5 + 0.5;
    },

    tunnel(x, y, t) {
      const r = Math.sqrt(x * x + y * y) + 0.001;
      const a = Math.atan2(y, x);
      const v = Math.sin(1.0 / r * 4.0 + a * 2.0 - t * 2.0);
      return v * 0.5 + 0.5;
    },

    moire(x, y, t) {
      const v1 = Math.sin(x * 12.0 + t * 0.5);
      const v2 = Math.sin(y * 12.0 + t * 0.3);
      const ox = Math.sin(t * 0.4) * 0.3;
      const oy = Math.cos(t * 0.3) * 0.3;
      const v3 = Math.sin(((x - ox) * (x - ox) + (y - oy) * (y - oy)) * 16.0);
      return ((v1 + v2 + v3) / 3.0) * 0.5 + 0.5;
    },

    pulse(x, y, t) {
      // Horizontal pulse waves like a signal/heartbeat
      const wave = Math.sin(x * 10.0 - t * 3.0) * Math.exp(-Math.abs(y) * 2.0);
      const bars = Math.sin(x * 20.0 + t) * 0.3;
      const fade = 1.0 - Math.abs(y) * 0.7;
      return Math.max(0, Math.min(1, (wave + bars) * fade * 0.5 + 0.5));
    },

    "grid-rotate"(x, y, t) {
      const c = Math.cos(t * 0.3);
      const s = Math.sin(t * 0.3);
      const rx = x * c - y * s;
      const ry = x * s + y * c;
      const gx = Math.abs(((rx * 5.0) % 1.0) - 0.5) * 2.0;
      const gy = Math.abs(((ry * 5.0) % 1.0) - 0.5) * 2.0;
      return (gx + gy) * 0.5;
    },
  };

  function render(dt: number) {
    state.time += dt * state.speed * 0.001;
    const t = state.time + state.seed;
    const { cols, rows, cellW, cellH, buffer, indexBuf, ctx: c } = state;
    const field = fields[state.mode];
    const rampLen = state.ramp.length - 1;

    // Sample field
    for (let row = 0; row < rows; row++) {
      const ny = (row / rows) * 2.0 - 1.0;
      const offset = row * cols;
      for (let col = 0; col < cols; col++) {
        const nx = (col / cols) * 2.0 - 1.0;
        const v = field(nx, ny, t);
        const idx = offset + col;
        buffer[idx] = v;
        indexBuf[idx] = Math.round(v * rampLen) | 0;
      }
    }

    // Clear
    c.clearRect(0, 0, canvas.width, canvas.height);

    // Draw glyphs from atlas
    const { atlas, glyphW, glyphH } = state;
    for (let row = 0; row < rows; row++) {
      const dy = row * cellH;
      const offset = row * cols;
      for (let col = 0; col < cols; col++) {
        const charIdx = indexBuf[offset + col];
        if (charIdx === 0) continue; // skip spaces
        const sx = charIdx * glyphW;
        c.drawImage(atlas, sx, 0, glyphW, glyphH, col * cellW, dy, cellW, cellH);
      }
    }
  }

  // Adaptive quality
  let adaptiveCounter = 0;

  function adaptQuality(frameDt: number) {
    state.frameTimeAvg = state.frameTimeAvg * 0.9 + frameDt * 0.1;
    adaptiveCounter++;
    if (adaptiveCounter < ADAPTIVE_FRAMES) return;
    adaptiveCounter = 0;

    if (state.frameTimeAvg > ADAPTIVE_THRESHOLD_HIGH && state.currentDensity < 28) {
      state.currentDensity += 2;
      buildAtlas();
      computeGrid();
    } else if (state.frameTimeAvg < ADAPTIVE_THRESHOLD_LOW && state.currentDensity > state.baseDensity) {
      state.currentDensity -= 1;
      buildAtlas();
      computeGrid();
    }
  }

  function loop(now: number) {
    if (!state.running) return;
    const dt = Math.min(now - state.lastFrameTime, 50); // cap at 50ms
    state.lastFrameTime = now;
    adaptQuality(dt);
    render(dt);
    state.rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (state.running) return;
    state.running = true;
    state.lastFrameTime = performance.now();
    state.rafId = requestAnimationFrame(loop);
  }

  function pause() {
    state.running = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
  }

  function destroy() {
    pause();
    if (state.resizeObserver) state.resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", handleVisibility);
  }

  function setMode(m: ShaderMode) {
    state.mode = m;
  }

  function handleVisibility() {
    if (document.hidden) {
      pause();
    } else {
      start();
    }
  }

  // Init
  canvas.style.opacity = String(opacity);
  resize();
  buildAtlas();
  computeGrid();

  // Resize observer
  state.resizeObserver = new ResizeObserver(() => {
    resize();
    buildAtlas();
  });
  state.resizeObserver.observe(canvas);

  document.addEventListener("visibilitychange", handleVisibility);

  start();

  return { start, pause, destroy, setMode, resize };
}
