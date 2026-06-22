/*
 * #29 — Glow Sparkline · Lineage: The Ledger
 * A single royal sparkline of daily "Clics vers votre profil Google": a lilac
 * moving head drags a glowing royal trail with an area-fill that bleeds into the
 * void, a count-up tallies the running total, and the latest dot breathes.
 * SIGNATURE: when the head reaches the series peak the headline value FLASHES
 * white (a hot-magenta ring fires there exactly once per pass).
 * INTERACTION: hover to scrub the line — a vertical reader snaps to the nearest
 * day, the head jumps under your cursor, and the readout shows that day's value.
 *
 * Deps: none (pure Canvas2D, one offscreen grain tile, additive glow).
 * Perf: DPR capped to [1,2]; series sampled once into typed arrays + a cached
 * cubic-smoothed pixel path rebuilt only on resize; zero per-frame allocation in
 * the hot loop (gradients/paths reused); grain + area-fill dropped on tiny /
 * coarse-pointer cells; single rAF, fully torn down on destroy.
 */

const ROYAL = {
  void: "#07060D",
  ink: "#150E2A",
  royal: "#7C3AED",
  deep: "#4C1D95",
  lilac: "#A855F7",
  lilacHi: "#C4B5FD",
  white: "#F6F3FE",
  flare: "#E8409B", // used exactly once: the peak-strike ring
};

// ---- bespoke eases ----
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

export const meta = {
  id: 29,
  slug: "glow-sparkline",
  title: "Glow Sparkline",
  lineage: "The Ledger",
  signature: "The head reaches the series peak and the headline value flashes white.",
  interaction: "Hover to scrub the line — a reader snaps to the nearest day's value.",
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
    ";font-family:'Inter','Helvetica Neue',Arial,system-ui,sans-serif;";
  container.appendChild(root);

  // Static gradient fallback (also the no-2D / error safety net).
  const fallback = document.createElement("div");
  fallback.style.cssText =
    "position:absolute;inset:0;opacity:0;transition:opacity .4s ease;" +
    "background:radial-gradient(120% 80% at 18% 78%," +
    tokens.deep +
    "33 0%," +
    tokens.void +
    " 58%),linear-gradient(180deg," +
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

  // grain tile
  const grain = document.createElement("canvas");
  const gctx = grain.getContext("2d", { alpha: true });

  // ---- sizing / plot frame ----
  let W = 0, H = 0, DPR = 1;
  let plotL = 0, plotR = 0, plotT = 0, plotB = 0, plotW = 0, plotH = 0;
  let small = false;

  function readSize() {
    const r = container.getBoundingClientRect();
    return {
      w: Math.max(1, Math.round(r.width)),
      h: Math.max(1, Math.round(r.height)),
    };
  }

  // ---- series model: 30 days of "Clics vers votre profil Google" ----
  // Illustrative. Trending up to a clear single peak then a small dip, so the
  // signature peak-strike lands on one unambiguous day.
  const N = 30;
  const series = new Float32Array(N); // raw values (clicks/day)
  let peakIdx = 0;
  let dataMax = 1, dataMin = 0, total = 0;

  function buildSeries() {
    let mx = -Infinity, mn = Infinity, sum = 0;
    let pk = 0;
    // smooth rising base + gentle wobble, single dominant peak around day ~22
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const base = 3 + 9.5 * easeInOutCubic(clamp(u * 1.18, 0, 1)); // 3 -> ~12.5
      const wobble =
        1.5 * Math.sin(u * 6.283 * 2.4 + 0.7) +
        0.8 * Math.sin(u * 6.283 * 5.1 + 1.9);
      // a clean spike to define the peak day
      const dp = (i - 22) / 2.0;
      const spike = 6.4 * Math.exp(-dp * dp);
      let v = base + wobble + spike;
      // settle a touch after the peak (so peak reads as THE moment)
      if (i > 24) v -= (i - 24) * 0.55;
      v = Math.max(0.5, v);
      series[i] = v;
      sum += v;
      if (v > mx) { mx = v; pk = i; }
      if (v < mn) mn = v;
    }
    dataMax = mx;
    dataMin = mn;
    peakIdx = pk;
    total = sum;
  }

  // cached pixel path (rebuilt on resize)
  const px = new Float32Array(N);
  const py = new Float32Array(N);

  function buildPixelPath() {
    const padTop = plotH * 0.16;
    const padBot = plotH * 0.10;
    const usable = plotH - padTop - padBot;
    const span = Math.max(0.001, dataMax - dataMin);
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      px[i] = plotL + u * plotW;
      const norm = (series[i] - dataMin) / span;
      py[i] = plotB - padBot - norm * usable;
    }
  }

  // sample the smooth (catmull-rom) curve at a continuous index t in [0,N-1]
  function sampleX(t) {
    return plotL + (t / (N - 1)) * plotW;
  }
  function sampleY(t) {
    const i0 = Math.floor(t);
    if (i0 >= N - 1) return py[N - 1];
    if (i0 < 0) return py[0];
    const f = t - i0;
    const p0 = py[Math.max(0, i0 - 1)];
    const p1 = py[i0];
    const p2 = py[i0 + 1];
    const p3 = py[Math.min(N - 1, i0 + 2)];
    // catmull-rom
    const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
    const c = -0.5 * p0 + 0.5 * p2;
    return ((a * f + b) * f + c) * f + p1;
  }
  function sampleVal(t) {
    const i0 = clamp(Math.round(t), 0, N - 1);
    return series[i0];
  }

  function resize() {
    const { w, h } = readSize();
    DPR = clamp(window.devicePixelRatio || 1, 1, 2);
    W = w;
    H = h;
    small = W * H < 56000 || W < 240;
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // generous margins: headline top-left, axis labels bottom
    const mL = small ? 16 : 22;
    const mR = small ? 16 : 22;
    const mT = small ? 58 : 78; // room for headline + metric label
    const mB = small ? 26 : 34;
    plotL = mL;
    plotR = W - mR;
    plotT = mT;
    plotB = H - mB;
    plotW = Math.max(1, plotR - plotL);
    plotH = Math.max(1, plotB - plotT);

    buildPixelPath();
    buildGrain();
  }

  function buildGrain() {
    const gs = 96;
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

  // ---- animation state ----
  const DRAW_MS = 1500;   // line draws across
  const REVEAL_MS = 1700; // full entrance window
  let t0 = performance.now();
  let revealStart = t0;
  let revealed = false;

  // head position along the curve (continuous index)
  let headT = 0;          // animated draw progress -> index
  let displayHeadT = 0;   // what we actually draw the head at (scrub overrides)
  let countShown = 0;     // count-up shown value

  // peak-strike (signature)
  let struck = false;     // whether the strike has fired this pass
  let strikeT0 = -1e9;
  const STRIKE_MS = 1100;
  let flashAmt = 0;       // 0..1 white flash on the headline

  // hover / scrub
  let hover = 0, hoverTarget = 0;
  let scrubbing = false;
  let scrubT = 0;         // target index under cursor
  let scrubEased = 0;
  let pointerX = -1, pointerY = -1;

  // idle dot pulse
  let pulse = 0;

  let lastT = t0;
  let raf = 0;
  let running = false;
  let destroyed = false;

  // reusable gradient holders (rebuilt only when geometry changes)
  let areaGrad = null;
  let areaGradKey = "";
  function getAreaGrad() {
    const key = plotT + "x" + plotB;
    if (areaGrad && areaGradKey === key) return areaGrad;
    const g = ctx.createLinearGradient(0, plotT, 0, plotB);
    g.addColorStop(0, hexA(tokens.royal, 0.34));
    g.addColorStop(0.55, hexA(tokens.deep, 0.16));
    g.addColorStop(1, hexA(tokens.void, 0));
    areaGrad = g;
    areaGradKey = key;
    return g;
  }

  // ---- drawing ----
  function drawBackground() {
    ctx.fillStyle = tokens.void;
    ctx.fillRect(0, 0, W, H);
    // faint ink-violet glow low-left where the line lives
    const g = ctx.createRadialGradient(
      plotL + plotW * 0.2, plotB, 0,
      plotL + plotW * 0.2, plotB, Math.max(W, H) * 0.7
    );
    g.addColorStop(0, hexA(tokens.deep, 0.18));
    g.addColorStop(1, hexA(tokens.void, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBaseline(alpha) {
    // a single hairline at the plot floor + subtle gridline at the peak level
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    ctx.strokeStyle = hexA(tokens.deep, 0.4);
    ctx.beginPath();
    ctx.moveTo(plotL, plotB + 0.5);
    ctx.lineTo(plotR, plotB + 0.5);
    ctx.stroke();
    // peak guide (dashed, faint)
    if (!small) {
      ctx.strokeStyle = hexA(tokens.royal, 0.16);
      ctx.setLineDash([2, 6]);
      const yPk = py[peakIdx];
      ctx.beginPath();
      ctx.moveTo(plotL, yPk + 0.5);
      ctx.lineTo(plotR, yPk + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // trace the curve path from index 0..endT into ctx (no stroke/fill here)
  function tracePath(endT, toFloor) {
    ctx.beginPath();
    const steps = small ? 2 : 3; // sub-samples per day for smoothness
    ctx.moveTo(px[0], py[0]);
    const last = Math.floor(endT);
    for (let i = 1; i <= last; i++) {
      // sub-sample between i-1 and i
      for (let s = 1; s <= steps; s++) {
        const t = i - 1 + s / steps;
        ctx.lineTo(sampleX(t), sampleY(t));
      }
    }
    // partial final segment up to endT
    if (endT > last) {
      const segStart = last;
      const segEnd = endT;
      const subSteps = Math.max(1, Math.ceil((segEnd - segStart) * steps));
      for (let s = 1; s <= subSteps; s++) {
        const t = lerp(segStart, segEnd, s / subSteps);
        ctx.lineTo(sampleX(t), sampleY(t));
      }
    }
    if (toFloor) {
      ctx.lineTo(sampleX(endT), plotB);
      ctx.lineTo(px[0], plotB);
      ctx.closePath();
    }
  }

  function drawArea(endT, alpha) {
    if (small) return; // skip fill on tiny cells
    ctx.save();
    ctx.beginPath();
    ctx.rect(plotL, plotT - 4, plotW, plotH + 8);
    ctx.clip();
    ctx.globalAlpha = alpha;
    tracePath(endT, true);
    ctx.fillStyle = getAreaGrad();
    ctx.fill();
    ctx.restore();
  }

  function drawLine(endT, alpha) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // soft royal halo underlay (additive)
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    tracePath(endT, false);
    ctx.strokeStyle = hexA(tokens.royal, 0.22);
    ctx.lineWidth = small ? 5 : 8;
    ctx.stroke();

    // core royal line
    tracePath(endT, false);
    ctx.strokeStyle = hexA(tokens.royal, 0.95);
    ctx.lineWidth = small ? 1.6 : 2.2;
    ctx.stroke();

    ctx.restore();
  }

  // the bright lilac head + breathing latest dot
  function drawHead(t, alpha, big) {
    const x = sampleX(t);
    const y = sampleY(t);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;

    // glow
    const gr = (small ? 9 : 14) * (1 + 0.18 * pulse) * (big ? 1.18 : 1);
    const g = ctx.createRadialGradient(x, y, 0, x, y, gr);
    g.addColorStop(0, hexA(tokens.white, 0.95));
    g.addColorStop(0.3, hexA(tokens.lilacHi, 0.75));
    g.addColorStop(0.7, hexA(tokens.royal, 0.32));
    g.addColorStop(1, hexA(tokens.royal, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, gr, 0, Math.PI * 2);
    ctx.fill();

    // solid core
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = tokens.white;
    ctx.beginPath();
    ctx.arc(x, y, small ? 2 : 2.8, 0, Math.PI * 2);
    ctx.fill();

    // a thin lilac ring around the latest dot (breathing)
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = hexA(tokens.lilacHi, 0.45 + 0.3 * pulse);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, (small ? 5 : 7) + pulse * 2.2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
    return { x, y };
  }

  // signature: hot-magenta strike ring + ripple at the peak
  function drawStrike(nowMs) {
    if (struck === false) return;
    const s = (nowMs - strikeT0) / STRIKE_MS;
    if (s >= 1) return;
    const x = px[peakIdx];
    const y = py[peakIdx];
    const inT = easeOutBack(clamp(s / 0.22, 0, 1));
    const out = easeOutCubic(clamp(s, 0, 1));
    const a = 1 - out;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // expanding ripple ring — the ONE magenta moment
    const rr = lerp(4, small ? 26 : 40, easeOutCubic(s));
    ctx.globalAlpha = a;
    ctx.strokeStyle = hexA(tokens.flare, 0.9);
    ctx.lineWidth = lerp(2.4, 0.5, out);
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.stroke();

    // second, faster lilac ring for depth
    const rr2 = lerp(2, small ? 18 : 28, easeOutExpo(s));
    ctx.strokeStyle = hexA(tokens.lilacHi, 0.8);
    ctx.lineWidth = lerp(1.6, 0.4, out);
    ctx.beginPath();
    ctx.arc(x, y, rr2, 0, Math.PI * 2);
    ctx.stroke();

    // hot core burst at impact
    const burst = (small ? 16 : 24) * inT * (1 - clamp(s / 0.5, 0, 1));
    if (burst > 0.5) {
      const bg = ctx.createRadialGradient(x, y, 0, x, y, burst);
      bg.addColorStop(0, hexA(tokens.white, 0.9 * a));
      bg.addColorStop(0.4, hexA(tokens.flare, 0.7 * a));
      bg.addColorStop(1, hexA(tokens.flare, 0));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(x, y, burst, 0, Math.PI * 2);
      ctx.fill();
    }

    // four short spark rays
    if (!small) {
      ctx.strokeStyle = hexA(tokens.lilacHi, 0.7 * a);
      ctx.lineWidth = 1;
      const ray = lerp(6, 22, easeOutExpo(s));
      for (let k = 0; k < 4; k++) {
        const ang = k * (Math.PI / 2) + Math.PI / 4;
        const cx2 = Math.cos(ang), sy2 = Math.sin(ang);
        ctx.beginPath();
        ctx.moveTo(x + cx2 * (ray * 0.4), y + sy2 * (ray * 0.4));
        ctx.lineTo(x + cx2 * ray, y + sy2 * ray);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---- scrub reader (vertical line + crosshair on hover) ----
  function drawReader(t, alpha) {
    if (alpha <= 0.01) return;
    const x = sampleX(t);
    const y = sampleY(t);
    ctx.save();
    ctx.globalAlpha = alpha;
    // vertical reader line
    ctx.strokeStyle = hexA(tokens.lilac, 0.5);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, plotT - 2);
    ctx.lineTo(x + 0.5, plotB);
    ctx.stroke();
    ctx.setLineDash([]);
    // a small marker at floor
    ctx.fillStyle = hexA(tokens.lilacHi, 0.85);
    ctx.beginPath();
    ctx.moveTo(x, plotB - 5);
    ctx.lineTo(x - 4, plotB + 1);
    ctx.lineTo(x + 4, plotB + 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- chrome: headline value, metric label, axis, footer ----
  function drawChrome(nowMs, alpha, headIdx, headVal) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textBaseline = "alphabetic";

    // brand tag
    ctx.font = "700 10px 'Inter',system-ui,sans-serif";
    ctx.fillStyle = hexA(tokens.lilac, 0.8);
    ctx.fillText("VANTA · LE REGISTRE", plotL, small ? 18 : 22);

    // metric label
    ctx.font = "600 " + (small ? "9px" : "10px") + " 'Inter',system-ui,sans-serif";
    ctx.fillStyle = hexA(tokens.lilacHi, 0.85);
    ctx.fillText("Clics vers votre profil Google", plotL, small ? 32 : 40);

    // BIG headline value (count-up / scrub value) — flashes white on strike
    const valStr = formatFr(Math.round(headVal));
    const baseCol = mix(tokens.white, tokens.lilacHi, 0.0);
    ctx.font = "700 " + (small ? "26px" : "34px") + " 'Inter',system-ui,sans-serif";
    // flash: brighten + slight additive bloom when flashAmt > 0
    if (flashAmt > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * flashAmt * 0.9;
      ctx.fillStyle = tokens.white;
      ctx.fillText(valStr, plotL, small ? 56 : 72);
      ctx.restore();
    }
    ctx.fillStyle = flashAmt > 0.01 ? tokens.white : baseCol;
    ctx.fillText(valStr, plotL, small ? 56 : 72);

    // unit caption next to value
    const vw = ctx.measureText(valStr).width;
    ctx.font = "600 " + (small ? "9px" : "11px") + " 'Inter',system-ui,sans-serif";
    ctx.fillStyle = hexA(tokens.lilac, 0.7);
    ctx.fillText(scrubbing ? "ce jour-là" : "clics · 30 j", plotL + vw + 8, small ? 54 : 69);

    // live / scrub status dot top-right
    const dotX = plotR - (small ? 6 : 8);
    const dotY = small ? 16 : 20;
    const p = 0.5 + 0.5 * Math.sin(nowMs * 0.006);
    ctx.textAlign = "right";
    ctx.font = "700 9px 'Inter',system-ui,sans-serif";
    if (scrubbing) {
      ctx.fillStyle = hexA(tokens.lilacHi, 0.9);
      ctx.fillText("SURVOL · JOUR " + (headIdx + 1), dotX - 12, dotY + 3);
    } else {
      ctx.fillStyle = hexA(tokens.lilacHi, 0.9);
      ctx.fillText("EN DIRECT", dotX - 12, dotY + 3);
      ctx.fillStyle = hexA(tokens.lilac, 0.4 + 0.6 * p);
      ctx.beginPath();
      ctx.arc(dotX - 4, dotY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = "left";

    // axis labels: first / peak / last day
    if (!small) {
      ctx.font = "600 8px 'Inter',system-ui,sans-serif";
      ctx.fillStyle = hexA(tokens.lilac, 0.55);
      ctx.fillText("J-30", plotL, plotB + 16);
      ctx.textAlign = "right";
      ctx.fillText("AUJOURD'HUI", plotR, plotB + 16);
      ctx.textAlign = "center";
      ctx.fillStyle = hexA(tokens.lilacHi, 0.7);
      ctx.fillText("SOMMET", px[peakIdx], plotB + 16);
      ctx.textAlign = "left";
    }

    // footer trend badge bottom-right (above axis)
    ctx.font = "700 " + (small ? "9px" : "10px") + " 'Inter',system-ui,sans-serif";
    ctx.fillStyle = hexA(tokens.lilacHi, 0.9);
    ctx.textAlign = "right";
    ctx.fillText("+24 % ce mois · illustratif", plotR, small ? 50 : 64);
    ctx.textAlign = "left";

    ctx.restore();
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(
      W * 0.5, H * 0.45, Math.min(W, H) * 0.3,
      W * 0.5, H * 0.45, Math.max(W, H) * 0.78
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawGrain() {
    if (coarse || small) return;
    const pat = ctx.createPattern(grain, "repeat");
    if (!pat) return;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ---- helpers ----
  function hexA(hex, a) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function mix(h1, h2, t) {
    const a = h1.replace("#", ""), b = h2.replace("#", "");
    const r = Math.round(lerp(parseInt(a.substring(0, 2), 16), parseInt(b.substring(0, 2), 16), t));
    const g = Math.round(lerp(parseInt(a.substring(2, 4), 16), parseInt(b.substring(2, 4), 16), t));
    const bl = Math.round(lerp(parseInt(a.substring(4, 6), 16), parseInt(b.substring(4, 6), 16), t));
    return "rgb(" + r + "," + g + "," + bl + ")";
  }
  function formatFr(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); // narrow nbsp
  }

  // ---- the full render (one frame) ----
  // headIdx/headVal computed by caller; t is the head's continuous index.
  function render(nowMs, revealAlpha, drawT, headT2) {
    drawBackground();
    drawBaseline(revealAlpha);
    drawArea(drawT, revealAlpha * 0.95);
    drawLine(drawT, revealAlpha);

    // reader (only meaningful when scrubbing)
    drawReader(headT2, hover * (scrubbing ? 1 : 0));

    // head
    drawHead(headT2, revealAlpha, scrubbing);

    // signature strike
    drawStrike(nowMs);

    // value to show: scrub value when scrubbing, else the count-up
    const headIdx = clamp(Math.round(headT2), 0, N - 1);
    const headVal = scrubbing ? series[headIdx] : countShown;

    drawChrome(nowMs, revealAlpha, headIdx, headVal);
    drawVignette();
    drawGrain();
  }

  // ---- static frame (reduced motion / fallback) : the hero composition ----
  function renderStatic() {
    // settle everything at the peak moment — the screenshot beat, frozen.
    revealed = true;
    flashAmt = 1; // headline reads bright white
    pulse = 0.6;
    struck = false; // no animated ripple in static (keep it clean)
    countShown = total; // running total
    // draw full line, head sitting on the peak
    const headIdx = peakIdx;
    drawBackground();
    drawBaseline(1);
    drawArea(N - 1, 0.95);
    drawLine(N - 1, 1);
    // a soft static ring at the peak to mark the moment (no magenta in static)
    const xPk = px[peakIdx], yPk = py[peakIdx];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = hexA(tokens.lilacHi, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(xPk, yPk, small ? 14 : 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawHead(headIdx, 1, true);
    // headline shows the peak day's value (the moment), bright
    const savedScrub = scrubbing;
    scrubbing = false;
    drawChrome(performance.now(), 1, headIdx, series[peakIdx]);
    scrubbing = savedScrub;
    drawVignette();
    drawGrain();
    flashAmt = 0;
  }

  // ---- main loop ----
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);

    const dt = Math.min(50, now - lastT);
    lastT = now;

    // reveal progress
    const rp = clamp((now - revealStart) / REVEAL_MS, 0, 1);
    const revealAlpha = easeOutExpo(clamp(rp * 1.3, 0, 1));
    if (rp >= 1) revealed = true;

    // line-draw progress -> head index
    const dp = clamp((now - revealStart) / DRAW_MS, 0, 1);
    headT = easeOutCubic(dp) * (N - 1);

    // idle breathing
    pulse = 0.5 + 0.5 * Math.sin(now * 0.0035);

    // ease hover
    const k = 1 - Math.pow(0.001, dt / 1000);
    hover += (hoverTarget - hover) * k;

    // scrub easing toward cursor index
    if (scrubbing) {
      scrubEased += (scrubT - scrubEased) * (1 - Math.pow(0.0001, dt / 1000));
    }

    // decide the head index actually drawn
    if (scrubbing && revealed) {
      displayHeadT = clamp(scrubEased, 0, N - 1);
    } else {
      displayHeadT = headT;
    }

    // count-up: follows the head's traversal, lands on total
    if (!scrubbing) {
      // partial sum up to current head index (so the number climbs with the line)
      const hi = clamp(displayHeadT, 0, N - 1);
      const i0 = Math.floor(hi);
      let sum = 0;
      for (let i = 0; i <= i0; i++) sum += series[i];
      // add fractional last day
      if (i0 < N - 1) sum += series[i0 + 1] * (hi - i0);
      countShown = sum;
    }

    // ---- signature trigger: head crosses the peak during the draw ----
    if (!scrubbing && !struck && headT >= peakIdx && dp > 0.02) {
      struck = true;
      strikeT0 = now;
    }
    // flash envelope on the headline (sharp up, soft down)
    if (struck) {
      const s = (now - strikeT0) / STRIKE_MS;
      flashAmt = s < 0.12 ? easeOutCubic(clamp(s / 0.12, 0, 1))
                          : 1 - easeOutCubic(clamp((s - 0.12) / 0.7, 0, 1));
      flashAmt = clamp(flashAmt, 0, 1);
    } else {
      flashAmt = 0;
    }
    // scrubbing onto the peak day also gives a gentle glow (no magenta re-fire)
    if (scrubbing) {
      const onPeak = Math.abs(displayHeadT - peakIdx) < 0.6;
      flashAmt = onPeak ? 0.55 : 0;
    }

    render(now, revealAlpha, headT < (N - 1) && !scrubbing ? headT : N - 1, displayHeadT);
  }

  // ---- pointer handlers ----
  function onMove(e) {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    pointerX = x;
    pointerY = y;
    const inside = x >= plotL - 14 && x <= plotR + 14 && y >= plotT - 30 && y <= plotB + 14;
    if (inside && !coarse) {
      scrubbing = true;
      hoverTarget = 1;
      const u = clamp((x - plotL) / plotW, 0, 1);
      scrubT = u * (N - 1);
      if (scrubEased === 0 && displayHeadT > 0) scrubEased = displayHeadT;
    } else {
      hoverTarget = 0;
      scrubbing = false;
    }
  }
  function onEnter() {
    if (!coarse) hoverTarget = 1;
  }
  function onLeave() {
    hoverTarget = 0;
    scrubbing = false;
  }
  function onReduceChange(e) {
    setReducedMotion(e.matches);
  }

  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerenter", onEnter);
  canvas.addEventListener("pointerleave", onLeave);
  if (mqReduce) {
    if (mqReduce.addEventListener) mqReduce.addEventListener("change", onReduceChange);
    else if (mqReduce.addListener) mqReduce.addListener(onReduceChange);
  }

  // ---- resize ----
  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      resize();
      if (reducedMotion || !running) renderStatic();
    });
    ro.observe(container);
  }
  function onWinResize() {
    resize();
    if (reducedMotion || !running) renderStatic();
  }
  window.addEventListener("resize", onWinResize);

  // ---- boot ----
  buildSeries();
  resize();

  // reveal failsafe: if rAF never advances, force a visible static frame.
  let bootGuard = setTimeout(() => {
    if (!revealed) {
      if (reducedMotion || !running) {
        try { renderStatic(); } catch (e) {}
      } else {
        // force-complete the reveal so nothing is stuck invisible
        revealStart = performance.now() - REVEAL_MS - 10;
      }
    }
  }, 1600);

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

  if (reducedMotion) {
    renderStatic();
  } else {
    revealStart = performance.now();
    t0 = revealStart;
    start();
  }

  // ---- public handle ----
  function replay() {
    if (destroyed) return;
    if (reducedMotion) {
      renderStatic();
      return;
    }
    revealStart = performance.now();
    t0 = revealStart;
    revealed = false;
    struck = false;
    flashAmt = 0;
    headT = 0;
    displayHeadT = 0;
    countShown = 0;
    scrubbing = false;
    scrubEased = 0;
    if (!running) start();
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
      replay();
    }
  }
  function destroy() {
    destroyed = true;
    stop();
    clearTimeout(bootGuard);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerenter", onEnter);
    canvas.removeEventListener("pointerleave", onLeave);
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
      grain.width = grain.height = 0;
    } catch (e) {}
    areaGrad = null;
    if (root.parentNode) root.parentNode.removeChild(root);
    ctx = null;
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
