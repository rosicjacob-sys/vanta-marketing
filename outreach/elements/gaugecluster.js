/*
 * #17 — Gauge Cluster · Lineage: The Instrument
 * A bank of analog gauges that boot like a dashboard ignition: on power-on every
 * needle slams from its rest peg to full-scale and settles back with a spring
 * overshoot, in one synchronized sweep (the screenshot moment). One gauge — the
 * "Citations IA" tach — redlines into a hot-magenta arc. Gauges are labelled with
 * French (Québec) restaurant metrics; live needles breathe with eased noise.
 *
 * Deps: none (pure Canvas2D; additive glow via 'lighter'; spring physics in JS).
 * Perf: DPR capped to [1,2]; static dial chrome (bezel, ticks, numerals, labels)
 * is pre-rendered ONCE to an offscreen buffer and blitted each frame, so the hot
 * loop only redraws needles + glow + grain — no per-frame text/arc layout, zero
 * per-frame allocation in the loop. Grain tile is a small cached pattern. Coarse-
 * pointer / tiny cells drop grain + scanlines and use a lighter glow. Single rAF;
 * fully torn down on destroy (buffers freed, listeners removed).
 */

const ROYAL = {
  void: "#07060D",
  ink: "#150E2A",
  royal: "#7C3AED",
  deep: "#4C1D95",
  lilac: "#A855F7",
  lilacHi: "#C4B5FD",
  white: "#F6F3FE",
  flare: "#E8409B", // used exactly once: the redline arc + needle
};

// ---- bespoke easing ----
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
// damped spring used for the settle: amplitude decays, oscillates around target
const settle = (t, freq, decay) =>
  t >= 1 ? 1 : 1 - Math.pow(2, -decay * t) * Math.cos(freq * t);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

export const meta = {
  id: 17,
  slug: "gauge-cluster",
  title: "Gauge Cluster",
  lineage: "The Instrument",
  signature: "A synchronized power-on needle sweep across all gauges, one redlining magenta.",
  interaction: "Click anywhere to re-run the ignition sweep; hover spins the needles a touch.",
  deps: [],
};

export function mount(container, opts = {}) {
  const tokens = { ...ROYAL, ...(opts.tokens || {}) };

  // ---- reduced motion ----
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
    "cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:manipulation;";
  container.appendChild(root);

  // Static gradient fallback (also the no-2D safety net).
  const fallback = document.createElement("div");
  fallback.style.cssText =
    "position:absolute;inset:0;opacity:0;transition:opacity .4s ease;pointer-events:none;" +
    "background:radial-gradient(120% 90% at 50% 42%," +
    tokens.deep +
    "33 0%," +
    tokens.void +
    " 62%),linear-gradient(180deg," +
    tokens.ink +
    " 0%," +
    tokens.void +
    " 100%);";
  root.appendChild(fallback);

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;";
  root.appendChild(canvas);

  let ctx = null;
  try {
    ctx = canvas.getContext("2d", { alpha: false });
  } catch (e) {
    ctx = null;
  }
  if (!ctx) {
    fallback.style.opacity = "1";
    return staticHandle();
  }

  // Offscreen: pre-rendered static dial chrome (rebuilt only on resize).
  const dial = document.createElement("canvas");
  const dctx = dial.getContext("2d", { alpha: true });
  // Grain tile.
  const grain = document.createElement("canvas");
  const gctx = grain.getContext("2d", { alpha: true });

  // ---- sizing ----
  let W = 0, H = 0, DPR = 1;

  // ---- gauge model ----
  // Sweep dial geometry: needles travel a 270° arc from lower-left to lower-right.
  const A_START = Math.PI * 0.75;   // 135deg  (lower-left)
  const A_SWEEP = Math.PI * 1.5;    // 270deg total travel
  const A_END = A_START + A_SWEEP;

  // Each gauge: French restaurant metric. value 0..1 is the resting needle pos.
  // redline gauges carry the magenta hot zone (only ONE is true → the one flare).
  const GAUGES = [
    { label: "VUES DU BLOGUE", unit: "vues", max: 2000, val: 1213, redline: false, big: true },
    { label: "CLICS GOOGLE", unit: "clics", max: 300, val: 176, redline: false, big: false },
    { label: "CITATIONS IA", unit: "cit.", max: 16, val: 13, redline: true, big: false },
    { label: "RÉSERVATIONS", unit: "rés.", max: 120, val: 74, redline: false, big: false },
    { label: "APPELS", unit: "appels", max: 90, val: 41, redline: false, big: false },
    { label: "ITINÉRAIRES", unit: "itin.", max: 60, val: 33, redline: false, big: false },
  ];

  // per-gauge runtime state
  const G = GAUGES.map((g) => ({
    ...g,
    target: clamp(g.val / g.max, 0, 1),  // normalized rest position 0..1
    angle: A_START,                        // current needle angle (rad)
    idlePhase: Math.random() * 6.283,      // for ambient breathing
    idleSpeed: 0.4 + Math.random() * 0.4,
    // layout (filled in resize)
    cx: 0, cy: 0, r: 0, ring: 0,
  }));

  // layout grid: positions computed on resize
  let cols = 3, rows = 2;

  // ---- entrance / sweep choreography ----
  // Phase A (0..tFull): all needles drive START -> END (full scale).
  // Phase B (tFull..1): needles settle from END -> rest target with spring.
  const SWEEP_MS = 1500;
  const T_FULL = 0.42; // fraction of timeline spent reaching full-scale
  let sweepStart = 0;
  let sweeping = false;
  let revealed = false;

  // chrome reveal (labels/readouts fade after the sweep gets going)
  let chromeStart = 0;
  const CHROME_MS = 700;

  // redline alert flash latches once when the tach passes its redline on settle
  let redlineFired = false;
  let redlineFlash = 0; // 0..1 decaying

  // count-up readouts driven off the needle position
  // (so the number ticks up exactly with the needle — tactile)

  // ---- interaction ----
  let hover = 0, hoverTarget = 0;
  let pointerX = -1, pointerY = -1;
  let pointerInside = false;

  let raf = 0;
  let running = false;
  let destroyed = false;
  let lastT = 0;

  function readSize() {
    const r = container.getBoundingClientRect();
    return {
      w: Math.max(1, Math.round(r.width)),
      h: Math.max(1, Math.round(r.height)),
    };
  }

  function resize() {
    const { w, h } = readSize();
    DPR = clamp(window.devicePixelRatio || 1, 1, 2);
    W = w;
    H = h;
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    dial.width = canvas.width;
    dial.height = canvas.height;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    layout();
    buildGrain();
    buildDial();
  }

  // arrange gauges in a responsive grid; the first ("big") gauge anchors the eye
  function layout() {
    // choose grid by aspect / width
    const aspect = W / H;
    let n = G.length;
    if (W < 360 || aspect < 0.85) {
      cols = 2;
    } else if (aspect > 2.2) {
      cols = 6;
    } else {
      cols = 3;
    }
    rows = Math.ceil(n / cols);

    const padX = Math.max(10, W * 0.04);
    const padY = Math.max(10, H * 0.06);
    const gridW = W - padX * 2;
    const gridH = H - padY * 2;
    const cellW = gridW / cols;
    const cellH = gridH / rows;

    // radius leaves room for label below + tick ring
    const labelRoom = Math.min(34, cellH * 0.26);
    const baseR = Math.max(
      14,
      Math.min(cellW * 0.42, (cellH - labelRoom) * 0.5)
    );

    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const rr = Math.floor(i / cols);
      const cxp = padX + cellW * (c + 0.5);
      const cyp = padY + cellH * (rr + 0.5) - labelRoom * 0.34;
      G[i].cx = cxp;
      G[i].cy = cyp;
      G[i].r = G[i].big && cols >= 3 ? baseR * 1.04 : baseR;
      G[i].ring = G[i].r * 0.86; // needle/scale radius inside bezel
      G[i].labelRoom = labelRoom;
    }
  }

  // ---- procedural film grain tile ----
  function buildGrain() {
    const gs = 110;
    grain.width = gs;
    grain.height = gs;
    const img = gctx.createImageData(gs, gs);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 11;
    }
    gctx.putImageData(img, 0, 0);
  }

  // ---- pre-render the static dial chrome once per size ----
  function buildDial() {
    dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dctx.clearRect(0, 0, W, H);

    // ambient panel wash behind the whole cluster
    const pg = dctx.createRadialGradient(
      W * 0.5, H * 0.42, 0,
      W * 0.5, H * 0.42, Math.max(W, H) * 0.7
    );
    pg.addColorStop(0, hexA(tokens.deep, 0.16));
    pg.addColorStop(0.5, hexA(tokens.ink, 0.5));
    pg.addColorStop(1, hexA(tokens.void, 0));
    dctx.fillStyle = pg;
    dctx.fillRect(0, 0, W, H);

    for (let i = 0; i < G.length; i++) drawDialFace(dctx, G[i]);

    // wordmark / title chrome baked into the static layer (calm)
    dctx.font = "700 11px 'Inter',system-ui,sans-serif";
    dctx.textBaseline = "alphabetic";
    dctx.fillStyle = hexA(tokens.white, 0.92);
    dctx.fillText("VANTA · TABLEAU DE BORD", Math.max(10, W * 0.04), Math.max(16, H * 0.05));
  }

  // one gauge's static face: bezel, ink dial, tick ring, numerals, redline zone, label
  function drawDialFace(c, g) {
    const { cx, cy, r, ring } = g;
    const small = r < 34;

    // outer bezel ring (deep violet metal)
    c.save();
    const bz = c.createRadialGradient(cx, cy - r * 0.4, r * 0.2, cx, cy, r * 1.04);
    bz.addColorStop(0, hexA(tokens.deep, 0.0));
    bz.addColorStop(0.82, hexA(tokens.deep, 0.0));
    bz.addColorStop(0.86, hexA(tokens.royal, 0.42));
    bz.addColorStop(0.93, hexA(tokens.deep, 0.55));
    bz.addColorStop(1, hexA(tokens.void, 0.0));
    c.fillStyle = bz;
    c.beginPath();
    c.arc(cx, cy, r * 1.04, 0, Math.PI * 2);
    c.fill();

    // dial face (ink-violet, slightly domed via gradient)
    const face = c.createRadialGradient(
      cx, cy - r * 0.35, r * 0.1, cx, cy, r * 0.92
    );
    face.addColorStop(0, hexA(tokens.ink, 1));
    face.addColorStop(0.7, hexA("#0E0920", 1));
    face.addColorStop(1, hexA(tokens.void, 1));
    c.fillStyle = face;
    c.beginPath();
    c.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
    c.fill();

    // hairline inner rim
    c.lineWidth = 1;
    c.strokeStyle = hexA(tokens.deep, 0.6);
    c.beginPath();
    c.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
    c.stroke();

    // ---- scale arc (the track) ----
    c.lineWidth = Math.max(1.5, r * 0.045);
    c.lineCap = "round";
    c.strokeStyle = hexA(tokens.deep, 0.7);
    c.beginPath();
    c.arc(cx, cy, ring, A_START, A_END);
    c.stroke();

    // redline hot zone — drawn on the static face for the ONE redline gauge.
    if (g.redline) {
      const rlFrom = A_START + A_SWEEP * 0.78;
      c.strokeStyle = hexA(tokens.flare, 0.5);
      c.lineWidth = Math.max(1.5, r * 0.05);
      c.beginPath();
      c.arc(cx, cy, ring, rlFrom, A_END);
      c.stroke();
    }

    // ---- ticks ----
    const majors = 6;          // labelled major ticks (0..max)
    const minorsPer = 4;       // minor ticks between majors
    const total = majors * minorsPer;
    for (let t = 0; t <= total; t++) {
      const frac = t / total;
      const a = A_START + frac * A_SWEEP;
      const isMajor = t % minorsPer === 0;
      const inRed = g.redline && frac > 0.78;
      const tickLen = isMajor ? r * 0.16 : r * 0.085;
      const r0 = ring - tickLen;
      const r1 = ring;
      const ca = Math.cos(a), sa = Math.sin(a);
      c.lineWidth = isMajor ? Math.max(1.4, r * 0.03) : Math.max(0.8, r * 0.016);
      c.strokeStyle = inRed
        ? hexA(tokens.flare, isMajor ? 0.9 : 0.55)
        : isMajor
        ? hexA(tokens.lilacHi, 0.85)
        : hexA(tokens.lilac, 0.4);
      c.beginPath();
      c.moveTo(cx + ca * r0, cy + sa * r0);
      c.lineTo(cx + ca * r1, cy + sa * r1);
      c.stroke();

      // numerals on majors (skip on very small dials)
      if (isMajor && !small) {
        const numR = ring - r * 0.32;
        const nx = cx + ca * numR;
        const ny = cy + sa * numR;
        const value = Math.round((g.max * frac) / (g.max >= 1000 ? 100 : 1)) *
          (g.max >= 1000 ? 100 : 1);
        c.font = "600 " + Math.round(r * 0.15) + "px 'Inter',system-ui,sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillStyle = inRed ? hexA(tokens.flare, 0.9) : hexA(tokens.lilacHi, 0.78);
        c.fillText(shortNum(value), nx, ny);
      }
    }
    c.textAlign = "left";
    c.textBaseline = "alphabetic";

    // center hub plate (static base; live cap drawn in loop)
    const hub = c.createRadialGradient(cx, cy, 0, cx, cy, r * 0.2);
    hub.addColorStop(0, hexA(tokens.deep, 0.9));
    hub.addColorStop(1, hexA(tokens.void, 0.0));
    c.fillStyle = hub;
    c.beginPath();
    c.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
    c.fill();

    // ---- label below dial ----
    const ly = cy + r * 0.9 + Math.min(15, g.labelRoom * 0.5);
    c.textAlign = "center";
    c.font = "700 " + Math.round(clamp(r * 0.16, 8, 11)) + "px 'Inter',system-ui,sans-serif";
    c.fillStyle = hexA(tokens.white, 0.9);
    c.fillText(g.label, cx, ly);
    c.textAlign = "left";

    c.restore();
  }

  // ---- compute needle angle for a gauge at sweep progress p (0..1) ----
  // returns angle in radians and the "displayed value fraction" 0..1
  function needleAngle(g, p) {
    if (p >= 1) {
      // settled: rest target + ambient breathing
      return { a: A_START + g.restFrac() * A_SWEEP, frac: g.restFrac() };
    }
    let frac;
    if (p < T_FULL) {
      // drive to full scale, snappy
      const k = easeOutCubic(p / T_FULL);
      frac = k; // 0 -> 1 (full scale)
    } else {
      // settle from full-scale (1) to rest target with spring overshoot
      const q = (p - T_FULL) / (1 - T_FULL); // 0..1
      const rest = g.target;
      // spring goes from 1 (current) toward rest; settle() returns 0..~1 with
      // overshoot — map it so frac starts at 1, ends at rest, overshoots past rest.
      const s = settle(q, 11.5, 5.0); // 0 at q0 -> ~1 at q1, oscillating
      frac = lerp(1, rest, s);
    }
    return { a: A_START + clamp(frac, -0.04, 1.08) * A_SWEEP, frac };
  }

  // rest fraction incl. ambient idle breathing
  function makeRestFrac(g) {
    return function () {
      if (reducedMotion) return g.target;
      const breathe =
        Math.sin(g.idlePhase) * 0.006 +
        Math.sin(g.idlePhase * 2.3 + 1.1) * 0.0035;
      const hoverKick = hover * 0.018 * (g.redline ? 1.6 : 1);
      return clamp(g.target + breathe + hoverKick, 0, 1.02);
    };
  }
  for (const g of G) g.restFrac = makeRestFrac(g);

  // ---- draw a live needle + hub cap + count-up readout ----
  function drawNeedle(g, frac, alpha) {
    const { cx, cy, r, ring } = g;
    const a = A_START + frac * A_SWEEP;
    const ca = Math.cos(a), sa = Math.sin(a);
    const isRed = g.redline;
    // does the needle sit in the redline zone?
    const inRed = isRed && frac > 0.78;
    const col = inRed ? tokens.flare : tokens.royal;
    const tip = inRed ? tokens.flare : tokens.lilacHi;

    const len = ring * 0.92;
    const tail = r * 0.16;
    const tx = cx + ca * len, ty = cy + sa * len;
    const bx = cx - ca * tail, by = cy - sa * tail;
    // perpendicular for the needle body width
    const px = -sa, py = ca;
    const bw = Math.max(1.4, r * 0.05); // base half-width

    ctx.save();

    // additive glow trail under the needle
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * (coarse ? 0.5 : 0.85);
    ctx.lineCap = "round";
    ctx.strokeStyle = hexA(inRed ? tokens.flare : tokens.royal, 0.22);
    ctx.lineWidth = bw * 2.6;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha;

    // tapered needle body (poly: wide base -> sharp tip)
    const grad = ctx.createLinearGradient(bx, by, tx, ty);
    grad.addColorStop(0, hexA(col, 0.65));
    grad.addColorStop(0.7, hexA(col, 1));
    grad.addColorStop(1, hexA(tip, 1));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(bx + px * bw * 0.7, by + py * bw * 0.7);
    ctx.lineTo(bx - px * bw * 0.7, by - py * bw * 0.7);
    ctx.lineTo(cx - px * bw, cy - py * bw);   // widest just past hub
    ctx.lineTo(tx, ty);                         // tip
    ctx.lineTo(cx + px * bw, cy + py * bw);
    ctx.closePath();
    ctx.fill();

    // bright tip spark
    ctx.globalCompositeOperation = "lighter";
    const sg = ctx.createRadialGradient(tx, ty, 0, tx, ty, r * 0.12);
    sg.addColorStop(0, hexA(tokens.white, alpha));
    sg.addColorStop(0.4, hexA(tip, alpha * 0.8));
    sg.addColorStop(1, hexA(tip, 0));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(tx, ty, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // hub cap (metallic disc over needle base)
    const hubR = Math.max(2.5, r * 0.12);
    const hg = ctx.createRadialGradient(
      cx - hubR * 0.3, cy - hubR * 0.3, 0, cx, cy, hubR
    );
    hg.addColorStop(0, hexA(tokens.lilacHi, alpha));
    hg.addColorStop(0.5, hexA(tokens.royal, alpha));
    hg.addColorStop(1, hexA(tokens.deep, alpha));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hexA(tokens.void, alpha * 0.7);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();

    // ---- count-up digital readout under the needle (ticks with the needle) ----
    if (!g.small && alpha > 0.05) {
      const shown = Math.round(clamp(frac, 0, 1) * g.max);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";
      ctx.font = "700 " + Math.round(clamp(r * 0.2, 9, 15)) + "px 'Inter',system-ui,sans-serif";
      ctx.fillStyle = inRed ? hexA(tokens.flare, 1) : hexA(tokens.white, 0.96);
      ctx.fillText(formatFr(shown), cx, cy + r * 0.5);
      ctx.font = "600 " + Math.round(clamp(r * 0.12, 7, 9)) + "px 'Inter',system-ui,sans-serif";
      ctx.fillStyle = hexA(tokens.lilac, 0.7);
      ctx.fillText(g.unit, cx, cy + r * 0.66);
      ctx.textAlign = "left";
      ctx.restore();
    }
  }

  // small-flag for readout suppression on tiny dials
  function refreshSmallFlags() {
    for (const g of G) g.small = g.r < 26;
  }

  // ---- composite one frame ----
  function composite(p, chromeAlpha) {
    // void background
    ctx.fillStyle = tokens.void;
    ctx.fillRect(0, 0, W, H);

    // blit pre-rendered dial chrome (fade chrome/labels in with chromeAlpha,
    // but keep dial faces solid so the sweep reads against a real instrument)
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(dial, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.restore();

    // needles
    for (let i = 0; i < G.length; i++) {
      const g = G[i];
      const r = needleAngle(g, p);
      g.angle = r.a;
      drawNeedle(g, r.frac, 1);
    }

    // redline alert flash (decaying magenta bloom around the tach) — earned once
    if (redlineFlash > 0.001) {
      const g = G.find((x) => x.redline);
      if (g) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const fa = easeOutCubic(redlineFlash);
        const fg = ctx.createRadialGradient(g.cx, g.cy, g.r * 0.3, g.cx, g.cy, g.r * 1.5);
        fg.addColorStop(0, hexA(tokens.flare, 0.0));
        fg.addColorStop(0.6, hexA(tokens.flare, 0.18 * fa));
        fg.addColorStop(1, hexA(tokens.flare, 0));
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(g.cx, g.cy, g.r * 1.5, 0, Math.PI * 2);
        ctx.fill();
        // tiny "REDLINE" tag
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = fa;
        ctx.textAlign = "center";
        ctx.font = "700 9px 'Inter',system-ui,sans-serif";
        ctx.fillStyle = hexA(tokens.flare, 1);
        ctx.fillText("EN HAUSSE", g.cx, g.cy - g.r * 1.06);
        ctx.textAlign = "left";
        ctx.restore();
      }
    }

    // overall chrome fade-in mask on first reveal (subtle): we dim slightly until
    // chrome settles so the boot feels like instruments waking.
    if (chromeAlpha < 1) {
      ctx.save();
      ctx.fillStyle = hexA(tokens.void, (1 - chromeAlpha) * 0.35);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // film grain + vignette
    drawGrain();
    drawVignette();
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(
      W * 0.5, H * 0.46, Math.min(W, H) * 0.22,
      W * 0.5, H * 0.5, Math.max(W, H) * 0.72
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawGrain() {
    if (coarse || W * H < 60000) return;
    const pat = ctx.createPattern(grain, "repeat");
    if (!pat) return;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ---- static (reduced-motion) frame: settled needles, no autoplay ----
  function renderStatic() {
    refreshSmallFlags();
    // advance idle phase deterministically a touch for a composed look
    composite(1, 1);
  }

  // ---- main loop ----
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);

    const dt = Math.min(50, now - lastT);
    lastT = now;

    // ease hover charge
    hover += (hoverTarget - hover) * (1 - Math.pow(0.002, dt / 1000));

    // advance ambient idle phases
    if (!reducedMotion) {
      for (const g of G) g.idlePhase += dt * 0.001 * g.idleSpeed;
    }

    // sweep progress
    let p = 1;
    if (sweeping) {
      p = clamp((now - sweepStart) / SWEEP_MS, 0, 1);
      if (p >= 1) {
        sweeping = false;
        revealed = true;
      }
      // fire redline alert when tach crosses redline on the way to settle
      if (!redlineFired) {
        const g = G.find((x) => x.redline);
        if (g) {
          const nr = needleAngle(g, p);
          if (nr.frac > 0.78 && p > T_FULL) {
            redlineFired = true;
            redlineFlash = 1;
          }
        }
      }
    }

    // decay redline flash
    if (redlineFlash > 0) {
      redlineFlash = Math.max(0, redlineFlash - dt / 900);
    }

    // chrome alpha
    const chromeAlpha = sweeping
      ? easeOutExpo(clamp((now - chromeStart) / CHROME_MS, 0, 1))
      : 1;

    composite(p, chromeAlpha);
  }

  // ---- run control ----
  function start() {
    if (running || destroyed) return;
    running = true;
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function beginSweep() {
    if (reducedMotion) {
      renderStatic();
      return;
    }
    sweepStart = performance.now();
    chromeStart = sweepStart + 120;
    sweeping = true;
    revealed = false;
    redlineFired = false;
    redlineFlash = 0;
    if (!running) start();
  }

  // ---- interaction handlers ----
  function onPointerMove(e) {
    const r = canvas.getBoundingClientRect();
    pointerX = e.clientX - r.left;
    pointerY = e.clientY - r.top;
    pointerInside = true;
    hoverTarget = 1;
  }
  function onPointerEnter() {
    hoverTarget = 1;
  }
  function onPointerLeave() {
    hoverTarget = 0;
    pointerInside = false;
  }
  function onClick() {
    // click = re-run the ignition sweep (the headline interaction)
    beginSweep();
  }
  function onReduceChange(e) {
    setReducedMotion(e.matches);
  }

  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerenter", onPointerEnter);
  root.addEventListener("pointerleave", onPointerLeave);
  root.addEventListener("click", onClick);
  if (mqReduce) {
    if (mqReduce.addEventListener) mqReduce.addEventListener("change", onReduceChange);
    else if (mqReduce.addListener) mqReduce.addListener(onReduceChange);
  }

  // ---- ResizeObserver ----
  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      resize();
      refreshSmallFlags();
      if (reducedMotion || !running) renderStatic();
    });
    ro.observe(container);
  }
  function onWinResize() {
    resize();
    refreshSmallFlags();
    if (reducedMotion || !running) renderStatic();
  }
  window.addEventListener("resize", onWinResize);

  // ---- boot ----
  resize();
  refreshSmallFlags();

  // Reveal failsafe: if rAF never advances the sweep, snap to a visible frame.
  let bootGuard = setTimeout(() => {
    if (destroyed) return;
    if (!reducedMotion && !revealed) {
      // force a composed, settled frame so nothing stays blank/half-swept
      sweeping = false;
      revealed = true;
      try {
        composite(1, 1);
      } catch (e) {
        fallback.style.opacity = "1";
      }
    }
  }, 3500);

  if (reducedMotion) {
    renderStatic();
  } else {
    // tiny delay so the dial faces read for a beat before the needles fire
    start();
    beginSweep();
  }

  // ---- public handle ----
  function replay() {
    if (destroyed) return;
    beginSweep();
  }
  function pause() {
    stop();
  }
  function resume() {
    if (destroyed) return;
    if (reducedMotion) {
      renderStatic();
      return;
    }
    start();
  }
  function setReducedMotion(b) {
    reducedMotion = !!b;
    if (reducedMotion) {
      stop();
      renderStatic();
    } else {
      if (!running) start();
      beginSweep();
    }
  }
  function destroy() {
    destroyed = true;
    stop();
    clearTimeout(bootGuard);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerenter", onPointerEnter);
    root.removeEventListener("pointerleave", onPointerLeave);
    root.removeEventListener("click", onClick);
    window.removeEventListener("resize", onWinResize);
    if (mqReduce) {
      if (mqReduce.removeEventListener) mqReduce.removeEventListener("change", onReduceChange);
      else if (mqReduce.removeListener) mqReduce.removeListener(onReduceChange);
    }
    if (ro) {
      try { ro.disconnect(); } catch (e) {}
      ro = null;
    }
    try {
      canvas.width = canvas.height = 0;
      dial.width = dial.height = 0;
      grain.width = grain.height = 0;
    } catch (e) {}
    if (root.parentNode) root.parentNode.removeChild(root);
    ctx = null;
  }

  // ---- helpers ----
  function hexA(hex, a) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function formatFr(n) {
    // thin-space thousands grouping (Québec convention)
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function shortNum(n) {
    if (n >= 1000) {
      const k = n / 1000;
      const s = Number.isInteger(k) ? String(k) : k.toFixed(1);
      return s.replace(".", ",") + "k";
    }
    return String(n);
  }

  function staticHandle() {
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

  return { replay, pause, resume, setReducedMotion, destroy };
}
