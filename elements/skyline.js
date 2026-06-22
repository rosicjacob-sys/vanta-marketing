/*
 * #30 — Bar Skyline · Lineage: The Ledger · V2 "THE RECORD STRIKE"
 *
 * Spring-overshoot bars rise on a reflective ink-violet floor under a slow
 * sweeping highlight; per-month "Vues du blogue" values count up as each bar
 * settles — recognizably the same skyline as V1. The elevation is the crown
 * beat. Once the 11 supporting bars settle, the record column (Octobre) holds a
 * breath (anticipation pre-compress + ambient pause), then FIRES upward on an
 * under-damped spring driven harder than the others so it visibly punches past
 * its settle line. At the apex the composite pass tears the cap edge red/cyan
 * (chromatic aberration ∝ bar velocity), a 4-point diffraction star lands on a
 * thrown crown chevron, and the lone hot-magenta flare ring expands & dies once.
 * The count-up lands its final digit ON the apex frame — number and motion
 * resolve together — then the bar rebounds with two decaying bounces.
 *
 * V2 adds, over V1:
 *  - a hand-rolled composite pass: bright-pass threshold bloom (lighter) +
 *    subtle barrel vignette ring + velocity-coupled chromatic aberration on the
 *    record strike, all in one final fullscreen pass on an offscreen scene canvas.
 *  - depth: a far ghosted skyline (parallax, blurred, atmospheric-faded) behind
 *    the main row, foreground crown/labels; pointer micro-parallax across layers.
 *  - velocity-coupled signature beat: anticipation → harder spring overshoot →
 *    two settle bounces, with apex-synced crown/flare/landing.
 *  - tabular count-up with a white→lilac landing flash; fixed-advance digits.
 *  - material: fresnel side rims + vertical specular streak + contact shadows.
 *  - sweep clipped to the actual bar union (a Path2D built once per layout) and
 *    paused during the anticipation beat.
 *
 * Deps: none (pure Canvas2D). Perf: DPR capped [1,2]; flat typed-array state,
 * zero hot-loop allocation (all Path2D / offscreen canvases built once in
 * layout/resize); single rAF; ResizeObserver; reduced-motion static frame;
 * 3.5s reveal failsafe; leak-free destroy. Coarse-pointer / small cells drop
 * grain + bloom + parallax cost.
 */

const ROYAL = {
  void: "#07060D",     // background, violet undertone
  ink: "#150E2A",      // ink-violet panel
  royal: "#7C3AED",    // the signature accent
  deep: "#4C1D95",     // shadow / mid
  lilac: "#A855F7",    // halo gradient start
  lilacHi: "#C4B5FD",  // halo gradient tip
  white: "#F6F3FE",    // type + rarest sparks
  flare: "#E8409B",    // rare alert flare — used exactly once (record beat)
};

// ---- bespoke easing ----
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// critically-shaped spring with overshoot, settling near t=1 (V1's foundation)
const springOvershoot = (t, w, z) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  w = w || 9.2;            // angular freq
  z = z == null ? 0.32 : z; // damping ratio (under-damped -> overshoot)
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * Math.cos(wd * t);
};
// analytic derivative of springOvershoot — gives instantaneous velocity for the
// chromatic-aberration spike + haptic glint timing (no per-frame finite-diff state).
const springVel = (t, w, z) => {
  if (t <= 0 || t >= 1) return 0;
  w = w || 9.2;
  z = z == null ? 0.32 : z;
  const wd = w * Math.sqrt(1 - z * z);
  const e = Math.exp(-z * w * t);
  // d/dt [1 - e^{-zwt} cos(wd t)] = e^{-zwt}( zw cos(wd t) + wd sin(wd t) )
  return e * (z * w * Math.cos(wd * t) + wd * Math.sin(wd * t));
};

export const meta = {
  id: 30,
  slug: "bar-skyline",
  title: "Bar Skyline",
  lineage: "The Ledger",
  version: "V2",
  signature: "The record bar holds a breath, then strikes past the skyline — chromatic tear, a thrown crown star, one magenta flare, and a count-up that lands on the apex frame.",
  interaction: "Hover a bar for its value; the cursor lights the nearest column and parallaxes the depth layers. Click to replay the strike.",
  deps: [],
};

export function mount(container, opts = {}) {
  const tokens = { ...ROYAL, ...(opts.tokens || {}) };

  // ---- reduced motion + pointer capability ----
  const mqReduce =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  let reducedMotion = !!opts.reducedMotion || (mqReduce && mqReduce.matches);
  const coarse =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(pointer: coarse)").matches;

  // ---- DOM scaffold ----
  const root = document.createElement("div");
  root.style.cssText =
    "position:absolute;inset:0;overflow:hidden;background:" +
    tokens.void +
    ";font-family:'Inter','Helvetica Neue',Arial,system-ui,sans-serif;" +
    "-webkit-font-smoothing:antialiased;cursor:default;";
  container.appendChild(root);

  // Static gradient fallback (also the canvas-less / error safety net).
  const fallback = document.createElement("div");
  fallback.style.cssText =
    "position:absolute;inset:0;opacity:0;transition:opacity .5s ease;" +
    "background:radial-gradient(130% 100% at 50% 18%," +
    tokens.deep +
    "33 0%," +
    tokens.void +
    " 62%),linear-gradient(180deg," +
    tokens.ink +
    " 0%," +
    tokens.void +
    " 70%);";
  root.appendChild(fallback);

  // visible canvas (final composite is blitted here)
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;";
  root.appendChild(canvas);

  // Floating tooltip (DOM, so type stays crisp at any DPR).
  const tip = document.createElement("div");
  tip.style.cssText =
    "position:absolute;left:0;top:0;pointer-events:none;opacity:0;" +
    "transform:translate(-50%,-118%) scale(.92);transform-origin:50% 100%;" +
    "transition:opacity .15s ease,transform .15s cubic-bezier(.2,1.3,.4,1);" +
    "padding:7px 11px 8px;border-radius:9px;white-space:nowrap;z-index:4;" +
    "background:linear-gradient(180deg," + tokens.ink + "f2,#0b0717f2);" +
    "border:1px solid " + tokens.royal + "66;" +
    "box-shadow:0 8px 26px -8px " + tokens.royal + "88,0 0 0 1px #0006 inset;";
  root.appendChild(tip);

  // ---- visible context + offscreen compositing canvases ----
  let view = null;     // visible ctx
  try {
    view = canvas.getContext("2d", { alpha: false });
  } catch (e) {
    view = null;
  }
  if (!view) {
    fallback.style.opacity = "1";
    return {
      replay() {},
      pause() {},
      resume() {},
      setReducedMotion() {},
      destroy() {
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  }

  // Offscreen scene canvas: everything is drawn here at DPR scale, then the
  // composite pass (bloom + barrel + chromatic aberration) blits to `canvas`.
  const scene = document.createElement("canvas");
  let ctx = scene.getContext("2d", { alpha: false });
  // Bloom work canvas (half-res bright-pass + blur). Built once in resize.
  const bloomC = document.createElement("canvas");
  let bctx = bloomC.getContext("2d");
  // does this browser support ctx.filter blur? (test once)
  const FILTER_OK = (() => {
    try {
      const t = document.createElement("canvas").getContext("2d");
      t.filter = "blur(2px)";
      return t.filter === "blur(2px)";
    } catch (e) { return false; }
  })();
  // composite features off on coarse/no-filter for perf & legibility
  const COMPOSITE = !coarse;

  // ---- sizing ----
  let W = 0, H = 0, DPR = 1;
  const readDPR = () =>
    clamp(window.devicePixelRatio || 1, 1, coarse ? 1.5 : 2);

  function resize() {
    const r = container.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    DPR = readDPR();
    const pw = Math.round(W * DPR), ph = Math.round(H * DPR);
    canvas.width = pw; canvas.height = ph;
    scene.width = pw; scene.height = ph;
    // bloom at half res (and at least 1px)
    bloomC.width = Math.max(1, Math.round(pw / 2));
    bloomC.height = Math.max(1, Math.round(ph / 2));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    view.setTransform(1, 0, 0, 1, 0, 0); // view blits in device px
    layout();
    bakeGrain();
    if (reducedMotion) drawStatic();
  }

  // ---- data: "Vues du blogue" by month (illustrative) ----
  const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  // Illustrative "Vues du blogue" — trends up to the record month (Octobre).
  // Scaled so the record bar reads 7 400 vues; others stay proportional.
  const RAW = [3200, 2800, 3700, 3400, 4050, 3700, 4350, 4700, 5050, 7400, 6100, 6400];
  const RECORD = 9; // Octobre — the bar that breaks the skyline
  const N = RAW.length;
  const MAXV = Math.max.apply(null, RAW);

  // flat per-bar state (no per-frame allocation)
  const tStart = new Float32Array(N);   // entrance delay per bar (0..1 of reveal)
  const liveH = new Float32Array(N);    // current animated height factor 0..1
  const dispVal = new Float32Array(N);  // counted-up displayed value
  const hoverGlow = new Float32Array(N);// 0..1 hover emphasis
  // record strike phase: position (0..1 of its over-reach), velocity, anticipation
  const recordPhase = { v: 0, vel: 0, antic: 0 };

  // ---- geometry (recomputed on resize) ----
  let geo = null;
  let barUnionPath = null;   // Path2D of all bar rects (sweep clip) — built once/layout
  let recordValW = 0;        // measured fixed advance for tabular value (px)
  function layout() {
    const padX = Math.max(18, W * 0.07);
    const baseY = H * 0.7;            // floor line (bars stand here)
    const floorDepth = H * 0.24;      // reflection / perspective band below
    const topPad = H * 0.16;          // headroom above tallest normal bar
    const usableH = baseY - topPad;
    const gap = Math.max(4, W * 0.012);
    const innerW = W - padX * 2;
    const barW = clamp((innerW - gap * (N - 1)) / N, 6, 64);
    const totalW = barW * N + gap * (N - 1);
    const startX = (W - totalW) / 2;
    geo = {
      padX, baseY, floorDepth, topPad, usableH,
      gap, barW, startX, totalW,
      recordExtra: usableH * 0.34,
    };
    // Build the bar-union clip once (full settled rects incl. record over-reach
    // headroom). Sweep light only rakes the columns, never the gaps. Rebuilt on
    // layout only — never per frame.
    barUnionPath = new Path2D();
    const cr = Math.min(barW * 0.32, 6);
    for (let i = 0; i < N; i++) {
      const x = startX + i * (barW + gap);
      const top = (i === RECORD)
        ? baseY - (usableH + geo.recordExtra)
        : baseY - usableH * barTargetH(i);
      addRoundTopPath(barUnionPath, x, top, barW, baseY - top, cr);
    }
    // measure tabular digit advance once (value uses fixed-width slots)
    if (ctx) {
      ctx.font = recordValFont();
      // widest digit measured for the whole number string slot
      recordValW = ctx.measureText("0").width;
    }
  }

  function recordValFont() {
    return "600 " + clamp(Math.round(geo.barW * 0.62), 12, 18) +
      "px 'Inter',system-ui,sans-serif";
  }

  function barX(i) { return geo.startX + i * (geo.barW + geo.gap); }
  function barTargetH(i) { return RAW[i] / MAXV; }

  // ---- pre-baked film grain tile ----
  let grainCanvas = null;
  function bakeGrain() {
    if (coarse) { grainCanvas = null; return; }
    const s = 128;
    const c = document.createElement("canvas");
    c.width = s; c.height = s;
    const g = c.getContext("2d");
    const img = g.createImageData(s, s);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 11; // very faint
    }
    g.putImageData(img, 0, 0);
    grainCanvas = c;
  }

  // ---- entrance timeline ----
  const REVEAL_MS = 1500;     // bars settle
  // strike act windows (ms, relative to RECORD_DELAY)
  const RECORD_DELAY = 1240;  // strike kicks after the supporting bars settle
  const ANTIC_MS = 180;       // ACT 1: held breath / pre-compress
  const STRIKE_MS = 420;      // ACT 2: fires up on the harder spring (apex inside)
  const SETTLE_MS = 500;      // ACT 3: rebound bounces
  const RECORD_MS = ANTIC_MS + STRIKE_MS + SETTLE_MS;
  // record drives a harder, less-damped spring so it punches past settle line
  const REC_W = 10.5, REC_Z = 0.26;
  // apex time within STRIKE (first peak of the under-damped spring), as a fraction
  // of STRIKE_MS — used to sync crown throw, flare, landing flash & count-up.
  const APEX_FRAC = (() => {
    const wd = REC_W * Math.sqrt(1 - REC_Z * REC_Z);
    return Math.PI / wd; // first peak of 1 - e^{} cos(wd t)
  })();

  let startT = 0;
  let recordFired = false;
  let crownPop = 0;           // 0..1 crown chevron throw progress
  let crownThrow = 0;         // 0..1 micro-overshoot of the thrown chevron
  let starBorn = false;       // diffraction star lands once on apex
  let starT = 0;              // 0..1 star settle (instant pop, then steady)
  let flareT = 0;             // 0..1 single magenta flare (fires once on downbeat)
  let flareFired = false;
  let landFlash = 0;          // 0..1 white->lilac landing flash on value text
  let valueLocked = false;
  let phase = "reveal";       // reveal | idle
  let recordStartT = -1;      // absolute time the strike act-machine started

  function resetTimeline() {
    startT = performance.now();
    recordFired = false;
    crownPop = 0;
    crownThrow = 0;
    starBorn = false;
    starT = 0;
    flareT = 0;
    flareFired = false;
    landFlash = 0;
    valueLocked = false;
    phase = "reveal";
    recordStartT = -1;
    sweepPhase = 0;
    sweepPaused = false;
    recordPhase.v = 0;
    recordPhase.vel = 0;
    recordPhase.antic = 0;
    for (let i = 0; i < N; i++) {
      tStart[i] = (i / N) * 0.55; // staggered springs left->right
      liveH[i] = 0;
      dispVal[i] = 0;
      hoverGlow[i] = 0;
    }
  }

  // ---- pointer (+ smoothed parallax) ----
  let pointer = { x: -1, y: -1, inside: false };
  let hoveredBar = -1;
  let paraX = 0, paraY = 0;      // smoothed -1..1 parallax offset

  function onMove(e) {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.inside = true;
  }
  function onLeave() {
    pointer.inside = false;
    pointer.x = -1; pointer.y = -1;
    hoveredBar = -1;
  }
  function onClick() {
    if (reducedMotion) return;
    api.replay();
  }

  function pickBar() {
    if (!pointer.inside || coarse) return -1;
    for (let i = 0; i < N; i++) {
      const x0 = barX(i) - geo.gap * 0.5;
      const x1 = barX(i) + geo.barW + geo.gap * 0.5;
      if (pointer.x >= x0 && pointer.x <= x1 && pointer.y <= geo.baseY + 6) {
        return i;
      }
    }
    return -1;
  }

  // ---- drawing helpers ----
  function barTopY(i, hFactor) {
    let h = hFactor * geo.usableH;
    if (i === RECORD) {
      // strike over-reach + anticipation pre-compress (negative)
      h += geo.recordExtra * recordPhase.v;
      h -= geo.usableH * 0.06 * recordPhase.antic; // ~6% shorter at full anticipation
    }
    return geo.baseY - h;
  }

  function addRoundTopPath(path, x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h);
    path.moveTo(x, y + h);
    path.lineTo(x, y + r);
    path.quadraticCurveTo(x, y, x + r, y);
    path.lineTo(x + w - r, y);
    path.quadraticCurveTo(x + w, y, x + w, y + r);
    path.lineTo(x + w, y + h);
    path.closePath();
  }
  function roundRectTop(x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }
  // fully-rounded rect (used for the record value contrast pill)
  function roundRectFull(x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // additive glow halo
  function capGlow(cx, cy, radius, color, alpha) {
    if (radius <= 0) return;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, hexA(color, alpha));
    g.addColorStop(1, hexA(color, 0));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- bar material (fresnel sides + specular streak + contact shadow) ----
  function fillBar(x, yTop, w, hPix, isRecord, glow, sweepX, depthDim) {
    if (hPix <= 0.5) return;
    const cr = Math.min(w * 0.34, 6.5);

    // contact shadow under the foot (anchors bar to the floor) — skip for mirror
    if (depthDim == null && hPix > 4) {
      const sh = ctx.createRadialGradient(
        x + w / 2, geo.baseY + 1, 0, x + w / 2, geo.baseY + 1, w * 1.1);
      sh.addColorStop(0, hexA(tokens.void, 0.7));
      sh.addColorStop(1, hexA(tokens.void, 0));
      ctx.save();
      ctx.fillStyle = sh;
      ctx.fillRect(x - w * 0.6, geo.baseY - 2, w * 2.2, w * 1.1);
      ctx.restore();
    }

    // body gradient
    const g = ctx.createLinearGradient(0, yTop, 0, geo.baseY);
    if (isRecord) {
      g.addColorStop(0, hexA(tokens.lilacHi, 0.99));
      g.addColorStop(0.26, hexA(tokens.lilac, 0.96));
      g.addColorStop(1, hexA(tokens.royal, 0.92));
    } else {
      const top = mixHex(tokens.royal, tokens.lilac, 0.32 + glow * 0.42);
      g.addColorStop(0, hexA(top, 0.92 + glow * 0.08));
      g.addColorStop(1, hexA(tokens.deep, 0.58 + glow * 0.22));
    }
    ctx.fillStyle = g;
    roundRectTop(x, yTop, w, hPix, cr);
    ctx.fill();

    // fresnel-style vertical rims (lit volume, not flat rect)
    if (w > 7) {
      ctx.save();
      roundRectTop(x, yTop, w, hPix, cr);
      ctx.clip();
      const rimA = isRecord ? 0.5 : 0.22 + glow * 0.3;
      const rimW = Math.max(1.4, w * 0.16);
      // left
      let lg = ctx.createLinearGradient(x, 0, x + rimW, 0);
      lg.addColorStop(0, hexA(tokens.lilacHi, rimA));
      lg.addColorStop(1, hexA(tokens.lilacHi, 0));
      ctx.fillStyle = lg;
      ctx.fillRect(x, yTop, rimW, hPix);
      // right (slightly darker — single key light from upper-left)
      let rg = ctx.createLinearGradient(x + w - rimW, 0, x + w, 0);
      rg.addColorStop(0, hexA(tokens.royal, 0));
      rg.addColorStop(1, hexA(tokens.lilac, rimA * 0.7));
      ctx.fillStyle = rg;
      ctx.fillRect(x + w - rimW, yTop, rimW, hPix);

      // vertical specular streak that tracks the sweep highlight position
      if (sweepX != null && !reducedMotion) {
        const d = Math.abs((x + w / 2) - sweepX);
        const reach = Math.max(40, W * 0.10);
        if (d < reach) {
          const k = (1 - d / reach);
          const sa = (isRecord ? 0.34 : 0.16) * k * k;
          const sx = x + w * 0.42;
          const sw = Math.max(1.5, w * 0.18);
          let sg = ctx.createLinearGradient(sx, 0, sx + sw, 0);
          sg.addColorStop(0, hexA(tokens.lilacHi, 0));
          sg.addColorStop(0.5, hexA(tokens.white, sa));
          sg.addColorStop(1, hexA(tokens.lilacHi, 0));
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = sg;
          ctx.fillRect(sx - sw, yTop, sw * 2, hPix);
        }
      }
      ctx.restore();
    }

    // atmospheric dim for the far depth layer
    if (depthDim != null && depthDim > 0) {
      ctx.save();
      roundRectTop(x, yTop, w, hPix, cr);
      ctx.clip();
      ctx.fillStyle = hexA(tokens.void, depthDim);
      ctx.fillRect(x, yTop, w, hPix);
      ctx.restore();
    }

    // crisp lilac cap rim
    ctx.strokeStyle = hexA(tokens.lilacHi, isRecord ? 0.96 : 0.5 + glow * 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 1, yTop + 0.5);
    ctx.lineTo(x + w - 1, yTop + 0.5);
    ctx.stroke();
  }

  // ---- backdrop ----
  function paintBackdrop() {
    ctx.fillStyle = tokens.void;
    ctx.fillRect(0, 0, W, H);

    const halo = ctx.createRadialGradient(
      W * 0.5, H * 0.12, 0,
      W * 0.5, H * 0.12, Math.max(W, H) * 0.9
    );
    halo.addColorStop(0, hexA(tokens.deep, 0.30));
    halo.addColorStop(0.45, hexA(tokens.ink, 0.22));
    halo.addColorStop(1, hexA(tokens.void, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    const fg = ctx.createLinearGradient(0, geo.baseY, 0, geo.baseY + geo.floorDepth);
    fg.addColorStop(0, hexA(tokens.ink, 0.55));
    fg.addColorStop(0.5, hexA(tokens.ink, 0.16));
    fg.addColorStop(1, hexA(tokens.void, 0));
    ctx.fillStyle = fg;
    ctx.fillRect(0, geo.baseY, W, geo.floorDepth);

    ctx.strokeStyle = hexA(tokens.royal, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(geo.startX - geo.gap, geo.baseY + 0.5);
    ctx.lineTo(geo.startX + geo.totalW + geo.gap, geo.baseY + 0.5);
    ctx.stroke();
  }

  // ---- far parallax skyline (depth layer b) ----
  function paintFarSkyline() {
    if (coarse) return;
    const w = geo.barW * 0.7;
    const gap = geo.gap * 1.4;
    const total = (w + gap) * (N + 2);
    const cx = W * 0.5 + paraX * 14; // drifts opposite the cursor (sign below)
    const sx = cx - total / 2 - paraX * 26;
    const base = geo.baseY - geo.usableH * 0.06;
    ctx.save();
    ctx.globalAlpha = 0.5;
    if (FILTER_OK) ctx.filter = "blur(2.5px)";
    for (let i = 0; i < N + 2; i++) {
      const x = sx + i * (w + gap);
      // pseudo skyline silhouette heights (deterministic, no alloc)
      const seed = Math.sin(i * 1.7 + 0.6) * 0.5 + 0.5;
      const hF = 0.18 + seed * 0.34;
      const top = base - geo.usableH * hF;
      fillBar(x, top, w, base - top, false, 0, null, 0.55); // atmospheric dim
    }
    if (FILTER_OK) ctx.filter = "none";
    ctx.restore();
    // atmospheric fade toward void over the far layer
    const af = ctx.createLinearGradient(0, geo.topPad, 0, base);
    af.addColorStop(0, hexA(tokens.void, 0.55));
    af.addColorStop(1, hexA(tokens.void, 0.0));
    ctx.fillStyle = af;
    ctx.fillRect(0, geo.topPad, W, base - geo.topPad);
  }

  // ---- full scene paint into the offscreen ctx ----
  let sweepPhase = 0;
  let sweepPaused = false;
  function paintScene() {
    paintBackdrop();

    // (b) far parallax skyline behind the main row
    paintFarSkyline();

    const w = geo.barW;

    // foreground parallax shift for the main row (small, opposite far layer)
    const mpx = paraX * 4;
    ctx.save();
    ctx.translate(mpx, 0);

    // --- reflections first (mirrored, faded), drawn into the floor band ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(-mpx, geo.baseY, W, geo.floorDepth);
    ctx.clip();
    ctx.globalAlpha = 0.34;
    for (let i = 0; i < N; i++) {
      const x = barX(i);
      const yTop = barTopY(i, liveH[i]);
      const hPix = geo.baseY - yTop;
      if (hPix <= 0.5) continue;
      ctx.save();
      ctx.translate(0, geo.baseY);
      ctx.scale(1, -1);
      ctx.translate(0, -geo.baseY);
      const mirH = Math.min(hPix, geo.floorDepth);
      fillBar(x, geo.baseY - mirH, w, mirH, i === RECORD, hoverGlow[i] * 0.5, null, 0);
      ctx.restore();
    }
    ctx.restore();

    // ACT-3 hot specular smear under the record reflection (brightens once)
    paintReflectionSmear();

    // fade the reflection downward
    const rf = ctx.createLinearGradient(0, geo.baseY, 0, geo.baseY + geo.floorDepth);
    rf.addColorStop(0, hexA(tokens.void, 0));
    rf.addColorStop(1, hexA(tokens.void, 0.92));
    ctx.fillStyle = rf;
    ctx.fillRect(-mpx, geo.baseY, W, geo.floorDepth);

    // --- sweep highlight, clipped to the actual bar union ---
    const sweepX = paintSweep();

    // --- real bars ---
    for (let i = 0; i < N; i++) {
      const x = barX(i);
      const yTop = barTopY(i, liveH[i]);
      const hPix = geo.baseY - yTop;
      const glow = hoverGlow[i];
      fillBar(x, yTop, w, hPix, i === RECORD, glow, sweepX, null);
      if (glow > 0.01 && hPix > 1) {
        capGlow(x + w / 2, yTop, w * (1.6 + glow), tokens.lilac, 0.22 * glow);
      }
    }

    // --- record cap: crown star + (one) flare ---
    paintRecordCap();

    // --- labels (foreground parallax: slight, opposite) ---
    ctx.restore();
    ctx.save();
    ctx.translate(paraX * 6, paraY * 3);
    paintLabels();
    ctx.restore();

    // grain (gentle additive) — vignette is applied in the composite pass
    paintGrain();
  }

  // sweep light raking the columns; returns its center x (for specular streaks)
  function paintSweep() {
    if (reducedMotion) return null;
    const span = geo.totalW + W * 0.4;
    const cx = geo.startX - W * 0.2 + sweepPhase * span;
    if (sweepPhase < -0.1 || sweepPhase > 1.3) return cx;
    const bandW = Math.max(60, W * 0.16);
    ctx.save();
    ctx.clip(barUnionPath); // ONLY the columns get lit, never the gaps
    const g = ctx.createLinearGradient(cx - bandW, 0, cx + bandW, 0);
    g.addColorStop(0, hexA(tokens.lilacHi, 0));
    g.addColorStop(0.5, hexA(tokens.lilacHi, 0.10));
    g.addColorStop(1, hexA(tokens.lilacHi, 0));
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.fillRect(geo.startX - bandW, geo.topPad - geo.recordExtra,
      geo.totalW + bandW * 2, geo.baseY - (geo.topPad - geo.recordExtra));
    ctx.restore();
    return cx;
  }

  // ACT-3 reflection smear: a hot specular column under the record foot,
  // brightening on the first downbeat (driven by flareT envelope).
  function paintReflectionSmear() {
    const i = RECORD;
    if (recordPhase.v < 0.3) return;
    const env = flareFired ? (1 - flareT) : 0; // peaks as the flare lands, fades
    const k = Math.max(env, recordPhase.v > 0.6 ? 0.18 : 0); // baseline + downbeat
    if (k <= 0.02) return;
    const x = barX(i);
    const w = geo.barW;
    const cx = x + w / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, geo.baseY, W, geo.floorDepth);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    const sg = ctx.createLinearGradient(0, geo.baseY, 0, geo.baseY + geo.floorDepth * 0.8);
    sg.addColorStop(0, hexA(tokens.lilacHi, 0.5 * k));
    sg.addColorStop(0.4, hexA(tokens.lilac, 0.22 * k));
    sg.addColorStop(1, hexA(tokens.lilac, 0));
    ctx.fillStyle = sg;
    ctx.fillRect(cx - w * 0.85, geo.baseY, w * 1.7, geo.floorDepth * 0.8);
    ctx.restore();
  }

  function paintRecordCap() {
    const i = RECORD;
    const x = barX(i);
    const w = geo.barW;
    const yTop = barTopY(i, liveH[i]);
    const hPix = geo.baseY - yTop;
    if (hPix <= 1) return;
    const cx = x + w / 2;

    // persistent royal glow on the record cap
    const rp = recordPhase.v;
    if (rp > 0.01) {
      capGlow(cx, yTop, w * (2.2 + rp * 1.4), tokens.royal, 0.30 * rp);
    }

    // thrown crown chevron with micro-overshoot — lands the diffraction star
    if (crownPop > 0.001) {
      const p = easeOutCubic(clamp(crownPop, 0, 1));
      // throw overshoot: chevron flies a touch high then settles
      const over = crownThrow; // 0..1, eased-back outside
      const liftMax = Math.max(11, w * 0.95);
      const lift = liftMax * (p + over * 0.18);
      const tickY = yTop - lift;
      const arm = Math.max(5, w * 0.44) * p;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      // stem
      ctx.strokeStyle = hexA(tokens.white, 0.9 * p);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, yTop);
      ctx.lineTo(cx, tickY + arm * 0.5);
      ctx.stroke();
      // crown chevron (^)
      ctx.beginPath();
      ctx.moveTo(cx - arm, tickY + arm * 0.55);
      ctx.lineTo(cx, tickY - arm * 0.25);
      ctx.lineTo(cx + arm, tickY + arm * 0.55);
      ctx.stroke();
      ctx.restore();

      // the additive specular star (4-point diffraction spikes), lands not fades
      if (starBorn) {
        drawDiffractionStar(cx, tickY - arm * 0.1, Math.max(7, w * 0.7), starT);
      }
    }

    // the single hot-magenta flare — fires once on the first downbeat
    if (flareT > 0.001 && flareT < 1) {
      const f = flareT;
      const ring = (w * 0.8) + f * w * 3.4;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = hexA(tokens.flare, (1 - f) * 0.85);
      ctx.lineWidth = 2 * (1 - f) + 0.5;
      ctx.beginPath();
      ctx.arc(cx, yTop, ring, 0, Math.PI * 2);
      ctx.stroke();
      capGlow(cx, yTop, w * (1.2 + f * 2), tokens.flare, (1 - f) * 0.5);
      ctx.restore();
    }
  }

  // 4-point additive diffraction star with a 1px hot core
  function drawDiffractionStar(cx, cy, r, t) {
    const a = clamp(t, 0, 1);
    const len = r * (0.6 + a * 0.4);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // soft bloom seed
    capGlow(cx, cy, r * 1.4, tokens.white, 0.5 * a);
    // 4 long spikes (vertical + horizontal) with bright thin cores
    ctx.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const ang = (Math.PI / 2) * k;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const grad = ctx.createLinearGradient(
        cx, cy, cx + dx * len, cy + dy * len);
      grad.addColorStop(0, hexA(tokens.white, 0.95 * a));
      grad.addColorStop(1, hexA(tokens.lilacHi, 0));
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1; // 1px-core
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * len, cy + dy * len);
      ctx.stroke();
    }
    // tiny diagonal sparkles (shorter)
    for (let k = 0; k < 4; k++) {
      const ang = Math.PI / 4 + (Math.PI / 2) * k;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const grad = ctx.createLinearGradient(
        cx, cy, cx + dx * len * 0.45, cy + dy * len * 0.45);
      grad.addColorStop(0, hexA(tokens.white, 0.55 * a));
      grad.addColorStop(1, hexA(tokens.lilacHi, 0));
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * len * 0.45, cy + dy * len * 0.45);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- labels (tabular value + landing flash) ----
  const MONTH_NAMES = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];

  function paintLabels() {
    const w = geo.barW;
    const small = w < 16;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // month initials under each bar
    ctx.font =
      "500 " + clamp(Math.round(w * 0.5), 9, 12) + "px 'Inter',system-ui,sans-serif";
    for (let i = 0; i < N; i++) {
      const x = barX(i) + w / 2;
      const isR = i === RECORD;
      const glow = hoverGlow[i];
      ctx.fillStyle = isR
        ? hexA(tokens.white, 1)
        : hexA(tokens.white, 0.82 + glow * 0.18);
      ctx.fillText(MONTHS[i], x, geo.baseY + clamp(geo.floorDepth * 0.42, 14, 26));
    }

    // record value + caption on a dark contrast pill, ABOVE the bar top edge.
    // The pill sits on the dark backdrop (never over the bright bloomed bar) and
    // carries its own dark fill + shadow, so the pure-white value can NEVER be
    // washed out by the bloom/composite pass. Always shown once the strike begins
    // (and unconditionally in the static frame, where recordPhase.v === 1).
    if (recordPhase.v > 0.18 && !small) {
      const i = RECORD;
      const cx = barX(i) + w / 2;
      const yTop = barTopY(i, liveH[i]);
      // keep the pill clear of the thrown crown chevron, anchored above the cap
      const lift = Math.max(11, w * 0.95) * easeOutCubic(clamp(crownPop, 0, 1));
      const v = Math.round(dispVal[i]);
      const popA = clamp(crownPop, 0, 1);
      const valStr = formatFR(v) + " vues";

      // measure the chip so it fits the value + caption snugly (tabular value)
      ctx.font = recordValFont();
      const valW = measureTabular(valStr);
      ctx.font = "700 9px 'Inter',system-ui,sans-serif";
      const capW = ctx.measureText("RECORD").width;
      const padX = 11, padTop = 7, gapY = 5, capH = 9;
      const valFontPx = clamp(Math.round(geo.barW * 0.62), 12, 18);
      const chipW = Math.max(valW, capW) + padX * 2;
      const chipH = padTop + valFontPx + gapY + capH + padTop;
      // bottom of the pill rides just above the (possibly lifted) crown stem
      const chipBottom = yTop - lift - 10;
      const chipTop = chipBottom - chipH;
      const chipX = cx - chipW / 2;

      // dark rounded backdrop (drawn whether or not it overlaps the bloom)
      ctx.save();
      ctx.globalAlpha = popA;
      // soft drop shadow lifts the pill off the background
      ctx.shadowColor = hexA(tokens.void, 0.85);
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 3;
      roundRectFull(chipX, chipTop, chipW, chipH, Math.min(10, chipH * 0.5));
      ctx.fillStyle = hexA("#0B0717", 0.9);
      ctx.fill();
      // kill the shadow before the border/stem so they stay crisp
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      // thin royal hairline border
      roundRectFull(chipX, chipTop, chipW, chipH, Math.min(10, chipH * 0.5));
      ctx.strokeStyle = hexA(tokens.royal, 0.7);
      ctx.lineWidth = 1;
      ctx.stroke();
      // tiny connector tick from the pill down toward the cap
      ctx.strokeStyle = hexA(tokens.royal, 0.55);
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, chipBottom);
      ctx.lineTo(cx, Math.min(chipBottom + 6, yTop - 2));
      ctx.stroke();
      ctx.restore();

      // value — pure crisp white on the dark pill, with a dark text-shadow as a
      // belt-and-suspenders guard against any stray bloom bleeding onto it.
      const valBaseline = chipTop + padTop + valFontPx - 2;
      ctx.save();
      ctx.shadowColor = hexA(tokens.void, 0.9);
      ctx.shadowBlur = 4;
      // landing flash briefly tints toward lilac, then resolves to pure white
      const flashCol = mixHex(tokens.white, tokens.lilacHi, landFlash * 0.35);
      ctx.fillStyle = hexA(flashCol, popA);
      drawTabularValue(cx, valBaseline, valStr);
      ctx.restore();

      // caption — crisp lilac/white on the dark pill
      ctx.save();
      ctx.shadowColor = hexA(tokens.void, 0.9);
      ctx.shadowBlur = 3;
      ctx.textAlign = "center";
      ctx.font = "700 9px 'Inter',system-ui,sans-serif";
      ctx.fillStyle = hexA(mixHex(tokens.lilacHi, tokens.white, 0.4 + landFlash * 0.3),
        0.95 * popA);
      ctx.fillText("RECORD", cx, chipBottom - padTop + 1);
      ctx.restore();
    }

    // corner brand + metric label
    ctx.textAlign = "left";
    ctx.font = "700 11px 'Inter',system-ui,sans-serif";
    ctx.fillStyle = hexA(tokens.white, 1);
    ctx.fillText("VANTA", geo.padX * 0.55, H * 0.1);
    ctx.font = "600 10px 'Inter',system-ui,sans-serif";
    ctx.fillStyle = hexA(tokens.white, 0.92);
    ctx.fillText("Vues du blogue · 2026", geo.padX * 0.55, H * 0.1 + 14);

    ctx.textAlign = "right";
    ctx.font = "500 10px 'Inter',system-ui,sans-serif";
    ctx.fillStyle = hexA(tokens.white, 0.7);
    ctx.fillText("illustratif", W - geo.padX * 0.55, H * 0.1);
  }

  // total advance of a tabular string (digits = fixed slot, others natural).
  // Caller must have set ctx.font to recordValFont() first.
  function measureTabular(str) {
    let total = 0;
    for (let k = 0; k < str.length; k++) {
      const ch = str[k];
      total += (ch >= "0" && ch <= "9") ? recordValW : ctx.measureText(ch).width;
    }
    return total;
  }

  // fixed-advance digits so the count-up never jitters horizontally
  function drawTabularValue(cx, y, str) {
    ctx.font = recordValFont();
    ctx.textBaseline = "alphabetic";
    // measure layout: each glyph occupies a slot; digits use recordValW, others natural
    const total = measureTabular(str);
    let x = cx - total / 2;
    ctx.textAlign = "center";
    for (let k = 0; k < str.length; k++) {
      const ch = str[k];
      const slot = (ch >= "0" && ch <= "9")
        ? recordValW : ctx.measureText(ch).width;
      ctx.fillText(ch, x + slot / 2, y);
      x += slot;
    }
  }

  // ---- grain (gentle additive; vignette moved to composite pass) ----
  function paintGrain() {
    if (!grainCanvas) return;
    const pat = ctx.createPattern(grainCanvas, "repeat");
    if (!pat) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.55; // gentler so it survives bloom without muddying
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ---- the hand-rolled composite pass (bloom + barrel + chromatic aberration) ----
  // chromatic aberration strength, in device px, driven by record bar velocity.
  let caStrength = 0;
  function composite() {
    const pw = canvas.width, ph = canvas.height;

    if (!COMPOSITE) {
      // cheap path: blit scene straight + vignette
      view.setTransform(1, 0, 0, 1, 0, 0);
      view.globalCompositeOperation = "source-over";
      view.globalAlpha = 1;
      view.drawImage(scene, 0, 0);
      applyVignette();
      return;
    }

    // 1) base blit, with velocity-coupled chromatic aberration on the record strike.
    // We offset the R and B channel copies a few device-px horizontally.
    const ca = caStrength; // device px
    view.setTransform(1, 0, 0, 1, 0, 0);
    view.globalCompositeOperation = "source-over";
    view.globalAlpha = 1;
    if (ca < 0.4) {
      view.drawImage(scene, 0, 0);
    } else {
      // green/base center
      view.drawImage(scene, 0, 0);
      // tear red to the left, cyan(blue+green) to the right using 'screen' splits.
      // Cheap approximation: draw the scene shifted with channel-tinting via
      // composite. We isolate channels by multiplying then screening.
      drawChannel(view, scene, -ca, 0, "#ff0000"); // red shift left
      drawChannel(view, scene, ca, 0, "#00ffff");   // cyan shift right
    }

    // 2) bright-pass bloom: downsample to half-res, threshold luma, blur, add back.
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = "source-over";
    bctx.globalAlpha = 1;
    bctx.clearRect(0, 0, bloomC.width, bloomC.height);
    // downsample
    bctx.drawImage(scene, 0, 0, bloomC.width, bloomC.height);
    // threshold: keep only bright lilac/white. Multiply by a hi-contrast curve
    // by drawing a near-black 'multiply' won't threshold; instead darken mids
    // with 'source-in' against a luma mask is costly — use a pragmatic darken:
    // overlay a void wash via 'multiply' twice to crush mids, leaving highlights.
    bctx.globalCompositeOperation = "multiply";
    bctx.fillStyle = "#3a3a3a"; // crush ~ keeps only the brightest
    bctx.fillRect(0, 0, bloomC.width, bloomC.height);
    bctx.fillStyle = "#6a6a6a";
    bctx.fillRect(0, 0, bloomC.width, bloomC.height);
    bctx.globalCompositeOperation = "source-over";

    // blur the bright-pass (two passes if filter available)
    if (FILTER_OK) {
      const tmp = blurScratch();
      tmp.ctx.setTransform(1, 0, 0, 1, 0, 0);
      tmp.ctx.clearRect(0, 0, tmp.c.width, tmp.c.height);
      tmp.ctx.filter = "blur(3px)";
      tmp.ctx.drawImage(bloomC, 0, 0);
      tmp.ctx.filter = "blur(6px)";
      tmp.ctx.drawImage(tmp.c, 0, 0);
      tmp.ctx.filter = "none";
      // add bloom back (upsampled) over the view — true additive
      view.globalCompositeOperation = "lighter";
      view.globalAlpha = 0.85;
      view.drawImage(tmp.c, 0, 0, pw, ph);
      view.globalAlpha = 1;
      view.globalCompositeOperation = "source-over";
    } else {
      // no filter: still add a softened bright-pass (the half-res upscale blurs it)
      view.globalCompositeOperation = "lighter";
      view.globalAlpha = 0.55;
      view.drawImage(bloomC, 0, 0, pw, ph);
      view.globalAlpha = 1;
      view.globalCompositeOperation = "source-over";
    }

    // 3) subtle barrel: a faint radial magnified vignette ring (approximation)
    applyBarrelRing();

    // 4) vignette (final crush toward void)
    applyVignette();
  }

  // scratch canvas for the second blur (built once)
  let scratchC = null, scratchCtx = null;
  function blurScratch() {
    if (!scratchC || scratchC.width !== bloomC.width || scratchC.height !== bloomC.height) {
      scratchC = document.createElement("canvas");
      scratchC.width = bloomC.width;
      scratchC.height = bloomC.height;
      scratchCtx = scratchC.getContext("2d");
    }
    return { c: scratchC, ctx: scratchCtx };
  }

  // draw a single tinted channel copy of the scene, shifted dx/dy device-px.
  // We tint by multiplying the scene against a channel color on a temp, then
  // screen it onto the view. To avoid per-frame alloc we reuse one channel canvas.
  let chanC = null, chanCtx = null;
  function drawChannel(target, src, dx, dy, tint) {
    if (!chanC || chanC.width !== src.width || chanC.height !== src.height) {
      chanC = document.createElement("canvas");
      chanC.width = src.width; chanC.height = src.height;
      chanCtx = chanC.getContext("2d");
    }
    chanCtx.setTransform(1, 0, 0, 1, 0, 0);
    chanCtx.globalCompositeOperation = "source-over";
    chanCtx.globalAlpha = 1;
    chanCtx.clearRect(0, 0, chanC.width, chanC.height);
    chanCtx.drawImage(src, 0, 0);
    chanCtx.globalCompositeOperation = "multiply";
    chanCtx.fillStyle = tint;
    chanCtx.fillRect(0, 0, chanC.width, chanC.height);
    chanCtx.globalCompositeOperation = "source-over";
    // screen the shifted channel onto the view (additive-ish for the tear)
    target.globalCompositeOperation = "lighter";
    target.globalAlpha = 0.5;
    target.drawImage(chanC, dx, dy);
    target.globalAlpha = 1;
    target.globalCompositeOperation = "source-over";
  }

  // faint barrel approximation: a soft magnified bright ring near the frame edge
  let barrelGrad = null, barrelKey = "";
  function applyBarrelRing() {
    const pw = canvas.width, ph = canvas.height;
    const key = pw + "x" + ph;
    if (barrelKey !== key) {
      barrelGrad = view.createRadialGradient(
        pw * 0.5, ph * 0.5, Math.min(pw, ph) * 0.32,
        pw * 0.5, ph * 0.5, Math.max(pw, ph) * 0.62);
      barrelGrad.addColorStop(0, hexA(tokens.royal, 0));
      barrelGrad.addColorStop(0.82, hexA(tokens.deep, 0.05));
      barrelGrad.addColorStop(1, hexA(tokens.royal, 0));
      barrelKey = key;
    }
    view.save();
    view.globalCompositeOperation = "lighter";
    view.fillStyle = barrelGrad;
    view.fillRect(0, 0, pw, ph);
    view.restore();
  }

  let vignetteGrad = null, vignetteKey = "";
  function applyVignette() {
    const pw = canvas.width, ph = canvas.height;
    const key = pw + "x" + ph;
    if (vignetteKey !== key) {
      vignetteGrad = view.createRadialGradient(
        pw * 0.5, ph * 0.42, Math.min(pw, ph) * 0.2,
        pw * 0.5, ph * 0.5, Math.max(pw, ph) * 0.75);
      vignetteGrad.addColorStop(0, hexA(tokens.void, 0));
      vignetteGrad.addColorStop(1, hexA(tokens.void, 0.72));
      vignetteKey = key;
    }
    view.save();
    view.globalCompositeOperation = "source-over";
    view.fillStyle = vignetteGrad;
    view.fillRect(0, 0, pw, ph);
    view.restore();
  }

  // ---- static frame (reduced motion) ----
  function drawStatic() {
    for (let i = 0; i < N; i++) {
      liveH[i] = barTargetH(i);
      dispVal[i] = RAW[i];
      hoverGlow[i] = 0;
    }
    recordPhase.v = 1;
    recordPhase.vel = 0;
    recordPhase.antic = 0;
    crownPop = 1;
    crownThrow = 0;
    starBorn = true;
    starT = 1;
    flareT = 0;
    flareFired = false;
    landFlash = 0;
    valueLocked = true;
    caStrength = 0;
    sweepPhase = 0.5;
    paraX = 0; paraY = 0;
    fallback.style.opacity = "0";
    paintScene();
    composite();
  }

  // ---- main loop ----
  let raf = 0;
  let last = 0;
  let running = false;
  let revealForced = false;

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(50, now - (last || now));
    last = now;

    if (reducedMotion) return;

    const elapsed = now - startT;

    // smooth pointer parallax (-1..1), eased toward target each frame
    let tpx = 0, tpy = 0;
    if (pointer.inside) {
      tpx = clamp((pointer.x / W - 0.5) * 2, -1, 1);
      tpy = clamp((pointer.y / H - 0.5) * 2, -1, 1);
    }
    paraX += (tpx - paraX) * 0.06;
    paraY += (tpy - paraY) * 0.06;

    // --- entrance springs (supporting bars) ---
    if (phase === "reveal") {
      let allSettled = true;
      for (let i = 0; i < N; i++) {
        if (i === RECORD) {
          // record's HEIGHT factor rises with the crowd; its over-reach + the
          // strike are handled by the act-machine below (recordPhase).
          const localT = clamp((elapsed / REVEAL_MS - tStart[i]), 0, 1.6);
          const s = springOvershoot(clamp(localT, 0, 1));
          liveH[i] = barTargetH(i) * s;
          continue;
        }
        const localT = clamp((elapsed / REVEAL_MS - tStart[i]), 0, 1.6);
        if (localT < 1.05) allSettled = false;
        const s = springOvershoot(clamp(localT, 0, 1));
        liveH[i] = barTargetH(i) * s;
        dispVal[i] = RAW[i] * easeOutExpo(clamp(localT, 0, 1));
      }

      // ---- the strike act-machine (anticipation -> strike -> settle) ----
      if (elapsed >= RECORD_DELAY) {
        if (!recordFired) {
          recordFired = true;
          recordStartT = startT + RECORD_DELAY;
        }
        const rt = now - recordStartT; // ms into the strike sequence
        updateStrike(rt);
      } else {
        // before the strike, keep record value counting toward (but not reaching)
        // its final — final digit is reserved to land on the apex.
        dispVal[RECORD] = RAW[RECORD] * 0.86 *
          easeOutCubic(clamp(elapsed / RECORD_DELAY, 0, 1));
      }

      if (allSettled && elapsed >= RECORD_DELAY + RECORD_MS) {
        phase = "idle";
      }
    } else {
      // idle: hold settled heights; record breathes very gently
      for (let i = 0; i < N; i++) {
        if (i === RECORD) continue;
        liveH[i] += (barTargetH(i) - liveH[i]) * 0.12;
        dispVal[i] += (RAW[i] - dispVal[i]) * 0.18;
      }
      // record settles to its full over-reach, value locked
      recordPhase.v += (1 - recordPhase.v) * 0.1;
      recordPhase.antic *= 0.85;
      recordPhase.vel *= 0.8;
      liveH[RECORD] += (barTargetH(RECORD) - liveH[RECORD]) * 0.12;
      dispVal[RECORD] = RAW[RECORD];
      crownPop = 1;
      crownThrow *= 0.88;
      starT += (1 - starT) * 0.2;
      caStrength *= 0.7;
      landFlash *= 0.9;
    }

    // advance the magenta flare once it starts (single, decaying)
    if (flareT > 0 && flareT < 1) {
      flareT = Math.min(1, flareT + dt / 640);
    }
    // landing flash decay (white -> lilac over ~200ms after lock)
    if (valueLocked && landFlash > 0) {
      landFlash = Math.max(0, landFlash - dt / 220);
    }

    // hover state
    hoveredBar = pickBar();
    for (let i = 0; i < N; i++) {
      const target = i === hoveredBar ? 1 : 0;
      hoverGlow[i] += (target - hoverGlow[i]) * 0.22;
    }
    updateTooltip();

    // ambient sweep — paused during the anticipation beat
    if (!sweepPaused) {
      sweepPhase += dt / 4200;
      if (sweepPhase > 1.35) sweepPhase = -0.15;
    }

    // chromatic aberration relaxes each frame; the strike spikes it (in updateStrike)
    caStrength *= 0.82;
    // tiny idle CA from pointer parallax (near-zero), keeps edges alive on motion
    caStrength = Math.max(caStrength, Math.abs(paraX) * 0.6 * DPR);

    paintScene();
    composite();
  }

  // The act-machine: rt = ms since the strike sequence began.
  function updateStrike(rt) {
    if (rt < ANTIC_MS) {
      // ACT 1 — anticipation: pre-compress ~6%, dim reflection, pause sweep
      const a = easeInOutCubic(clamp(rt / ANTIC_MS, 0, 1));
      recordPhase.antic = a;
      recordPhase.v = 0; // not yet over-reaching
      recordPhase.vel = 0;
      sweepPaused = true;
      // value holds — final digit reserved for apex
      dispVal[RECORD] = RAW[RECORD] * 0.86;
      crownPop = 0;
      return;
    }

    const st = rt - ANTIC_MS;
    if (st <= STRIKE_MS + SETTLE_MS) {
      // ACT 2 + 3 share one harder under-damped spring; apex inside ACT 2.
      const total = STRIKE_MS + SETTLE_MS;
      const t = clamp(st / total, 0, 1);
      // release the anticipation as the strike fires
      recordPhase.antic *= 0.78;
      const s = springOvershoot(t, REC_W, REC_Z);
      recordPhase.v = s;
      // instantaneous velocity (normalized) for CA spike + apex detection
      const vel = springVel(t, REC_W, REC_Z);
      recordPhase.vel = vel;

      // apex = first peak; detect by velocity crossing from + to ~0 near APEX_FRAC
      const apexT = APEX_FRAC * (STRIKE_MS / total); // apex position in normalized t
      const nearApex = Math.abs(t - apexT) < 0.05;

      // chromatic aberration spikes with |velocity| (device px), only on strike
      caStrength = Math.max(caStrength,
        clamp(Math.abs(vel) * 0.9, 0, 6) * DPR);

      // crown thrown up ON the apex, with its own micro-overshoot
      const apexReached = t >= apexT;
      if (apexReached) {
        // crownPop drives the chevron rise; crownThrow gives the micro-overshoot
        const cp = clamp((t - apexT) / (1 - apexT) * 2.2, 0, 1);
        crownPop = Math.max(crownPop, cp);
        // micro-overshoot of the thrown chevron (recomputed each frame, no accumulation)
        crownThrow = clamp(easeOutBack(clamp((t - apexT) / 0.18, 0, 1)) - 1, 0, 1);
      } else {
        crownPop = 0;
      }

      // diffraction star lands once, exactly at apex (instant, then steady)
      if (!starBorn && apexReached) {
        starBorn = true;
        starT = 1; // pops in, not fade
      }

      // count-up lands its FINAL digit on the apex frame
      if (!valueLocked) {
        if (apexReached) {
          dispVal[RECORD] = RAW[RECORD];
          valueLocked = true;
          landFlash = 1; // begin white->lilac landing flash
        } else {
          // ramp the remaining 14% across ACT 2 up to the apex
          const k = clamp(t / apexT, 0, 1);
          dispVal[RECORD] = RAW[RECORD] * (0.86 + 0.14 * easeOutCubic(k));
        }
      }

      // the single magenta flare fires once on the FIRST downbeat (just past apex)
      if (!flareFired && t > apexT + (STRIKE_MS / total) * 0.35) {
        flareFired = true;
        flareT = 0.0001;
      }

      // resume the sweep after the strike settles past mid-act-3
      if (t > apexT + 0.35) sweepPaused = false;
    } else {
      // strike fully done — hand off to idle settle
      recordPhase.v = 1;
      recordPhase.antic = 0;
      crownPop = 1;
      sweepPaused = false;
      if (!valueLocked) {
        dispVal[RECORD] = RAW[RECORD];
        valueLocked = true;
        landFlash = 1;
      }
      if (!starBorn) { starBorn = true; starT = 1; }
    }
  }

  function updateTooltip() {
    if (hoveredBar < 0 || coarse) {
      tip.style.opacity = "0";
      tip.style.transform = "translate(-50%,-118%) scale(.92)";
      return;
    }
    const i = hoveredBar;
    const x = barX(i) + geo.barW / 2 + paraX * 4;
    const yTop = barTopY(i, liveH[i]);
    tip.style.left = x + "px";
    tip.style.top = (yTop - 8) + "px";
    tip.style.opacity = "1";
    tip.style.transform = "translate(-50%,-118%) scale(1)";
    const monthFull = MONTH_NAMES[i];
    const v = formatFR(Math.round(dispVal[i] > 1 ? RAW[i] : dispVal[i]));
    tip.innerHTML =
      '<div style="font:700 13px Inter,system-ui,sans-serif;color:#FFFFFF' +
      ';letter-spacing:.2px">' + v + ' vues</div>' +
      '<div style="font:500 10px Inter,system-ui,sans-serif;color:' +
      hexA(tokens.lilacHi, 0.95) + ';margin-top:1px">' + monthFull +
      (i === RECORD ? ' · record' : '') + '</div>';
  }

  // ---- API handle ----
  const api = {
    replay() {
      fallback.style.opacity = "0";
      if (reducedMotion) {
        drawStatic();
        return;
      }
      resetTimeline();
      last = 0;
      if (!running) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    },
    pause() {
      if (!running) return;
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    resume() {
      if (running || reducedMotion) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    setReducedMotion(v) {
      reducedMotion = !!v;
      if (reducedMotion) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        running = false;
        tip.style.opacity = "0";
        drawStatic();
      } else {
        api.replay();
      }
    },
    destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (failsafe) clearTimeout(failsafe);
      try { ro && ro.disconnect(); } catch (e) {}
      root.removeEventListener("mousemove", onMove);
      root.removeEventListener("mouseleave", onLeave);
      root.removeEventListener("click", onClick);
      if (mqReduce) {
        try { mqReduce.removeEventListener("change", onReduceChange); }
        catch (e) { try { mqReduce.removeListener(onReduceChange); } catch (e2) {} }
      }
      // free big refs
      grainCanvas = null;
      barUnionPath = null;
      scratchC = null; scratchCtx = null;
      chanC = null; chanCtx = null;
      ctx = null; bctx = null; view = null;
      if (root.parentNode) root.parentNode.removeChild(root);
    },
  };

  // ---- reduced-motion live changes ----
  function onReduceChange(e) {
    if (!opts.reducedMotion) api.setReducedMotion(e.matches);
  }
  if (mqReduce) {
    try { mqReduce.addEventListener("change", onReduceChange); }
    catch (e) { try { mqReduce.addListener(onReduceChange); } catch (e2) {} }
  }

  // ---- listeners ----
  root.addEventListener("mousemove", onMove);
  root.addEventListener("mouseleave", onLeave);
  root.addEventListener("click", onClick);

  // ---- ResizeObserver ----
  let ro = null;
  try {
    ro = new ResizeObserver(() => resize());
    ro.observe(container);
  } catch (e) {
    window.addEventListener("resize", resize);
  }

  // ---- reveal failsafe: never stay invisible ----
  let failsafe = setTimeout(() => {
    if (!revealForced && phase === "reveal" && !reducedMotion) {
      revealForced = true;
      for (let i = 0; i < N; i++) {
        liveH[i] = barTargetH(i);
        dispVal[i] = RAW[i];
      }
      recordPhase.v = 1;
      recordPhase.antic = 0;
      crownPop = 1;
      starBorn = true; starT = 1;
      valueLocked = true;
      if (!running) { paintScene(); composite(); }
    }
  }, 3500);

  // ---- boot ----
  resize();
  if (reducedMotion) {
    drawStatic();
  } else {
    api.replay();
  }

  // ---- small color utils ----
  function hexA(hex, a) {
    const { r, g, b } = parseHex(hex);
    return "rgba(" + r + "," + g + "," + b + "," + clamp(a, 0, 1) + ")";
  }
  function parseHex(hex) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function mixHex(a, b, t) {
    const A = parseHex(a), B = parseHex(b);
    const r = Math.round(lerp(A.r, B.r, t));
    const g = Math.round(lerp(A.g, B.g, t));
    const bl = Math.round(lerp(A.b, B.b, t));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  function formatFR(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  return api;
}
