/*
 * 32 - Liquid Gauge · V2  (Lineage: The Ledger)
 * ============================================================================
 * THE OVERFLOW MENISCUS SNAP.
 *
 * A circular ledger gauge fills with royal liquid (a real two-sine procedural
 * surface, preserved wholesale from V1) and lands on a monthly goal for a
 * Québec restaurant blog: 1240 / 1600 vues - exactly 78 %.
 *
 * The signature beat is now a true critically-underdamped spring integrated on
 * the fill fraction, choreographed as three legible acts:
 *
 *   (1) ANTICIPATION - at the scheduled fill, the surface dips ~4% below empty
 *       and the rim glow dims for ~180ms, coiling before the climb.
 *   (2) PAYOFF - the spring drives the surface PAST the dashed `objectif` line
 *       so it visibly crests above target. On the EXACT frame the fill first
 *       crosses TARGET, three things fire on the SAME frame for one inevitable
 *       beat: the single magenta flare ring (1-frame ignition, ~220ms decay),
 *       a horizontal meniscus shockwave sweeping left→right across the surface,
 *       and a white count-up landing flash on the percent glyph.
 *   (3) SETTLE - the spring rings down through 2–3 decaying wobbles to land on
 *       EXACTLY 1240 / 1600 and 78 %, meniscus going glassy-still.
 *
 * The screenshot moment is the cusp of the overshoot: liquid arced above the
 * objectif line, rim blooming, magenta ghost, 78 % mid-flash. Chromatic
 * aberration is coupled to slosh velocity in the final composite pass so the
 * rim and readout fringe harder the faster they move - then snap dead-clean as
 * velocity hits zero. The stillness after motion is the beat.
 *
 * What V2 adds over V1 (without regressing a single V1 feature):
 *   • Hand-rolled composite pass: bright-pass bloom (downscale + 2 box blurs,
 *     added with 'lighter') + subtle barrel warp + velocity chromatic aberration
 *     - replaces scattered per-stroke shadowBlur with one controlled grade.
 *   • Real spring integrator on fillFrac (stiffness ~120, damping ~11) - frame-
 *     rate independent overshoot + ring-down, replacing the open-loop curve.
 *   • Energy-driven colour grade: lift royal→lilac at crests, crush shadows
 *     toward ink-violet, gate rim brightness - the grade responds to the beat.
 *   • Reflective elliptical floor + soft contact shadow - z-depths the disc.
 *   • Tabular count-up (monospaced digits) with a 1-frame landing flash and a
 *     lilac gradient hairline rule framing the readout as a data field.
 *   • Camera micro-parallax to cursor across 2–3 z-layers + atmospheric edge
 *     fade so the disc recedes into the void.
 *   • Subsurface absorption gradient (Beer–Lambert-ish) + soft additive bubble
 *     sprites that cluster and accelerate during the slosh act.
 *
 * Deps: [] - pure Canvas2D. No three, no gsap. Everything procedural.
 * Perf: scene canvas + small reusable offscreen buffers (no per-frame alloc in
 *       the hot loop), DPR capped to [1,2] (coarse pointer -> 1.4); the composite
 *       pass downsamples for the blur so it stays cheap; offscreen pause()/
 *       resume() halt the loop. CSS-gradient fallback when 2D is unavailable;
 *       reveal failsafe forces a settled visible frame; reduced-motion static.
 */

/* ---- Royal palette (fallback when tokens are absent) ------------------- */
const ROYAL = {
  void: "#07060D",
  panel: "#150E2A",
  royal: "#7C3AED",
  deep: "#4C1D95",
  lilacA: "#A855F7",
  lilacB: "#C4B5FD",
  white: "#F6F3FE",
  flare: "#E8409B",
};

export const meta = {
  id: 32,
  slug: "liquid-gauge",
  title: "Liquid Gauge",
  lineage: "The Ledger",
  version: "V2",
  signature:
    "The liquid coils, springs past the objectif and crests - flare ring, meniscus shockwave and count-up flash fire on one frame - then rings down to exactly 78 %, glassy-still.",
  interaction:
    "Move the cursor to parallax the gauge and ripple the surface; click anywhere to recoil and refill from empty.",
  deps: [],
};

/* ---- color helpers ---------------------------------------------------- */
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function mixHex(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  const r = Math.round(x.r + (y.r - x.r) * t);
  const g = Math.round(x.g + (y.g - x.g) * t);
  const bl = Math.round(x.b + (y.b - x.b) * t);
  return `rgb(${r},${g},${bl})`;
}

/* ---- custom easings + math -------------------------------------------- */
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;

const FR = (n) => new Intl.NumberFormat("fr-CA").format(Math.round(n));
// Tabular figures: a monospaced-digit stack so the count-up never jitters.
const MONO = '"SF Mono", "JetBrains Mono", "Roboto Mono", ui-monospace, Menlo, Consolas, monospace';

export function mount(container, opts = {}) {
  const tokens = (opts && opts.tokens) || {};
  const P = {
    void: tokens.void || ROYAL.void,
    panel: tokens.panel || ROYAL.panel,
    royal: tokens.royal || ROYAL.royal,
    deep: tokens.deep || ROYAL.deep,
    lilacA: tokens.lilacA || ROYAL.lilacA,
    lilacB: tokens.lilacB || ROYAL.lilacB,
    white: tokens.white || ROYAL.white,
    flare: tokens.flare || ROYAL.flare,
  };

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let reduced = !!opts.reducedMotion || prefersReduced;

  const coarse =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(pointer: coarse)").matches;

  /* ---- scene canvas (offscreen render target) ------------------------- */
  // V2 renders the gauge to an offscreen "scene" buffer, then a single
  // fullscreen composite pass blits it to the visible canvas with bright-pass
  // bloom + barrel + velocity chromatic aberration. The visible canvas only
  // ever receives composited pixels.
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.cursor = "pointer";
  container.appendChild(canvas);

  let out = null;       // visible 2D context
  try {
    out = canvas.getContext("2d", { alpha: true });
  } catch (e) {
    out = null;
  }

  // Hard fallback: if even 2D context is unavailable, paint a CSS gradient.
  if (!out) {
    canvas.remove();
    const fb = document.createElement("div");
    fb.style.position = "absolute";
    fb.style.inset = "0";
    fb.style.background =
      `radial-gradient(120% 90% at 50% 12%, ${rgba(P.deep, 0.55)}, ${P.void} 62%),` +
      ` radial-gradient(70% 60% at 50% 78%, ${rgba(P.royal, 0.5)}, transparent 70%)`;
    container.appendChild(fb);
    return {
      replay() {},
      pause() {},
      resume() {},
      setReducedMotion() {},
      destroy() { try { fb.remove(); } catch (e) {} },
    };
  }

  // Offscreen scene buffer (full-res) + composite working buffers (downscaled
  // for the blur). Reused across frames - no per-frame allocation.
  const scene = document.createElement("canvas");
  let sctx = scene.getContext("2d", { alpha: true });

  const bloomA = document.createElement("canvas");   // downscaled bright-pass
  const bloomB = document.createElement("canvas");   // ping-pong for box blur
  let bA = bloomA.getContext("2d", { alpha: true });
  let bB = bloomB.getContext("2d", { alpha: true });

  // full-res scratch for the chromatic channel split (only sized/used when the
  // surface is actually moving - otherwise the composite blits clean).
  const split = document.createElement("canvas");
  let spx = split.getContext("2d", { alpha: true });

  let W = 0, H = 0, DPR = 1;
  let cx = 0, cy = 0, R = 0;     // gauge center + radius in CSS px
  let small = false;
  let BW = 0, BH = 0;            // bloom buffer dims (device px, downscaled)

  function readSize() {
    const rect = container.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    const cap = coarse ? 1.4 : 2;
    DPR = Math.min(cap, Math.max(1, window.devicePixelRatio || 1));

    small = Math.min(W, H) < 240;

    const dw = Math.max(1, Math.round(W * DPR));
    const dh = Math.max(1, Math.round(H * DPR));
    canvas.width = dw; canvas.height = dh;
    scene.width = dw; scene.height = dh;
    split.width = dw; split.height = dh;

    // bloom buffers at ~1/4 res - the blur reads as a soft bloom, cheaply.
    const div = small || coarse ? 5 : 4;
    BW = Math.max(1, Math.round(dw / div));
    BH = Math.max(1, Math.round(dh / div));
    bloomA.width = BW; bloomA.height = BH;
    bloomB.width = BW; bloomB.height = BH;

    cx = W / 2;
    R = Math.min(W, H) * 0.36;
    R = Math.min(R, W * 0.42, H * 0.40);
    // leave headroom below the disc for the reflective floor
    cy = H * 0.46;
  }
  readSize();

  /* ---- film grain (procedural, cached tile) --------------------------- */
  const grain = document.createElement("canvas");
  const GS = 128;
  grain.width = GS; grain.height = GS;
  (function buildGrain() {
    const gctx = grain.getContext("2d");
    const img = gctx.createImageData(GS, GS);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 14;
    }
    gctx.putImageData(img, 0, 0);
  })();

  /* ---- data ----------------------------------------------------------- */
  const GOAL = 9540;            // illustrative, non-round goal
  const VALUE = 7418;            // illustrative, non-round
  const TARGET = VALUE / GOAL;   // 0.778 -> Math.round = 78 %

  /* ---- bubble pool (soft additive sprites) ---------------------------- */
  const BUB_N = small ? 10 : (coarse ? 16 : 26);
  const bubbles = [];
  for (let i = 0; i < BUB_N; i++) {
    bubbles.push({ x: 0, y: 0, r: 0, sp: 0, wob: 0, ph: 0, life: 0, on: false });
  }
  function spawnBubble(b, burst) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * R * 0.8;
    b.x = Math.cos(a) * rr;
    b.y = R * (burst ? lerp(0.7, 0.98, Math.random()) : 0.95);
    b.r = lerp(R * 0.011, R * 0.05, Math.random());
    b.sp = lerp(0.18, 0.5, Math.random()) * (burst ? 1.55 : 1);
    b.wob = lerp(0.4, 1.4, Math.random());
    b.ph = Math.random() * Math.PI * 2;
    b.life = 0;
    b.on = true;
  }

  /* ---- animation state ------------------------------------------------ */
  let raf = 0;
  let running = false;
  let booted = false;
  let destroyed = false;
  let startT = 0;
  let lastT = 0;
  let revealStart = 0;
  let reveal = 0;
  const REVEAL_MS = 950;

  // --- the spring: critically-underdamped integrator on the fill fraction ---
  // x'' = -k(x - target) - c x' .  Tuned so it overshoots once visibly, rings
  // down through 2-3 decaying wobbles, lands clean. Frame-rate independent via
  // sub-stepping on dt.
  const SPRING_K = 120;   // stiffness
  const SPRING_C = 11;    // damping
  let springX = 0;        // current fill (0..~1.05 during overshoot)
  let springV = 0;        // velocity
  let springTarget = 0;   // where the spring is pulling toward

  let fillFrac = 0;       // = springX, clamped >= 0 for drawing
  let fillActive = false; // spring is doing work (anticipation/payoff/settle)
  let flareFired = false; // single magenta flare per fill
  let flareT = 0;         // flare envelope 0..1

  // anticipation act
  let anticip = 0;        // 0..1 envelope of the pre-dip
  let anticipStart = 0;
  const ANTICIP_MS = 180;
  let anticipPhase = false;

  // meniscus shockwave (fires on target-cross, sweeps L->R)
  let shock = -1;         // -1 = inactive, else 0..1 sweep progress
  let shockVel = 0;

  // count-up landing flash on the percent glyph
  let landFlash = 0;      // 0..1, 1-frame ignition then decays

  // slosh tilt (lateral momentum -> wave mean tilt) - preserved from V1
  let sloshTilt = 0;
  let sloshVel = 0;

  // energy scalar = clamp(abs(springV)) - drives the colour grade + aberration
  let energy = 0;

  // count-up readout (driven off the SAME spring)
  let shownVal = 0;

  // pointer (parallax + cursor ripple)
  let pointerX = 0, pointerY = 0, pointerOn = 0, pointerTarget = 0;
  let ripple = 0;
  // eased camera parallax offset
  let camX = 0, camY = 0;

  // rim-glow dim factor (dips during anticipation, blooms at payoff)
  let rimEnergy = 1;

  function beginFill() {
    // Act 1: anticipation - coil below empty before the climb.
    anticipPhase = true;
    anticipStart = performance.now();
    anticip = 0;
    fillActive = true;
    flareFired = false;
    flareT = 0;
    shock = -1;
    landFlash = 0;
    springX = 0;
    springV = 0;
    springTarget = 0;     // held at empty during anticipation
    sloshVel = small ? 1.0 : 1.4;
    ripple = 1;
    for (const b of bubbles) b.on = false;
  }

  let beginFillScheduled = false;
  let scheduledFillAt = 0;

  function replay() {
    if (destroyed) return;
    revealStart = performance.now();
    reveal = 0;
    if (reduced) {
      reveal = 1;
      springX = TARGET; springV = 0; fillFrac = TARGET;
      shownVal = VALUE;
      drawStatic();
      return;
    }
    beginFillScheduled = true;
    scheduledFillAt = revealStart + REVEAL_MS * 0.55;
    springX = 0; springV = 0; fillFrac = 0;
    shownVal = 0;
    fillActive = false;
    ensureRunning();
  }

  /* ====================================================================== *
   *  SCENE RENDER  - draws the full gauge into the offscreen `scene` buffer
   *  (everything except grain/vignette, which ride the composite output).
   * ====================================================================== */
  function compose(now, frac, waveAmp, tilt, flareEnv, rev) {
    const g = sctx;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, W, H);

    // energy grade scalars (0 settled .. 1 violent slosh)
    const E = clamp01(energy);
    const crest = easeOutCubic(E);                 // lift toward lilac at crests
    const crush = E;                               // crush shadows in stillness->motion

    // --- background: void + faint violet undertone + vignette ---
    // shadows crush toward ink-violet panel as the surface stirs.
    const bg = g.createRadialGradient(cx, cy * 0.82, R * 0.2, cx, cy, Math.max(W, H) * 0.78);
    bg.addColorStop(0, mixHex(P.void, P.panel, 0.5 + crush * 0.12));
    bg.addColorStop(0.5, P.void);
    bg.addColorStop(1, "#040309");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // entrance scale/opacity of the whole gauge
    const ge = easeOutExpo(rev);
    const gScale = lerp(0.86, 1, ge);
    const gAlpha = ge;

    // ----- camera parallax: disc moves with cursor; outer layers move more.
    // 3 z-layers: ambient/ticks (far, larger parallax) < disc (mid) < readout.
    const discPX = camX, discPY = camY;
    const farPX = camX * 1.6, farPY = camY * 1.6;

    /* ---------- FAR LAYER: ambient glow ring + tick marks ---------- */
    g.save();
    g.translate(cx + farPX, cy + farPY);
    g.scale(gScale, gScale);
    g.globalAlpha = gAlpha;

    // outer ambient glow ring - brightness gated by rimEnergy (dims on coil).
    const amb = g.createRadialGradient(0, 0, R * 0.7, 0, 0, R * 1.6);
    amb.addColorStop(0, rgba(P.royal, 0.0));
    amb.addColorStop(0.55, rgba(P.deep, (0.16 + crest * 0.10) * gAlpha * rimEnergy));
    amb.addColorStop(1, rgba(P.royal, 0.0));
    g.fillStyle = amb;
    g.beginPath();
    g.arc(0, 0, R * 1.6, 0, Math.PI * 2);
    g.fill();

    // tick marks (ledger feel) - far parallax layer
    const TICKS = small ? 24 : 36;
    for (let i = 0; i < TICKS; i++) {
      const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2;
      const major = i % (TICKS / 4 | 0) === 0;
      const rin = R * (major ? 1.06 : 1.08);
      const rout = R * (major ? 1.15 : 1.12);
      g.beginPath();
      g.moveTo(Math.cos(a) * rin, Math.sin(a) * rin);
      g.lineTo(Math.cos(a) * rout, Math.sin(a) * rout);
      g.lineWidth = major ? 2 : 1;
      g.strokeStyle = rgba(P.lilacA, (major ? 0.5 : 0.22) * (0.7 + rimEnergy * 0.3));
      g.stroke();
    }
    g.restore();

    /* ---------- MID LAYER: the disc, liquid, rim, reflection ---------- */
    g.save();
    g.translate(cx + discPX, cy + discPY);
    g.scale(gScale, gScale);
    g.globalAlpha = gAlpha;

    // --- reflective elliptical floor + soft contact shadow (z-depth) ---
    // draw BELOW the disc so the gauge "sits" on a surface.
    drawReflectionAndShadow(g, frac, waveAmp, tilt, E, gAlpha);

    // --- inner glass disc ---
    const glass = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.05);
    glass.addColorStop(0, rgba(mixHex(P.panel, P.void, crush * 0.3), 0.92));
    glass.addColorStop(0.7, rgba(P.panel, 0.5));
    glass.addColorStop(1, rgba(P.void, 0.85));
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fillStyle = glass;
    g.fill();

    // --- liquid (clipped to disc) ---
    g.save();
    g.beginPath();
    g.arc(0, 0, R - 1, 0, Math.PI * 2);
    g.clip();

    drawLiquid(g, now, frac, waveAmp, tilt, E, crest);

    g.restore(); // end liquid clip

    // --- rare magenta flare ring: hot pulse the instant we cross target ---
    if (flareEnv > 0.001) {
      g.save();
      g.globalCompositeOperation = "lighter";
      const fr = R * (1.0 + (1 - flareEnv) * 0.18);   // ring expands as it decays
      const fg = g.createRadialGradient(0, 0, R * 0.55, 0, 0, fr * 1.18);
      fg.addColorStop(0, rgba(P.flare, 0));
      fg.addColorStop(0.80, rgba(P.flare, 0.0));
      fg.addColorStop(0.92, rgba(P.flare, 0.6 * flareEnv));
      fg.addColorStop(1, rgba(P.flare, 0));
      g.beginPath();
      g.arc(0, 0, fr * 1.18, 0, Math.PI * 2);
      g.fillStyle = fg;
      g.fill();
      g.restore();
    }

    // --- glass rim: fresnel lilac ring + inner shade (gated by rimEnergy) ---
    drawRim(g, E, crest);

    g.restore(); // end mid layer

    /* ---------- NEAR LAYER: target line + readout (least parallax) ---------- */
    g.save();
    g.translate(cx + discPX * 0.85, cy + discPY * 0.85);
    g.scale(gScale, gScale);
    g.globalAlpha = gAlpha;

    drawTargetLine(g);
    drawReadout(g, frac);

    g.restore();

    // --- footer wordmark (outside the disc, no parallax) ---
    if (!small) {
      g.save();
      g.textAlign = "center";
      g.fillStyle = rgba(P.white, 0.42);
      g.font = `500 ${Math.max(9, R * 0.085)}px "Helvetica Neue", Arial, sans-serif`;
      g.fillText("VANTA · Trouvé partout.", cx, cy + R * 1.5);
      g.restore();
    }
  }

  /* ---- liquid body + bubbles + meniscus + shockwave ------------------- */
  function drawLiquid(g, now, frac, waveAmp, tilt, E, crest) {
    const baseSurfaceY = lerp(R, -R, frac); // frac can exceed 1 on overshoot
    const N = small ? 28 : (coarse ? 40 : 60);
    const x0 = -R, x1 = R;
    const tsec = (now - startT) / 1000;

    // wave parameters - PRESERVED V1 model: staggered k1/k2, w1/w2.
    const amp1 = waveAmp * R;
    const amp2 = waveAmp * R * 0.55;
    const k1 = 2.1, k2 = 3.7;
    const w1 = 1.7, w2 = -2.6;

    const px = pointerOn > 0.01 ? (pointerX - cx - camX) / 1 : 0;
    const rippAmp = ripple * R * 0.06;

    function surfaceAt(x) {
      const u = x / R;
      let y = baseSurfaceY;
      y += Math.sin(u * k1 * Math.PI + tsec * w1) * amp1;
      y += Math.sin(u * k2 * Math.PI + tsec * w2 + 1.3) * amp2;
      y += tilt * x * 0.9;
      if (pointerOn > 0.01 || ripple > 0.001) {
        const d = (x - px) / (R * 0.5);
        y += -Math.cos(Math.min(Math.abs(d) * 1.6, Math.PI)) * rippAmp * Math.exp(-d * d * 0.6) *
          (pointerOn * 0.5 + ripple);
      }
      return y;
    }

    // sample surface once into ys[] - reused by body fill, sheen, meniscus, shock.
    const step = (x1 - x0) / N;
    const ys = surfaceYs;
    for (let i = 0; i <= N; i++) ys[i] = surfaceAt(x0 + step * i);

    // --- liquid body: subsurface absorption (Beer–Lambert-ish) gradient ---
    // brighter, lifted toward lilac near surface ONLY at crests; darkens toward
    // the bottom faster than a linear ramp -> reads as depth of fluid.
    const lg = g.createLinearGradient(0, baseSurfaceY - R * 0.2, 0, R);
    lg.addColorStop(0, mixHex(P.royal, P.lilacA, 0.20 + crest * 0.30));
    lg.addColorStop(0.16, mixHex(P.royal, P.lilacA, crest * 0.12));
    lg.addColorStop(0.42, P.deep);
    lg.addColorStop(0.72, mixHex(P.deep, P.void, 0.35));
    lg.addColorStop(1, mixHex(P.deep, P.void, 0.65));

    g.beginPath();
    g.moveTo(x0, R + 4);
    g.lineTo(x0, ys[0]);
    for (let i = 1; i <= N; i++) g.lineTo(x0 + step * i, ys[i]);
    g.lineTo(x1, R + 4);
    g.closePath();
    g.fillStyle = lg;
    g.fill();

    // additive sub-surface sheen near the meniscus
    g.globalCompositeOperation = "lighter";
    const sheen = g.createLinearGradient(0, baseSurfaceY - R * 0.12, 0, baseSurfaceY + R * 0.35);
    sheen.addColorStop(0, rgba(P.lilacB, 0.20 + crest * 0.12));
    sheen.addColorStop(1, rgba(P.lilacB, 0));
    g.beginPath();
    g.moveTo(x0, baseSurfaceY + R * 0.35);
    g.lineTo(x0, ys[0]);
    for (let i = 1; i <= N; i++) g.lineTo(x0 + step * i, ys[i]);
    g.lineTo(x1, baseSurfaceY + R * 0.35);
    g.closePath();
    g.fillStyle = sheen;
    g.fill();
    g.globalCompositeOperation = "source-over";

    // --- bubbles: soft additive radial sprites with specular + fresnel edge ---
    g.globalCompositeOperation = "lighter";
    for (const b of bubbles) {
      if (!b.on) continue;
      const yy = R - b.y;
      if (yy < baseSurfaceY) { b.on = false; continue; }
      const wob = Math.sin(tsec * 3 + b.ph) * b.wob * (R * 0.01);
      const bx = b.x + wob;
      const alpha = clamp01((1 - b.life) * 0.7 + 0.12);
      // soft body sprite
      const sp = g.createRadialGradient(bx, yy, 0, bx, yy, b.r * 1.6);
      sp.addColorStop(0, rgba(P.lilacB, 0.5 * alpha));
      sp.addColorStop(0.55, rgba(P.lilacA, 0.18 * alpha));
      sp.addColorStop(1, rgba(P.lilacA, 0));
      g.beginPath();
      g.arc(bx, yy, b.r * 1.6, 0, Math.PI * 2);
      g.fillStyle = sp;
      g.fill();
      // single specular dot
      g.beginPath();
      g.arc(bx - b.r * 0.3, yy - b.r * 0.3, Math.max(0.5, b.r * 0.26), 0, Math.PI * 2);
      g.fillStyle = rgba(P.white, 0.45 * alpha);
      g.fill();
    }
    g.globalCompositeOperation = "source-over";

    // --- white meniscus (the surface line) ---
    g.beginPath();
    g.moveTo(x0, ys[0]);
    for (let i = 1; i <= N; i++) g.lineTo(x0 + step * i, ys[i]);
    g.lineWidth = Math.max(1.4, R * 0.02);
    g.strokeStyle = rgba(P.white, 0.9);
    g.stroke();

    // bright crest highlight (additive, thin) - preserved
    g.globalCompositeOperation = "lighter";
    g.beginPath();
    g.moveTo(x0, ys[0]);
    for (let i = 1; i <= N; i++) g.lineTo(x0 + step * i, ys[i]);
    g.lineWidth = Math.max(0.8, R * 0.008);
    g.strokeStyle = rgba(P.white, 0.55 + crest * 0.25);
    g.stroke();

    // --- meniscus shockwave: a second additive crest stroke that sweeps
    //     left->right across the surface at high velocity on target-cross. ---
    if (shock >= 0 && shock <= 1) {
      const sx = lerp(x0, x1, shock);              // shock leading edge x
      const width = R * 0.42;                      // glowing band width
      g.beginPath();
      let started = false;
      for (let i = 0; i <= N; i++) {
        const x = x0 + step * i;
        const d = Math.abs(x - sx);
        if (d > width) continue;
        if (!started) { g.moveTo(x, ys[i]); started = true; }
        else g.lineTo(x, ys[i]);
      }
      const env = Math.sin(shock * Math.PI);       // brightest mid-sweep
      g.lineWidth = Math.max(1.6, R * 0.03);
      g.strokeStyle = rgba(P.white, 0.85 * env);
      g.lineCap = "round";
      g.stroke();
      // a fainter lilac aura trailing the crest
      g.lineWidth = Math.max(2.4, R * 0.06);
      g.strokeStyle = rgba(P.lilacB, 0.35 * env);
      g.stroke();
      g.lineCap = "butt";
    }
    g.globalCompositeOperation = "source-over";
  }

  /* ---- glass rim (fresnel) -------------------------------------------- */
  function drawRim(g, E, crest) {
    g.save();
    // inner shadow ring (depth)
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.lineWidth = Math.max(2, R * 0.05);
    const rimShade = g.createLinearGradient(0, -R, 0, R);
    rimShade.addColorStop(0, rgba(P.void, 0.0));
    rimShade.addColorStop(1, rgba(P.void, 0.55));
    g.strokeStyle = rimShade;
    g.stroke();

    // bright fresnel rim (additive) - brightness gated by rimEnergy (coil dims
    // it; payoff/crest blooms it). Bloom itself now comes from composite pass.
    g.globalCompositeOperation = "lighter";
    g.beginPath();
    g.arc(0, 0, R - R * 0.01, 0, Math.PI * 2);
    g.lineWidth = Math.max(1.5, R * 0.02);
    const rb = (0.55 + crest * 0.45) * (0.55 + rimEnergy * 0.45);
    const rimGlow = g.createLinearGradient(-R, -R, R, R);
    rimGlow.addColorStop(0, rgba(P.lilacB, 0.85 * rb + 0.1));
    rimGlow.addColorStop(0.4, rgba(P.lilacA, 0.25 * rb));
    rimGlow.addColorStop(0.6, rgba(P.royal, 0.15 * rb));
    rimGlow.addColorStop(1, rgba(P.lilacB, 0.7 * rb + 0.08));
    g.strokeStyle = rimGlow;
    g.stroke();
    g.globalCompositeOperation = "source-over";

    // top-left glass specular arc
    g.beginPath();
    g.arc(0, 0, R - R * 0.07, Math.PI * 1.05, Math.PI * 1.5);
    g.lineWidth = Math.max(1.2, R * 0.02);
    g.strokeStyle = rgba(P.white, 0.28);
    g.lineCap = "round";
    g.stroke();
    g.lineCap = "butt";
    g.restore();
  }

  /* ---- target line + objectif tag ------------------------------------- */
  function drawTargetLine(g) {
    const ty = lerp(R, -R, TARGET);
    const half = Math.sqrt(Math.max(0, R * R - ty * ty));
    g.save();
    g.setLineDash([R * 0.04, R * 0.05]);
    g.beginPath();
    g.moveTo(-half, ty);
    g.lineTo(half, ty);
    g.lineWidth = 1;
    g.strokeStyle = rgba(P.lilacB, 0.3);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = rgba(P.lilacB, 0.55);
    g.font = `500 ${Math.max(8, R * 0.07)}px "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText("objectif", half + R * 0.04, ty);
    g.restore();
  }

  /* ---- center readout: tabular percent + count + label + hairline ----- */
  function drawReadout(g, frac) {
    g.save();
    g.textAlign = "center";
    const pct = Math.round(clamp01(frac) * 100);

    // landing flash: 1-frame white over-bloom + 1.04 scale punch on the glyph.
    const lf = landFlash;
    const punch = 1 + easeOutCubic(lf) * 0.04;

    // big tabular percent - pure white, heavier weight for crisp legibility
    g.save();
    g.scale(punch, punch);
    g.fillStyle = "#FFFFFF";
    g.font = `500 ${R * 0.46}px ${MONO}`;
    g.textBaseline = "alphabetic";
    g.fillText(pct + " %", 0, -R * 0.02 / punch);
    // additive over-bloom on the flash frame
    if (lf > 0.001) {
      g.globalCompositeOperation = "lighter";
      g.fillStyle = rgba(P.white, 0.6 * lf);
      g.fillText(pct + " %", 0, -R * 0.02 / punch);
      g.globalCompositeOperation = "source-over";
    }
    g.restore();

    // count-up value - tabular figures so digits never jitter - pure white, crisp
    g.fillStyle = "#FFFFFF";
    g.font = `600 ${R * 0.15}px ${MONO}`;
    g.fillText(`${FR(shownVal)} / ${FR(GOAL)}`, 0, R * 0.2);

    // 1px gradient hairline rule under the readout (lilac fading at both ends)
    const hw = R * 0.62;
    const hy = R * 0.27;
    const hl = g.createLinearGradient(-hw, 0, hw, 0);
    hl.addColorStop(0, rgba(P.lilacB, 0));
    hl.addColorStop(0.5, rgba(P.lilacB, 0.45));
    hl.addColorStop(1, rgba(P.lilacB, 0));
    g.strokeStyle = hl;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-hw, hy);
    g.lineTo(hw, hy);
    g.stroke();

    // metric label - pure white, crisp/legible
    g.fillStyle = "#FFFFFF";
    g.font = `600 ${R * 0.1}px "Helvetica Neue", Arial, sans-serif`;
    g.fillText("Vues du blogue · ce mois", 0, R * 0.38);
    g.restore();
  }

  /* ---- reflective floor + soft contact shadow ------------------------- */
  // A vertically-mirrored, low-alpha copy of the lower liquid + rim, clipped to
  // a squashed ellipse and faded by a linear mask, plus a soft contact shadow.
  // Reflection intensity rides the energy scalar so it shimmers during slosh.
  function drawReflectionAndShadow(g, frac, waveAmp, tilt, E, gAlpha) {
    const floorY = R * 1.02;          // top of the reflective floor
    const ellH = R * 0.32;            // squash height
    const refIntensity = (0.10 + E * 0.10) * gAlpha;

    // soft contact shadow ellipse directly beneath the disc
    g.save();
    const sh = g.createRadialGradient(0, floorY, R * 0.1, 0, floorY, R * 0.95);
    sh.addColorStop(0, rgba("#000000", 0.5));
    sh.addColorStop(0.6, rgba("#000000", 0.22));
    sh.addColorStop(1, rgba("#000000", 0));
    g.translate(0, floorY);
    g.scale(1, 0.26);
    g.beginPath();
    g.arc(0, 0, R * 0.92, 0, Math.PI * 2);
    g.fillStyle = sh;
    g.fill();
    g.restore();

    // reflective bounce: a squashed lilac/royal glow echoing the disc's lower
    // half - a second royal highlight bounce.
    g.save();
    g.translate(0, floorY);
    g.scale(1, -0.26);                // mirror + squash
    g.beginPath();
    g.arc(0, R * 0.5, R * 0.92, 0, Math.PI * 2);
    g.clip();
    const rf = g.createRadialGradient(0, R * 0.2, R * 0.1, 0, R * 0.4, R * 1.0);
    rf.addColorStop(0, rgba(P.lilacA, refIntensity * 1.4));
    rf.addColorStop(0.4, rgba(P.royal, refIntensity));
    rf.addColorStop(1, rgba(P.royal, 0));
    g.globalCompositeOperation = "lighter";
    g.fillStyle = rf;
    g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();
  }

  /* ====================================================================== *
   *  COMPOSITE PASS - bright-pass bloom + barrel + chromatic aberration
   *  Reads `scene` (full-res), writes the visible `canvas`.
   * ====================================================================== */
  function composite() {
    const o = out;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = "source-over";
    o.imageSmoothingEnabled = true;
    o.clearRect(0, 0, canvas.width, canvas.height);

    // velocity-coupled aberration magnitude (0..1), peaks at the overshoot cusp,
    // decays to zero on settle -> snaps dead-clean. Kept gentle so the fringe
    // reads as a premium lens grade, never illegibility.
    const aberr = clamp(Math.abs(springV) * 0.11 + ripple * 0.28 + (shock >= 0 ? 0.18 : 0), 0, 1);

    // (b) subtle barrel: scale the scene up slightly so the disc reads as a
    // glass dome bulging toward the viewer. magnitude tiny + steady.
    const barrel = 1.006;
    const bw = canvas.width, bh = canvas.height;
    const bx = (bw * barrel - bw) / 2;
    const by = (bh * barrel - bh) / 2;
    const dw = bw * barrel, dh = bh * barrel;

    // --- base blit with RADIAL chromatic aberration ---
    // Channels are drawn at slightly different scales about the centre: red
    // expanded, blue contracted. Fringe is zero on the optical axis (the readout
    // stays razor-sharp) and grows toward the rim - physically-correct CA that
    // hardens with velocity and snaps clean on settle.
    if (aberr < 0.02) {
      o.drawImage(scene, -bx, -by, dw, dh);
    } else {
      const spread = aberr * 0.012;   // max ~1.2% scale split at the rim
      o.globalCompositeOperation = "lighter";
      blitChannelScaled(o, "rgb(255,0,0)", 1 + spread);
      blitChannelScaled(o, "rgb(0,255,0)", 1);
      blitChannelScaled(o, "rgb(0,0,255)", 1 - spread);
      o.globalCompositeOperation = "source-over";
    }

    // (a) bright-pass bloom: downscale the scene, threshold the highlights,
    // box-blur twice, add back with 'lighter' so rim + meniscus bloom.
    buildBloom();
    o.globalCompositeOperation = "lighter";
    o.globalAlpha = clamp(0.45 + energy * 0.35, 0, 0.9);
    o.drawImage(bloomA, -bx, -by, dw, dh);
    o.globalAlpha = 1;
    o.globalCompositeOperation = "source-over";

    // --- grain + vignette overlay (CSS-px space) ---
    o.setTransform(DPR, 0, 0, DPR, 0, 0);
    o.save();
    o.globalAlpha = 0.5;
    const pat = o.createPattern(grain, "repeat");
    if (pat) { o.fillStyle = pat; o.fillRect(0, 0, W, H); }
    o.restore();

    // atmospheric edge fade: a faint void wash so the disc recedes into black.
    const vig = o.createRadialGradient(cx, cy, R * 0.55, cx, cy, Math.max(W, H) * 0.72);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(0.7, rgba(P.void, 0.25));
    vig.addColorStop(1, "rgba(0,0,0,0.6)");
    o.fillStyle = vig;
    o.fillRect(0, 0, W, H);
    o.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Isolate one colour channel of `scene` (scene * pure-channel-mask via
  // 'multiply') and blit it additively, SCALED about the canvas centre by
  // `scl`. Larger scl pushes that channel's edges outward -> radial fringe that
  // vanishes at the centre. `scl` also folds in the steady barrel warp.
  function blitChannelScaled(o, mask, scl) {
    spx.setTransform(1, 0, 0, 1, 0, 0);
    spx.globalCompositeOperation = "source-over";
    spx.clearRect(0, 0, split.width, split.height);
    spx.drawImage(scene, 0, 0);
    spx.globalCompositeOperation = "multiply";
    spx.fillStyle = mask;
    spx.fillRect(0, 0, split.width, split.height);
    spx.globalCompositeOperation = "source-over";

    const bw = canvas.width, bh = canvas.height;
    const s = scl * 1.006;                 // include barrel
    const dw = bw * s, dh = bh * s;
    o.drawImage(split, -(dw - bw) / 2, -(dh - bh) / 2, dw, dh);
  }

  /* ---- bright-pass + box blur into bloomA ----------------------------- */
  function buildBloom() {
    // 1) downscale scene into bloomA (smoothing on -> free pre-blur)
    bA.setTransform(1, 0, 0, 1, 0, 0);
    bA.globalCompositeOperation = "source-over";
    bA.clearRect(0, 0, BW, BH);
    bA.imageSmoothingEnabled = true;
    bA.drawImage(scene, 0, 0, BW, BH);

    // 2) bright-pass via two successive 'multiply' crushes. The scene is ~90%
    //    near-black, so darkening the buffer pushes the mids (panel/void) toward
    //    zero while the rim, meniscus, readout and flare survive. Two multiplies
    //    give a steeper-than-linear knee -> only true highlights bloom.
    bA.globalCompositeOperation = "multiply";
    bA.fillStyle = "rgb(110,110,110)";
    bA.fillRect(0, 0, BW, BH);
    bA.fillStyle = "rgb(150,150,150)";
    bA.fillRect(0, 0, BW, BH);
    bA.globalCompositeOperation = "source-over";

    // 3) two cheap box blurs (ping-pong A->B->A) via offset draws.
    boxBlur(bA, bB, BW, BH, Math.max(1, Math.round(BW * 0.012)));
    boxBlur(bA, bB, BW, BH, Math.max(1, Math.round(BW * 0.020)));
  }

  // separable-ish box blur via 9 offset additive draws (cheap, soft).
  function boxBlur(srcCtx, tmpCtx, w, h, rad) {
    const src = srcCtx.canvas;
    tmpCtx.setTransform(1, 0, 0, 1, 0, 0);
    tmpCtx.globalCompositeOperation = "source-over";
    tmpCtx.clearRect(0, 0, w, h);
    tmpCtx.globalAlpha = 1 / 9;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        tmpCtx.drawImage(src, dx * rad, dy * rad);
      }
    }
    tmpCtx.globalAlpha = 1;
    // copy back to source
    srcCtx.clearRect(0, 0, w, h);
    srcCtx.drawImage(tmpCtx.canvas, 0, 0);
  }

  /* ---- shared scratch ------------------------------------------------- */
  const surfaceYs = new Float32Array(80);

  /* ---- static frame (reduced motion) ---------------------------------- */
  function drawStatic() {
    reveal = 1;
    springX = TARGET; springV = 0; fillFrac = TARGET;
    shownVal = VALUE;
    energy = 0; rimEnergy = 1; flareT = 0; shock = -1; landFlash = 0;
    sloshTilt = 0; sloshVel = 0;
    startT = performance.now();
    camX = 0; camY = 0;
    compose(performance.now(), TARGET, 0.012, 0, 0, 1);
    composite();
  }

  /* ---- frame ---------------------------------------------------------- */
  function frame(now) {
    if (!running) return;
    booted = true;
    raf = requestAnimationFrame(frame);

    if (!startT) startT = now;
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
    lastT = now;

    // entrance
    reveal = revealStart ? clamp01((now - revealStart) / REVEAL_MS) : 1;

    // kick off the signature fill once disc is partly revealed
    if (beginFillScheduled && now >= scheduledFillAt) {
      beginFillScheduled = false;
      beginFill();
    }

    /* ----- ACT 1: anticipation (coil below empty, dim the rim) ----- */
    if (anticipPhase) {
      const at = clamp01((now - anticipStart) / ANTICIP_MS);
      anticip = Math.sin(at * Math.PI);      // 0 -> 1 -> 0 dip envelope
      // hold spring just below empty for the dip
      springTarget = -0.04 * anticip;
      rimEnergy = lerp(1, 0.45, anticip);    // dim the rim glow during coil
      if (at >= 1) {
        anticipPhase = false;
        springTarget = TARGET;               // release -> the climb springs up
        springV = 6.0;                        // launch velocity out of the coil
      }
    } else if (fillActive) {
      springTarget = TARGET;
    }

    /* ----- spring integration (sub-stepped for stability) ----- */
    if (fillActive) {
      const steps = 4;
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        const a = -SPRING_K * (springX - springTarget) - SPRING_C * springV;
        springV += a * h;
        springX += springV * h;
      }
      fillFrac = Math.max(0, springX);

      // count-up tracks the SAME spring (clamped to VALUE - no number overshoot)
      shownVal = Math.min(VALUE, Math.max(0, springX) * GOAL);

      /* ----- ACT 2: PAYOFF - fire 3 things on the target-cross frame ----- */
      if (!flareFired && !anticipPhase && springX >= TARGET && springV > 0) {
        flareFired = true;
        flareT = 1;                 // single magenta flare (1-frame ignition)
        shock = 0; shockVel = 6.0;  // meniscus shockwave begins its L->R sweep
        landFlash = 1;              // count-up landing flash
        sloshVel += small ? 0.5 : 0.8;
        rimEnergy = 1.25;           // bloom the rim on the beat
        // burst of effervescence catching the rim bloom
        let burst = 0;
        for (const b of bubbles) {
          if (!b.on && burst < (small ? 4 : 8)) { spawnBubble(b, true); burst++; }
        }
      }

      /* ----- ACT 3: settle detection ----- */
      if (Math.abs(springX - TARGET) < 0.0006 && Math.abs(springV) < 0.01) {
        springX = TARGET; springV = 0;
        fillFrac = TARGET; shownVal = VALUE;
        fillActive = false;
      }
    } else {
      // idle: gentle breathing + spring holds target with micro-life
      shownVal = lerp(shownVal, VALUE, 0.1);
      springX = lerp(springX, TARGET, 0.06);
      fillFrac = springX;
    }

    // wave amplitude: big during slosh (driven by spring velocity), decaying.
    const sloshMag = clamp01(Math.abs(springV) * 0.9);
    let waveAmp;
    if (fillActive) {
      const idle = 0.012 + Math.sin(now / 1400) * 0.003;
      waveAmp = idle + sloshMag * 0.07 + (1 - clamp01(springX / Math.max(TARGET, 0.001))) * 0.02;
    } else {
      waveAmp = 0.012 + Math.sin(now / 1400) * 0.004;
    }

    // energy scalar = clamp(abs(springV)) - drives grade + aberration
    energy = lerp(energy, clamp01(Math.abs(springV) * 0.85 + ripple * 0.4 + (shock >= 0 ? 0.5 : 0)), 0.4);

    // rim energy eases back to 1 after the payoff bloom
    if (!anticipPhase) rimEnergy = lerp(rimEnergy, 1, 0.12);

    // slosh tilt physics (spring back to level) - preserved V1 model
    sloshVel += -sloshTilt * 22 * dt;
    sloshVel *= Math.pow(0.06, dt);
    sloshTilt += sloshVel * dt;
    const tilt = sloshTilt * 0.08;

    // flare envelope decay (~220ms)
    if (flareT > 0) flareT = Math.max(0, flareT - dt / 0.22);

    // landing flash decay (fast, ~1-frame ignition then ease out)
    if (landFlash > 0) landFlash = Math.max(0, landFlash - dt * 5.5);

    // meniscus shockwave sweep
    if (shock >= 0) {
      shock += shockVel * dt;
      if (shock > 1) shock = -1;
    }

    // ripple decay
    if (ripple > 0) ripple = Math.max(0, ripple - dt * 0.9);

    // pointer presence ease + camera parallax (eased lag toward cursor)
    pointerOn = lerp(pointerOn, pointerTarget, 0.12);
    const tx = pointerOn > 0.01 ? (pointerX - cx) : 0;
    const ty = pointerOn > 0.01 ? (pointerY - cy) : 0;
    const maxPar = small ? 4 : 9;
    camX = lerp(camX, clamp(tx * 0.06, -maxPar, maxPar) * pointerOn, 0.08);
    camY = lerp(camY, clamp(ty * 0.06, -maxPar, maxPar) * pointerOn, 0.08);

    // --- bubble update ---
    for (const b of bubbles) {
      if (!b.on) {
        if (fillFrac > 0.05 && Math.random() < (fillActive ? 0.07 : 0.012)) spawnBubble(b, false);
        continue;
      }
      b.y += b.sp * R * dt * 1.2;
      b.life += dt * 0.28;
      if (b.life >= 1) b.on = false;
    }

    // render scene -> composite to screen
    compose(now, fillFrac, waveAmp, tilt, flareT, reveal);
    composite();
  }

  function ensureRunning() {
    if (running || destroyed) return;
    running = true;
    lastT = 0;
    raf = requestAnimationFrame(frame);
  }

  /* ---- events --------------------------------------------------------- */
  function onPointerMove(e) {
    const rect = container.getBoundingClientRect();
    pointerX = e.clientX - rect.left;
    pointerY = e.clientY - rect.top;
    pointerTarget = 1;
  }
  function onPointerLeave() {
    pointerTarget = 0;
  }
  function onClick() {
    if (reduced) return;
    revealStart = revealStart || performance.now();
    reveal = 1;
    beginFill();
    ensureRunning();
  }

  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerleave", onPointerLeave);
  container.addEventListener("click", onClick);

  /* ---- resize --------------------------------------------------------- */
  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      if (destroyed || !out) return;
      readSize();
      if (reduced) drawStatic();
    });
    ro.observe(container);
  }

  /* ---- reduced-motion media listener ---------------------------------- */
  let mq = null, mqHandler = null;
  if (typeof window !== "undefined" && window.matchMedia) {
    mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mqHandler = (e) => setReducedMotion(e.matches || !!opts.reducedMotion);
    if (mq.addEventListener) mq.addEventListener("change", mqHandler);
    else if (mq.addListener) mq.addListener(mqHandler);
  }

  /* ---- public API ----------------------------------------------------- */
  function pause() {
    if (!running) return;
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function resume() {
    if (destroyed) return;
    if (reduced) { drawStatic(); return; }
    if (running) return;
    ensureRunning();
  }
  function setReducedMotion(b) {
    if (destroyed) return;
    reduced = !!b;
    if (reduced) {
      pause();
      drawStatic();
    } else {
      replay();
    }
  }

  function destroy() {
    destroyed = true;
    pause();
    container.removeEventListener("pointermove", onPointerMove);
    container.removeEventListener("pointerleave", onPointerLeave);
    container.removeEventListener("click", onClick);
    if (ro) { try { ro.disconnect(); } catch (e) {} ro = null; }
    if (mq && mqHandler) {
      if (mq.removeEventListener) mq.removeEventListener("change", mqHandler);
      else if (mq.removeListener) mq.removeListener(mqHandler);
    }
    try { canvas.remove(); } catch (e) {}
    // release offscreen buffers
    try { scene.width = scene.height = 0; } catch (e) {}
    try { split.width = split.height = 0; } catch (e) {}
    try { bloomA.width = bloomA.height = 0; } catch (e) {}
    try { bloomB.width = bloomB.height = 0; } catch (e) {}
    out = null; sctx = null; spx = null; bA = null; bB = null;
  }

  /* ---- boot ----------------------------------------------------------- */
  if (reduced) {
    drawStatic();
  } else {
    // Paint an immediate empty frame so it is never blank, then animate in.
    try { compose(performance.now(), 0, 0.012, 0, 0, 0); composite(); } catch (e) {}
    revealStart = performance.now();
    reveal = 0;
    beginFillScheduled = true;
    scheduledFillAt = revealStart + REVEAL_MS * 0.55;
    ensureRunning();

    // Reveal failsafe: if rAF never advances (tab throttled at mount), after a
    // short delay force a composed, visible, fully-settled frame.
    setTimeout(() => {
      if (booted || reduced || !out) return;
      try {
        reveal = 1; springX = TARGET; springV = 0; fillFrac = TARGET;
        shownVal = VALUE; energy = 0; rimEnergy = 1;
        compose(performance.now(), TARGET, 0.012, 0, 0, 1);
        composite();
      } catch (e) {}
    }, 500);
  }

  return { replay, pause, resume, setReducedMotion, destroy };
}
