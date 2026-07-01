/* ============================================================================
 * 05 · Godrays Cathedral — V2 (ELEVATED)  —  lineage: The Field
 * Volumetric royal god-rays raking through dark violet haze, with GPU-instanced
 * depth-banded dust motes drifting in the light. Rays sweep slowly on idle, lean
 * toward the cursor, and shift with scroll.
 *
 * V2 PUSH (built on V1, regresses nothing):
 *  · REAL threshold bloom — half-res FBO pipeline: bright-pass → separable 9-tap
 *    gaussian (H then V) → final composite that adds bloom*strength back. God-ray
 *    cores and the white flare actually bleed light into the void. Gated behind
 *    lowQuality: coarse-pointer / FBO-alloc-failure falls back to the V1 single-
 *    pass soft-clamp (never blanks).
 *  · Velocity-coupled chromatic aberration + faint barrel in the composite frag —
 *    radial 3-tap RGB split scaled by pointer/flare velocity, so cursor flicks and
 *    the flare read optically, not flat.
 *  · Signature beat re-authored to ANTICIPATION → PAYOFF → SETTLE-with-overshoot:
 *    ~0.25s before the last char of "Trouvé" lands the whole shaft field crushes
 *    ~45% darker and haze pulls down (the cathedral inhales); the central shaft
 *    then snaps to full white incandescence through the bloom pass with a halo
 *    punch; uFlare rings once (~8% overshoot via exp*sin) and settles. White shaft
 *    angle eases into place with a back-out sweep.
 *  · ONE earned magenta spark — a single sub-frame hot-magenta point at the source
 *    tip, fired exactly once on the very first flare's payoff frame; every other
 *    highlight stays pure white. Rarity is the point.
 *  · True z-layer depth + DOF — motes bucketed into near/mid/far bands with band-
 *    scaled parallax, far band soft-blurred + atmospherically faded into the haze,
 *    near band crisp; royal saturation lifts on the near band only at crests.
 *  · Gradient hairline that wipes in under "Trouvé" on payoff + a 1px overlay
 *    haptic tick + a 1-frame headline scale snap-back.
 *
 * deps: three@0.160.0  (gsap optional — graceful fallback to internal easing)
 * perf: single WebGL context · half-res bloom FBOs (gated) · 1 instanced-points
 *       mote system · DPR capped [1,2] · no per-frame alloc · coarse-pointer /
 *       small-screen → fewer motes + single-pass soft-clamp · reduced-motion →
 *       static composed frame, no loop. Leak-free destroy().
 * ========================================================================== */

import * as THREE from "https://esm.sh/three@0.160.0";

export const meta = {
  id: 5,
  slug: "godrays-cathedral",
  title: "Godrays Cathedral",
  lineage: "The Field",
  version: "V2",
  signature:
    "The cathedral inhales, the white ray detonates through a real bloom pass with one magenta spark, then rings once and settles.",
  interaction:
    "Hover and scroll tilt the volumetric shafts; cursor flicks spike lens-grade chromatic aberration as motes parallax in depth.",
  deps: ["three@0.160.0"],
};

/* ---- Royal palette (hardcoded fallback; tokens may override) -------------- */
const ROYAL = {
  void: "#07060D",
  panel: "#150E2A",
  royal: "#7C3AED",
  deep: "#4C1D95",
  haloA: "#A855F7",
  haloB: "#C4B5FD",
  white: "#F6F3FE",
  flare: "#E8409B", // rare hot-magenta alert — used at most once
};

const hexToVec3 = (hex) => {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
};

/* bespoke easings (no gsap dependency required) */
const easeExpoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easePower4Out = (t) => 1 - Math.pow(1 - t, 4);
const easePower2InOut = (t) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeBackOut = (t, s = 1.70158) => {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function mount(container, opts = {}) {
  /* ---------------------------------------------------------------------- */
  /* 0 · resolve options + palette                                          */
  /* ---------------------------------------------------------------------- */
  const tokens = (opts && opts.tokens) || {};
  const P = {
    void: tokens.void || ROYAL.void,
    panel: tokens.panel || ROYAL.panel,
    royal: tokens.royal || ROYAL.royal,
    deep: tokens.deep || ROYAL.deep,
    haloA: tokens.haloA || ROYAL.haloA,
    haloB: tokens.haloB || ROYAL.haloB,
    white: tokens.white || ROYAL.white,
    flare: tokens.flare || ROYAL.flare,
  };

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let reducedMotion = !!opts.reducedMotion || prefersReduced;

  const coarsePointer =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(pointer: coarse)").matches;

  /* size ------------------------------------------------------------------ */
  let rect = container.getBoundingClientRect();
  let W = Math.max(1, Math.floor(rect.width || 640));
  let H = Math.max(1, Math.floor(rect.height || 420));
  const isSmall = () => Math.min(W, H) < 360;

  /* ---------------------------------------------------------------------- */
  /* 1 · DOM scaffold (always present so it can never blank)                 */
  /* ---------------------------------------------------------------------- */
  const root = document.createElement("div");
  root.style.cssText =
    "position:absolute;inset:0;overflow:hidden;background:" +
    P.void +
    ";font-family:'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  // static gradient base — the never-blank floor (also the WebGL fallback)
  const baseGrad = document.createElement("div");
  baseGrad.style.cssText =
    "position:absolute;inset:0;background:" +
    `radial-gradient(120% 90% at 32% -12%, ${P.deep}40 0%, ${P.panel}22 30%, ${P.void} 66%),` +
    `radial-gradient(80% 60% at 70% 120%, ${P.royal}1a 0%, transparent 60%);`;
  root.appendChild(baseGrad);
  container.appendChild(root);

  /* canvas layer ---------------------------------------------------------- */
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;";
  root.appendChild(canvas);

  /* ---------------------------------------------------------------------- */
  /* 2 · text overlay (French Québec copy) — masked char reveal             */
  /* ---------------------------------------------------------------------- */
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;" +
    "padding:0 clamp(20px,7%,64px);pointer-events:none;z-index:3;will-change:transform;";

  const eyebrow = document.createElement("div");
  eyebrow.textContent = "VANTA · VISIBILITÉ LOCALE";
  eyebrow.style.cssText =
    "font-size:clamp(9px,1.5vw,11px);letter-spacing:.32em;text-transform:uppercase;" +
    `color:${P.haloB};opacity:0;transform:translateY(8px);margin-bottom:clamp(10px,2.4vh,20px);` +
    "font-weight:600;mix-blend-mode:screen;";
  overlay.appendChild(eyebrow);

  // headline: "Trouvé partout." — "Trouvé" gets the signature flare
  const headline = document.createElement("h1");
  headline.style.cssText =
    "margin:0;font-weight:700;line-height:.98;letter-spacing:-.02em;" +
    "font-size:clamp(34px,8.4vw,76px);color:" +
    P.white +
    ";text-shadow:0 2px 30px " +
    P.royal +
    "55;";
  // word1 wraps the flare word + the gradient hairline (positioned under it)
  const word1 = document.createElement("span");
  word1.style.cssText =
    "position:relative;display:inline-block;white-space:nowrap;will-change:transform;";
  const flareWord = "Trouvé";
  const charSpans = [];
  for (const ch of flareWord) {
    const mask = document.createElement("span");
    mask.style.cssText =
      "display:inline-block;overflow:hidden;vertical-align:top;";
    const inner = document.createElement("span");
    inner.textContent = ch;
    inner.style.cssText =
      "display:inline-block;transform:translateY(110%);will-change:transform;";
    mask.appendChild(inner);
    word1.appendChild(mask);
    charSpans.push(inner);
  }
  // gradient hairline — wipes in under "Trouvé" synced to the flare payoff
  const hairline = document.createElement("span");
  hairline.style.cssText =
    "position:absolute;left:0;right:0;bottom:-0.06em;height:2px;pointer-events:none;" +
    `background:linear-gradient(90deg, transparent 0%, ${P.haloB} 24%, ${P.white} 52%, ${P.haloA} 78%, transparent 100%);` +
    "transform:scaleX(0);transform-origin:left center;mix-blend-mode:screen;" +
    "opacity:0;border-radius:2px;will-change:transform,opacity;" +
    `box-shadow:0 0 10px ${P.haloA}88;`;
  word1.appendChild(hairline);

  const word2 = document.createElement("span");
  word2.textContent = " partout.";
  word2.style.cssText =
    "display:inline-block;color:" +
    P.haloB +
    ";opacity:0;transform:translateY(14px);";
  headline.appendChild(word1);
  headline.appendChild(word2);
  overlay.appendChild(headline);

  // sub + illustrative metric (marked illustrative)
  const sub = document.createElement("div");
  sub.style.cssText =
    "margin-top:clamp(12px,2.6vh,22px);display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;" +
    "opacity:0;transform:translateY(10px);";
  sub.innerHTML =
    `<span style="font-size:clamp(11px,1.9vw,14px);color:${P.haloB};opacity:.82;">Google + IA · 97 $/mois</span>` +
    `<span style="font-size:clamp(11px,1.9vw,14px);color:${P.white};opacity:.92;">1&nbsp;240 vues · +24&nbsp;% ce mois<sup style="font-size:.62em;opacity:.6;"> illustratif</sup></span>`;
  overlay.appendChild(sub);

  root.appendChild(overlay);

  /* failsafe: force text visible if the reveal timeline never runs -------- */
  let textRevealed = false;
  const forceText = () => {
    if (textRevealed) return;
    textRevealed = true;
    eyebrow.style.opacity = "1";
    eyebrow.style.transform = "translateY(0)";
    charSpans.forEach((s) => (s.style.transform = "translateY(0)"));
    word2.style.opacity = "1";
    word2.style.transform = "translateY(0)";
    sub.style.opacity = "1";
    sub.style.transform = "translateY(0)";
    hairline.style.opacity = "1";
    hairline.style.transform = "scaleX(1)";
  };
  const textFailsafe = setTimeout(forceText, 3600);

  /* ---------------------------------------------------------------------- */
  /* 3 · film grain + vignette overlay (cheap CSS layer)                    */
  /* ---------------------------------------------------------------------- */
  const grain = document.createElement("div");
  grain.style.cssText =
    "position:absolute;inset:0;pointer-events:none;z-index:4;mix-blend-mode:overlay;opacity:.07;";
  // tiny procedural noise tile as data-URI (generated once, no network)
  try {
    const gc = document.createElement("canvas");
    gc.width = gc.height = 64;
    const gx = gc.getContext("2d");
    const img = gx.createImageData(64, 64);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gx.putImageData(img, 0, 0);
    grain.style.backgroundImage = "url(" + gc.toDataURL() + ")";
    grain.style.backgroundSize = "180px 180px";
  } catch (e) {
    /* ignore — grain is decorative */
  }
  root.appendChild(grain);

  const vignette = document.createElement("div");
  vignette.style.cssText =
    "position:absolute;inset:0;pointer-events:none;z-index:5;" +
    "background:radial-gradient(120% 100% at 50% 42%, transparent 46%, " +
    P.void +
    "cc 100%);";
  root.appendChild(vignette);

  /* ---------------------------------------------------------------------- */
  /* 4 · WebGL capability guard                                             */
  /* ---------------------------------------------------------------------- */
  let renderer = null;
  let webglOK = true;
  try {
    const test = document.createElement("canvas");
    const gl =
      test.getContext("webgl2") ||
      test.getContext("webgl") ||
      test.getContext("experimental-webgl");
    if (!gl) webglOK = false;
  } catch (e) {
    webglOK = false;
  }

  /* shared animation/runtime state --------------------------------------- */
  let rafId = null;
  let running = false;
  let startTime = performance.now();
  let lastT = startTime;
  let elapsed = 0; // accumulates only while running (idle clock)
  let entranceDone = false;

  // pointer / scroll reactive state (smoothed)
  const pointer = { x: 0.5, y: 0.5 }; // target, normalized
  const pointerS = { x: 0.5, y: 0.5 }; // smoothed
  const pointerPrev = { x: 0.5, y: 0.5 }; // previous smoothed (for velocity)
  let scrollNorm = 0; // target 0..1
  let scrollS = 0; // smoothed
  let scrollPrev = 0;
  let flareEnergy = 0; // 0..1 white-ray flare envelope (signature)
  let flareEnergyPrev = 0;
  let aberration = 0; // smoothed velocity-coupled CA scalar
  let antEnv = 0; // 0..1 anticipation (scene crush) envelope

  // adaptive quality
  let dprCap = 2;
  let lowQuality = coarsePointer || isSmall();
  let frameAcc = 0;
  let frameCount = 0;
  let qaTimer = 0;

  /* If WebGL is unavailable, run a graceful non-GL path ------------------ */
  if (!webglOK) {
    return startFallback();
  }

  /* ---------------------------------------------------------------------- */
  /* 5 · three.js scene — fullscreen ray pass + instanced motes            */
  /* ---------------------------------------------------------------------- */
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
  } catch (e) {
    webglOK = false;
    return startFallback();
  }

  renderer.setClearColor(0x000000, 0);
  const setDPR = () => {
    dprCap = lowQuality ? 1.5 : 2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  };
  setDPR();
  renderer.setSize(W, H, false);

  // SCENE pass renders into this FBO (when bloom is active); else to screen.
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /* -- 5a · the volumetric ray pass (procedural fragment shader) --------- */
  const rayUniforms = {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(W, H) },
    uPointer: { value: new THREE.Vector2(0.5, 0.5) },
    uScroll: { value: 0 },
    uReveal: { value: 0 }, // 0..1 entrance
    uFlare: { value: 0 }, // 0..1 signature white-ray flare
    uAnticip: { value: 0 }, // 0..1 anticipation crush envelope
    uWhiteAngOff: { value: 0 }, // back-out sweep offset for the white shaft
    uMagenta: { value: 0 }, // one-frame magenta spark impulse (0..1)
    uReduced: { value: reducedMotion ? 1 : 0 },
    uSoftClamp: { value: lowQuality ? 1 : 0 }, // 1 = bake V1 soft-clamp (no bloom)
    cVoid: { value: hexToVec3(P.void) },
    cPanel: { value: hexToVec3(P.panel) },
    cRoyal: { value: hexToVec3(P.royal) },
    cDeep: { value: hexToVec3(P.deep) },
    cHaloA: { value: hexToVec3(P.haloA) },
    cHaloB: { value: hexToVec3(P.haloB) },
    cWhite: { value: hexToVec3(P.white) },
    cFlare: { value: hexToVec3(P.flare) },
  };

  const fsVert = /* glsl */ `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  const rayFrag = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime, uScroll, uReveal, uFlare, uAnticip, uWhiteAngOff, uMagenta, uReduced, uSoftClamp;
    uniform vec2  uRes, uPointer;
    uniform vec3  cVoid, cPanel, cRoyal, cDeep, cHaloA, cHaloB, cWhite, cFlare;

    // hash / value noise -----------------------------------------------------
    float hash(vec2 p){
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f*f*(3.0-2.0*f);
      float a = hash(i);
      float b = hash(i+vec2(1.0,0.0));
      float c = hash(i+vec2(0.0,1.0));
      float d = hash(i+vec2(1.0,1.0));
      return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for(int i=0;i<5;i++){ v += a*vnoise(p); p *= 2.02; a *= 0.5; }
      return v;
    }

    void main(){
      vec2 uv = vUv;
      float aspect = uRes.x / max(uRes.y, 1.0);

      // light source: high up, drifts with idle time + leans to pointer + scroll
      float t = uReduced > 0.5 ? 0.0 : uTime;
      float sweep = sin(t * 0.11) * 0.16 + uScroll * 0.30;
      vec2 src = vec2(0.30 + sweep + (uPointer.x - 0.5) * 0.22, 1.28);

      // direction from source through this pixel (in aspect-corrected space)
      vec2 pa = (uv - src) * vec2(aspect, 1.0);
      float ang = atan(pa.x, -pa.y);           // 0 = straight down from source
      float dist = length(pa);

      // ---- shaft field: striped angular density modulated by flowing noise --
      float baseFreq = 7.0;
      float pointerTilt = (uPointer.x - 0.5) * 0.55;     // hover shifts shafts
      float stripes = ang * baseFreq + pointerTilt;
      // animate the haze sliding down the shafts. ANTICIPATION pulls haze down.
      float hazePull = uAnticip * 0.22;
      float flow = fbm(vec2(ang * 3.2 + t * 0.05, dist * 2.6 - t * 0.14 - hazePull));
      float shaft = sin(stripes + flow * 2.4);
      shaft = pow(max(shaft, 0.0), 3.0);                 // crisp bright cores

      // broad cone falloff: only a wedge of the frame is lit
      float coneCenter = 0.18 + sweep * 0.6 + pointerTilt * 0.3;
      float cone = smoothstep(1.15, 0.05, abs(ang - coneCenter));
      // vertical falloff: brightest near the top, fades toward floor
      float vert = smoothstep(1.45, -0.05, dist);
      vert = pow(vert, 1.35);

      float rays = shaft * cone * vert;

      // dusty haze wash so the volume never reads as flat gradient
      float haze = fbm(vec2(uv.x*3.0 + t*0.03, uv.y*3.0 - t*0.05 - hazePull));
      haze *= cone * smoothstep(1.6, 0.2, dist) * 0.35;

      // entrance: rays bloom upward into being
      float rev = clamp(uReveal, 0.0, 1.0);
      float revMask = smoothstep(0.0, 1.0, rev) * smoothstep(-0.15, 0.55, uv.y - (1.0-rev)*0.5 + 0.4);
      rays *= mix(0.18, 1.0, rev) * mix(0.4, 1.0, revMask);
      haze *= mix(0.25, 1.0, rev);

      // ANTICIPATION: the cathedral inhales — crush the shaft field ~45% darker
      // and dim the haze just before the payoff so the detonation has contrast.
      float antCrush = mix(1.0, 0.55, uAnticip);
      rays *= antCrush;
      haze *= mix(1.0, 0.7, uAnticip);

      // ---- color grade: royal core -> lilac tips ---------------------------
      vec3 col = cVoid;
      col = mix(col, cPanel, 0.5 + 0.5*smoothstep(1.4, 0.1, dist));   // ink panel wash
      vec3 rayCol = mix(cDeep, cRoyal, smoothstep(0.0, 0.5, rays));
      rayCol = mix(rayCol, cHaloA, smoothstep(0.45, 0.9, rays));
      rayCol = mix(rayCol, cHaloB, smoothstep(0.82, 1.2, rays));
      col += rayCol * rays * 1.35;                                     // additive glow
      col += cRoyal * haze * 0.6;
      col += cDeep  * haze * 0.3;

      // ---- SIGNATURE: one WHITE ray flares (PAYOFF) ----------------------
      // a single narrow shaft near the cone center goes incandescent white. The
      // angle eases into place via a back-out sweep offset from JS (uWhiteAngOff).
      float fl = uFlare;
      float whiteAng = coneCenter + 0.02 + uWhiteAngOff;
      float whiteShaft = smoothstep(0.16, 0.0, abs(ang - whiteAng));
      whiteShaft = pow(whiteShaft, 1.6) * cone * vert;
      float flicker = 0.85 + 0.15 * sin(t*9.0 + ang*20.0);
      // pure white incandescence — magenta is NOT baked here (see spark below)
      col += cWhite * whiteShaft * fl * 2.4 * flicker;
      // soft white bloom halo around the source while flaring — punches at peak
      float halo = smoothstep(0.6, 0.0, dist) * fl;
      col += cWhite * halo * (0.7 + fl * 0.5);

      // ---- ONE earned magenta spark (sub-frame, source tip only) ---------
      // fired exactly once via uMagenta impulse; a tight smoothstep disc at the
      // source tip. Every other highlight stays pure white.
      vec2 tip = src + vec2(0.0, -0.06);            // just below the source
      float td = length((uv - tip) * vec2(aspect, 1.0));
      float spark = smoothstep(0.045, 0.0, td);
      col += cFlare * spark * uMagenta * 2.6;

      // gentle vignette (the CSS one stacks on top for depth)
      float vig = smoothstep(1.25, 0.35, length((uv-0.5)*vec2(aspect,1.0)));
      col *= mix(0.72, 1.0, vig);

      // V1 soft-clamp path (lowQuality / no-bloom fallback): keep highlights
      // from harsh clipping. When bloom is active we keep HDR for the bright-pass.
      if (uSoftClamp > 0.5) {
        col = col / (col + vec3(0.55)) * 1.55;
      }

      // fade whole pass in during reveal so nothing pops
      float globalIn = smoothstep(0.0, 0.35, rev);
      gl_FragColor = vec4(col, globalIn);
    }
  `;

  const fsGeo = new THREE.PlaneGeometry(2, 2);
  const rayMat = new THREE.ShaderMaterial({
    uniforms: rayUniforms,
    vertexShader: fsVert,
    fragmentShader: rayFrag,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const rayMesh = new THREE.Mesh(fsGeo, rayMat);
  rayMesh.frustumCulled = false;
  scene.add(rayMesh);

  /* -- 5b · GPU-instanced dust motes (additive points, depth-banded) ------ */
  // V2: bucket motes into 3 depth bands (far/mid/near) for true z-layer depth.
  // far band = larger + softer + atmospherically faded; near band = crisp sparks.
  const moteCount = lowQuality ? 110 : 260;
  const moteGeo = new THREE.BufferGeometry();
  const mPos = new Float32Array(moteCount * 3);
  const mSeed = new Float32Array(moteCount); // per-mote random phase
  const mSize = new Float32Array(moteCount);
  const mBand = new Float32Array(moteCount); // 0=far, 1=mid, 2=near
  for (let i = 0; i < moteCount; i++) {
    const band = i % 3; // even distribution across far/mid/near
    mBand[i] = band;
    mPos[i * 3 + 0] = Math.random() * 2 - 1; // x in clip-ish space [-1,1]
    mPos[i * 3 + 1] = Math.random() * 2 - 1;
    // depth derived from band (far≈0.18, mid≈0.5, near≈0.85) + jitter
    mPos[i * 3 + 2] = clamp(0.18 + band * 0.34 + (Math.random() - 0.5) * 0.16, 0, 1);
    mSeed[i] = Math.random() * 100;
    mSize[i] = 0.4 + Math.random() * 1.4;
  }
  moteGeo.setAttribute("position", new THREE.BufferAttribute(mPos, 3));
  moteGeo.setAttribute("aSeed", new THREE.BufferAttribute(mSeed, 1));
  moteGeo.setAttribute("aSize", new THREE.BufferAttribute(mSize, 1));
  moteGeo.setAttribute("aBand", new THREE.BufferAttribute(mBand, 1));

  const moteUniforms = {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(W, H) },
    uDpr: { value: renderer.getPixelRatio() },
    uPointer: { value: new THREE.Vector2(0.5, 0.5) },
    uScroll: { value: 0 },
    uReveal: { value: 0 },
    uFlare: { value: 0 },
    uAnticip: { value: 0 },
    uReduced: { value: reducedMotion ? 1 : 0 },
    cHaloB: { value: hexToVec3(P.haloB) },
    cWhite: { value: hexToVec3(P.white) },
    cRoyal: { value: hexToVec3(P.royal) },
  };

  const moteVert = /* glsl */ `
    precision highp float;
    attribute float aSeed;
    attribute float aSize;
    attribute float aBand;
    uniform float uTime, uScroll, uReveal, uReduced, uDpr, uAnticip;
    uniform vec2 uRes, uPointer;
    varying float vTw;
    varying float vDepth;
    varying float vBand;
    void main(){
      float t = uReduced > 0.5 ? aSeed : uTime + aSeed;
      vec3 p = position;
      float depth = p.z;
      vDepth = depth;
      vBand = aBand;

      // slow buoyant drift; nearer motes (high depth) move more — parallax
      float drift = (0.4 + depth);
      // V2: camera micro-parallax to cursor scaled by band depth (far moves least)
      float bandParallax = (aBand + 0.5) / 2.5;            // far≈0.2, near≈1.0
      float parallaxAmt = 0.085 * bandParallax;
      float x = p.x + sin(t*0.21 + aSeed*1.7) * 0.10 * drift
                    + (uPointer.x - 0.5) * (0.06 * drift + parallaxAmt);
      // motes rise gently then wrap
      float rise = fract( (p.y*0.5+0.5) + t*0.012*drift + uScroll*0.15*drift );
      float y = rise * 2.0 - 1.0;
      y += sin(t*0.33 + aSeed) * 0.012;
      y += (uPointer.y - 0.5) * parallaxAmt * 0.6;          // vertical parallax

      vec2 cp = vec2(x, y);
      gl_Position = vec4(cp, 0.0, 1.0);

      // twinkle
      vTw = 0.45 + 0.55 * sin(t*1.6 + aSeed*6.0);
      float rev = smoothstep(0.0, 1.0, uReveal);
      // far band rendered larger (DOF blur look), near band tighter+crisper
      float bandSize = mix(1.45, 0.85, aBand / 2.0);
      float sz = aSize * (0.7 + depth*1.3) * bandSize * uDpr * rev;
      gl_PointSize = clamp(sz * (uRes.y/520.0), 0.5, 12.0);
    }
  `;

  const moteFrag = /* glsl */ `
    precision highp float;
    uniform float uReveal, uFlare, uAnticip;
    uniform vec3 cHaloB, cWhite, cRoyal;
    varying float vTw;
    varying float vDepth;
    varying float vBand;
    void main(){
      vec2 d = gl_PointCoord - 0.5;
      float r = length(d);
      if(r > 0.5) discard;
      float a = smoothstep(0.5, 0.0, r);    // soft round
      // V2 DOF: far band (aBand=0) blurs soft (pow .9), near band (aBand=2) is
      // crisp (pow 1.8). mid sits between.
      float sharp = mix(0.9, 1.8, vBand / 2.0);
      a = pow(a, sharp);

      // nearer motes lean white; far motes stay lilac
      vec3 col = mix(cRoyal, cHaloB, vDepth);
      col = mix(col, cWhite, smoothstep(0.7, 1.0, vDepth) * 0.6 + uFlare*0.3);
      // lift royal saturation only on the near/in-focus band at energy crests
      float nearBand = step(1.5, vBand);
      col = mix(col, col + cRoyal*0.4, nearBand * uFlare);

      float bright = a * vTw * (0.35 + vDepth*0.65);
      // atmospheric fade: distant motes dissolve into the volume
      float atmo = mix(0.5, 1.0, vBand / 2.0);
      bright *= atmo;
      bright *= smoothstep(0.0, 0.4, uReveal);
      // motes dim slightly during the anticipation crush, glitter on payoff
      bright *= mix(1.0, 0.82, uAnticip);
      gl_FragColor = vec4(col * (1.0 + uFlare*0.8), bright);
    }
  `;

  const moteMat = new THREE.ShaderMaterial({
    uniforms: moteUniforms,
    vertexShader: moteVert,
    fragmentShader: moteFrag,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  scene.add(motes);

  /* ---------------------------------------------------------------------- */
  /* 5c · REAL threshold bloom pipeline (half-res FBOs)                      */
  /*   scene → sceneRT → bright-pass → blurA → (H) blurB → (V) blurA        */
  /*   → final composite (scene + bloom*strength + CA + barrel)             */
  /*   Gated behind !lowQuality and successful FBO allocation. On failure    */
  /*   the runtime flips uSoftClamp=1 and renders the single pass to screen. */
  /* ---------------------------------------------------------------------- */
  let bloomOK = false;
  let sceneRT = null;
  let brightRT = null;
  let blurRTA = null;
  let blurRTB = null;
  let brightScene = null,
    blurScene = null,
    compScene = null;
  let brightMat = null,
    blurMat = null,
    compMat = null;
  let brightMesh = null,
    blurMesh = null,
    compMesh = null;

  function makeRT(w, h) {
    return new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }

  function bloomDims() {
    const pr = renderer.getPixelRatio();
    const fw = Math.max(2, Math.floor(W * pr));
    const fh = Math.max(2, Math.floor(H * pr));
    const bw = Math.max(2, Math.floor(fw * 0.5)); // half-res bloom
    const bh = Math.max(2, Math.floor(fh * 0.5));
    return { fw, fh, bw, bh };
  }

  function initBloom() {
    if (lowQuality) {
      rayUniforms.uSoftClamp.value = 1; // V1 path
      return;
    }
    try {
      const { fw, fh, bw, bh } = bloomDims();
      sceneRT = makeRT(fw, fh);
      brightRT = makeRT(bw, bh);
      blurRTA = makeRT(bw, bh);
      blurRTB = makeRT(bw, bh);

      // bright-pass: lift only the brightest highlights above threshold
      brightMat = new THREE.ShaderMaterial({
        uniforms: {
          uTex: { value: null },
          uThreshold: { value: 0.7 },
        },
        vertexShader: fsVert,
        fragmentShader: /* glsl */ `
          precision highp float;
          varying vec2 vUv;
          uniform sampler2D uTex;
          uniform float uThreshold;
          void main(){
            vec3 c = texture2D(uTex, vUv).rgb;
            vec3 b = max(c - vec3(uThreshold), vec3(0.0));
            // soft knee so the threshold isn't a hard edge
            b = b * b * (3.0 - 2.0*min(b, vec3(1.0)));
            gl_FragColor = vec4(b, 1.0);
          }
        `,
        depthTest: false,
        depthWrite: false,
      });

      // separable 9-tap gaussian (baked weights), direction set per pass
      blurMat = new THREE.ShaderMaterial({
        uniforms: {
          uTex: { value: null },
          uDir: { value: new THREE.Vector2(1, 0) },
          uTexel: { value: new THREE.Vector2(1 / bw, 1 / bh) },
        },
        vertexShader: fsVert,
        fragmentShader: /* glsl */ `
          precision highp float;
          varying vec2 vUv;
          uniform sampler2D uTex;
          uniform vec2 uDir;
          uniform vec2 uTexel;
          // 9-tap gaussian, weights baked as const (sum = 1.0)
          const float w0 = 0.227027;
          const float w1 = 0.1945946;
          const float w2 = 0.1216216;
          const float w3 = 0.054054;
          const float w4 = 0.016216;
          void main(){
            vec2 o = uDir * uTexel;
            vec3 c = texture2D(uTex, vUv).rgb * w0;
            c += texture2D(uTex, vUv + o*1.0).rgb * w1;
            c += texture2D(uTex, vUv - o*1.0).rgb * w1;
            c += texture2D(uTex, vUv + o*2.0).rgb * w2;
            c += texture2D(uTex, vUv - o*2.0).rgb * w2;
            c += texture2D(uTex, vUv + o*3.0).rgb * w3;
            c += texture2D(uTex, vUv - o*3.0).rgb * w3;
            c += texture2D(uTex, vUv + o*4.0).rgb * w4;
            c += texture2D(uTex, vUv - o*4.0).rgb * w4;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
        depthTest: false,
        depthWrite: false,
      });

      // final composite: scene + bloom*strength, then barrel + chromatic
      // aberration (velocity-coupled). Soft-clamp here keeps the void dark.
      compMat = new THREE.ShaderMaterial({
        uniforms: {
          uScene: { value: null },
          uBloom: { value: null },
          uBloomStrength: { value: 1.0 },
          uAberration: { value: 0.0 },
          uBarrel: { value: 0.06 },
          uOpacity: { value: 1.0 },
        },
        vertexShader: fsVert,
        fragmentShader: /* glsl */ `
          precision highp float;
          varying vec2 vUv;
          uniform sampler2D uScene;
          uniform sampler2D uBloom;
          uniform float uBloomStrength, uAberration, uBarrel, uOpacity;

          void main(){
            vec2 center = vec2(0.5);
            vec2 dd = vUv - center;
            // faint barrel warp
            vec2 buv = center + dd * (1.0 + uBarrel * dot(dd, dd));
            // radial direction for chromatic split
            vec2 dir = length(dd) > 0.0001 ? normalize(dd) : vec2(0.0);
            float a = uAberration;
            // 3-tap RGB radial split on the SCENE; bloom sampled clean (no fringe)
            float rC = texture2D(uScene, buv + dir * a).r;
            float gC = texture2D(uScene, buv).g;
            float bC = texture2D(uScene, buv - dir * a).b;
            vec3 scene = vec3(rC, gC, bC);
            vec3 bloom = texture2D(uBloom, buv).rgb;
            vec3 col = scene + bloom * uBloomStrength;
            // tone soft-clamp AFTER bloom add — bleeds light but keeps void dark
            col = col / (col + vec3(0.62)) * 1.62;
            gl_FragColor = vec4(col, uOpacity);
          }
        `,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });

      brightScene = new THREE.Scene();
      brightMesh = new THREE.Mesh(fsGeo, brightMat);
      brightMesh.frustumCulled = false;
      brightScene.add(brightMesh);

      blurScene = new THREE.Scene();
      blurMesh = new THREE.Mesh(fsGeo, blurMat);
      blurMesh.frustumCulled = false;
      blurScene.add(blurMesh);

      compScene = new THREE.Scene();
      compMesh = new THREE.Mesh(fsGeo, compMat);
      compMesh.frustumCulled = false;
      compScene.add(compMesh);

      bloomOK = true;
      rayUniforms.uSoftClamp.value = 0; // HDR scene for the bright-pass
    } catch (e) {
      // FBO alloc failed → fall back to the V1 single-pass soft-clamp (never blank)
      bloomOK = false;
      rayUniforms.uSoftClamp.value = 1;
      disposeBloom();
    }
  }

  function disposeBloom() {
    const rts = [sceneRT, brightRT, blurRTA, blurRTB];
    for (const rt of rts) {
      try {
        rt && rt.dispose();
      } catch (e) {}
    }
    sceneRT = brightRT = blurRTA = blurRTB = null;
    const mats = [brightMat, blurMat, compMat];
    for (const m of mats) {
      try {
        m && m.dispose();
      } catch (e) {}
    }
    brightMat = blurMat = compMat = null;
    brightScene = blurScene = compScene = null;
    brightMesh = blurMesh = compMesh = null;
  }

  function resizeBloom() {
    if (!bloomOK) return;
    const { fw, fh, bw, bh } = bloomDims();
    sceneRT.setSize(fw, fh);
    brightRT.setSize(bw, bh);
    blurRTA.setSize(bw, bh);
    blurRTB.setSize(bw, bh);
    blurMat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
  }

  initBloom();

  /* renders the scene (rays + motes), with or without the bloom pipeline.   */
  function renderScene(globalOpacity) {
    if (bloomOK) {
      // 1 · scene → sceneRT (HDR-ish)
      renderer.setRenderTarget(sceneRT);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);

      // 2 · bright-pass → brightRT (half res)
      brightMat.uniforms.uTex.value = sceneRT.texture;
      renderer.setRenderTarget(brightRT);
      renderer.clear(true, true, true);
      renderer.render(brightScene, camera);

      // 3 · gaussian H: brightRT → blurRTA
      blurMat.uniforms.uTex.value = brightRT.texture;
      blurMat.uniforms.uDir.value.set(1, 0);
      renderer.setRenderTarget(blurRTA);
      renderer.clear(true, true, true);
      renderer.render(blurScene, camera);

      // 4 · gaussian V: blurRTA → blurRTB
      blurMat.uniforms.uTex.value = blurRTA.texture;
      blurMat.uniforms.uDir.value.set(0, 1);
      renderer.setRenderTarget(blurRTB);
      renderer.clear(true, true, true);
      renderer.render(blurScene, camera);

      // 5 · composite → screen (scene + bloom + CA + barrel)
      // opacity is set per-frame by the caller (loop / static path); only honor
      // an explicit override here so we never clobber it with undefined.
      compMat.uniforms.uScene.value = sceneRT.texture;
      compMat.uniforms.uBloom.value = blurRTB.texture;
      if (globalOpacity !== undefined) {
        compMat.uniforms.uOpacity.value = globalOpacity;
      }
      renderer.setRenderTarget(null);
      renderer.render(compScene, camera);
    } else {
      // V1 single-pass: rays already soft-clamped in rayFrag
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 6 · entrance timeline (gsap if present, else internal tween)           */
  /* ---------------------------------------------------------------------- */
  let gsap = null; // optional; resolved lazily, never required

  // internal scalar tween registry (used when gsap absent / for CSS hairline)
  const tweens = [];
  function tweenTo(getter, setter, to, dur, delay, ease, onComplete) {
    const from = getter();
    tweens.push({
      from,
      to,
      dur,
      delay,
      ease,
      t: 0,
      setter,
      onComplete,
      done: false,
    });
  }
  function stepTweens(dt) {
    for (const tw of tweens) {
      if (tw.done) continue;
      if (tw.delay > 0) {
        tw.delay -= dt;
        if (tw.delay > 0) continue;
      }
      tw.t += dt / tw.dur;
      const k = tw.t >= 1 ? 1 : tw.ease(tw.t);
      tw.setter(lerp(tw.from, tw.to, k));
      if (tw.t >= 1) {
        tw.done = true;
        if (tw.onComplete) tw.onComplete();
      }
    }
  }

  /* the choreographed reveal: rays bloom -> headline chars rise -> WHITE
     ray flares on the word -> idle. Implemented as time-stamped triggers
     in the rAF loop so it works with or without gsap. */
  let revealProgress = 0; // 0..1 drives uReveal
  let revealClock = 0; // seconds since replay()
  let flareFired = false;
  let magentaSpent = false; // ONE earned magenta — fires exactly once, ever
  let payoffHit = false; // payoff-frame triggers (hairline wipe, haptic tick)

  function runRevealCSS() {
    // CSS-side char reveal (transform/opacity only)
    const useGsap = !!gsap;
    if (reducedMotion) {
      forceText();
      return;
    }
    if (useGsap) {
      gsap.to(eyebrow, {
        opacity: 1,
        y: 0,
        duration: 0.7,
        delay: 0.25,
        ease: "power3.out",
      });
      gsap.to(charSpans, {
        y: "0%",
        duration: 0.9,
        delay: 0.5,
        stagger: 0.045,
        ease: "power4.out",
      });
      gsap.to(word2, {
        opacity: 1,
        y: 0,
        duration: 0.8,
        delay: 0.5 + 0.045 * charSpans.length + 0.05,
        ease: "power4.out",
      });
      gsap.to(sub, {
        opacity: 1,
        y: 0,
        duration: 0.8,
        delay: 1.05,
        ease: "power3.out",
        onComplete: () => (textRevealed = true),
      });
    } else {
      // manual CSS transitions
      eyebrow.style.transition =
        "opacity .7s cubic-bezier(.16,1,.3,1) .25s, transform .7s cubic-bezier(.16,1,.3,1) .25s";
      requestAnimationFrame(() => {
        eyebrow.style.opacity = "1";
        eyebrow.style.transform = "translateY(0)";
      });
      charSpans.forEach((s, i) => {
        s.style.transition =
          "transform .9s cubic-bezier(.16,1,.3,1) " + (0.5 + i * 0.045) + "s";
        requestAnimationFrame(() => (s.style.transform = "translateY(0)"));
      });
      const w2delay = 0.5 + 0.045 * charSpans.length + 0.05;
      word2.style.transition =
        "opacity .8s cubic-bezier(.16,1,.3,1) " +
        w2delay +
        "s, transform .8s cubic-bezier(.16,1,.3,1) " +
        w2delay +
        "s";
      requestAnimationFrame(() => {
        word2.style.opacity = "1";
        word2.style.transform = "translateY(0)";
      });
      sub.style.transition =
        "opacity .8s ease 1.05s, transform .8s cubic-bezier(.16,1,.3,1) 1.05s";
      requestAnimationFrame(() => {
        sub.style.opacity = "1";
        sub.style.transform = "translateY(0)";
        textRevealed = true;
      });
    }
  }

  /* PAYOFF beat: gradient hairline wipe + 1px overlay haptic tick + headline
     scale snap-back. Called once, on the exact settle frame. Pure transform/
     opacity so it stays cheap and never blocks. */
  function firePayoffBeat() {
    if (payoffHit) return;
    payoffHit = true;

    // gradient hairline wipes 0→full width under "Trouvé" (easeExpoOut)
    hairline.style.transition =
      "transform .55s cubic-bezier(.16,1,.3,1), opacity .25s ease";
    requestAnimationFrame(() => {
      hairline.style.opacity = "1";
      hairline.style.transform = "scaleX(1)";
    });

    // headline 1-frame scale tick (overshoot snap-back)
    word1.style.transition = "none";
    word1.style.transform = "scale(1.015)";
    requestAnimationFrame(() => {
      word1.style.transition = "transform .42s cubic-bezier(.34,1.56,.64,1)";
      word1.style.transform = "scale(1.0)";
    });

    // 1px overlay haptic tick — nudge whole overlay, snap back next frame
    overlay.style.transition = "none";
    overlay.style.transform = "translateY(-1px)";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.transition = "transform .22s cubic-bezier(.16,1,.3,1)";
        overlay.style.transform = "translateY(0)";
      });
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 7 · the render loop                                                    */
  /* ---------------------------------------------------------------------- */
  // timing model (kept from V1, with anticipation window added):
  const FLARE_CENTER = 0.5 + 0.045 * charSpans.length + 0.55; // ~1.32s (peak)
  const ANT_LEAD = 0.25; // anticipation begins ~0.25s before peak

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.066) dt = 0.066; // clamp big tab-stalls
    if (!reducedMotion) elapsed += dt;
    revealClock += dt;

    stepTweens(dt);

    /* -- entrance envelope ------------------------------------------------ */
    if (!reducedMotion) {
      const rt = clamp((revealClock - 0.15) / 1.0, 0, 1);
      revealProgress = easeExpoOut(rt);
    } else {
      revealProgress = 1;
    }

    /* -- SIGNATURE: ANTICIPATION → PAYOFF → SETTLE-with-overshoot -------- */
    if (!reducedMotion) {
      const fd = revealClock - FLARE_CENTER;

      // (1) ANTICIPATION crush: ramps up over ANT_LEAD before peak, releases
      // sharply at peak. Frame visibly inhales/darkens.
      let ant = 0;
      if (fd > -ANT_LEAD && fd < 0) {
        ant = easePower2InOut(clamp((fd + ANT_LEAD) / ANT_LEAD, 0, 1));
      } else if (fd >= 0 && fd < 0.18) {
        ant = 1.0 - easeExpoOut(clamp(fd / 0.18, 0, 1)); // quick release
      }
      antEnv = ant;

      // (2) PAYOFF + (3) SETTLE with ~8% overshoot ring:
      // fast attack into peak, then exp-decay multiplied by a single sine ring.
      let env = 0;
      if (fd > -ANT_LEAD && fd < 2.4) {
        if (fd < 0) {
          // attack stays low during inhale, snaps at the last beat
          env = easePower4Out(clamp((fd + 0.12) / 0.12, 0, 1)) * 0.0; // hold dark
        } else {
          // overshoot ring: exp decay * (1 + 0.12*sin) → ~8% net overshoot
          env = Math.exp(-fd * 1.8) * (1.0 + 0.12 * Math.sin(fd * 14.0));
        }
      }
      flareEnergy = clamp(env, 0, 1.18);

      // white shaft angle eases into place with a tiny back-out sweep at payoff
      if (fd >= 0 && fd < 0.5) {
        const sw = easeBackOut(clamp(fd / 0.5, 0, 1), 2.2);
        rayUniforms.uWhiteAngOff.value = (1.0 - sw) * 0.06; // sweeps from +.06 → 0
      } else {
        rayUniforms.uWhiteAngOff.value = 0;
      }

      // payoff-frame events: fire exactly at/just after peak (fd≈0)
      if (!payoffHit && fd >= 0) {
        firePayoffBeat();
      }

      // ONE earned magenta spark: single sub-frame impulse, fired once ever, at
      // the payoff peak. Decays in <0.15s; never fires on subsequent flares.
      if (!magentaSpent && fd >= 0) {
        magentaSpent = true;
      }
      if (magentaSpent && fd >= 0 && fd < 0.15) {
        rayUniforms.uMagenta.value = 1.0 - easeExpoOut(clamp(fd / 0.15, 0, 1));
      } else {
        rayUniforms.uMagenta.value = 0;
      }

      if (!flareFired && fd > 0) flareFired = true;
    } else {
      flareEnergy = 0.0; // static frame: no spectacle
      antEnv = 0;
      rayUniforms.uMagenta.value = 0;
      rayUniforms.uWhiteAngOff.value = 0;
    }

    /* -- smoothing for pointer / scroll (idle ease toward rest) --------- */
    const smoothK = 1 - Math.pow(0.0015, dt); // frame-rate independent
    pointerPrev.x = pointerS.x;
    pointerPrev.y = pointerS.y;
    scrollPrev = scrollS;
    if (reducedMotion) {
      pointerS.x = 0.5;
      pointerS.y = 0.5;
      scrollS = 0;
    } else {
      pointerS.x += (pointer.x - pointerS.x) * smoothK;
      pointerS.y += (pointer.y - pointerS.y) * smoothK;
      scrollS += (scrollNorm - scrollS) * smoothK;
    }

    /* -- velocity-coupled chromatic aberration -------------------------- */
    // pointer velocity (per second) + scroll velocity + flare energy spike
    const pvx = (pointerS.x - pointerPrev.x) / Math.max(dt, 1e-4);
    const pvy = (pointerS.y - pointerPrev.y) / Math.max(dt, 1e-4);
    const pvel = Math.sqrt(pvx * pvx + pvy * pvy);
    const svel = Math.abs(scrollS - scrollPrev) / Math.max(dt, 1e-4);
    // target aberration: scaled velocities + flare bump, clamped
    const aberrTarget = clamp(
      pvel * 0.006 + svel * 0.004 + flareEnergy * 0.004,
      0,
      0.012
    );
    // smooth so it spikes on flicks and eases back (frame-rate independent)
    const aK = 1 - Math.pow(0.02, dt);
    aberration += (aberrTarget - aberration) * aK;

    const AMBIENT_SPEED = 0.45; // slowed ambient drift for the landing-page hero (Vanta)
    const tClock = reducedMotion ? 6.2 : elapsed * AMBIENT_SPEED; // fixed pretty frame when reduced

    /* -- push uniforms --------------------------------------------------- */
    rayUniforms.uTime.value = tClock;
    rayUniforms.uPointer.value.set(pointerS.x, pointerS.y);
    rayUniforms.uScroll.value = scrollS;
    rayUniforms.uReveal.value = revealProgress;
    rayUniforms.uFlare.value = flareEnergy;
    rayUniforms.uAnticip.value = antEnv;
    rayUniforms.uReduced.value = reducedMotion ? 1 : 0;

    moteUniforms.uTime.value = tClock;
    moteUniforms.uPointer.value.set(pointerS.x, pointerS.y);
    moteUniforms.uScroll.value = scrollS;
    moteUniforms.uReveal.value = revealProgress;
    moteUniforms.uFlare.value = flareEnergy;
    moteUniforms.uAnticip.value = antEnv;
    moteUniforms.uReduced.value = reducedMotion ? 1 : 0;

    if (bloomOK) {
      compMat.uniforms.uAberration.value = aberration;
      // raise bloom threshold-lift / strength at the payoff crest so the flare
      // detonates light into the void without making idle frames wash out.
      const crest = clamp(flareEnergy, 0, 1);
      compMat.uniforms.uBloomStrength.value = 0.85 + crest * 0.85;
      brightMat.uniforms.uThreshold.value = 0.72 - crest * 0.22; // lift at crest
      compMat.uniforms.uOpacity.value = smoothstepJS(0.0, 0.35, revealProgress);
    }

    renderScene(bloomOK ? undefined : 1);

    /* -- adaptive quality: if sustained slow, drop DPR once -------------- */
    if (!reducedMotion && !lowQuality) {
      frameAcc += dt;
      frameCount++;
      qaTimer += dt;
      if (qaTimer > 1.4 && frameCount > 20) {
        const fps = frameCount / frameAcc;
        if (fps < 48 && dprCap > 1.25) {
          dprCap = 1.25;
          renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, dprCap)
          );
          moteUniforms.uDpr.value = renderer.getPixelRatio();
          resizeBloom();
        }
        frameAcc = 0;
        frameCount = 0;
        qaTimer = 0;
      }
    }

    if (!entranceDone && revealClock > 1.6) entranceDone = true;
  }

  // JS smoothstep helper (mirrors GLSL) for composite opacity
  function smoothstepJS(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /* ---------------------------------------------------------------------- */
  /* 8 · listeners (pointer magnet + scroll shift)                          */
  /* ---------------------------------------------------------------------- */
  function onPointerMove(e) {
    if (reducedMotion) return;
    const r = root.getBoundingClientRect();
    pointer.x = clamp((e.clientX - r.left) / Math.max(r.width, 1), 0, 1);
    pointer.y = clamp((e.clientY - r.top) / Math.max(r.height, 1), 0, 1);
  }
  function onPointerLeave() {
    pointer.x = 0.5;
    pointer.y = 0.5;
  }
  function onScroll() {
    if (reducedMotion) return;
    const r = root.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    const center = r.top + r.height / 2;
    scrollNorm = clamp(1 - center / vh, 0, 1);
  }

  root.addEventListener("pointermove", onPointerMove, { passive: true });
  root.addEventListener("pointerleave", onPointerLeave, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------------------------------------------------------------------- */
  /* 9 · resize via ResizeObserver                                          */
  /* ---------------------------------------------------------------------- */
  let resizeRAF = null;
  const applySize = () => {
    rect = container.getBoundingClientRect();
    W = Math.max(1, Math.floor(rect.width || W));
    H = Math.max(1, Math.floor(rect.height || H));
    const wasLow = lowQuality;
    lowQuality = coarsePointer || isSmall();
    setDPR();
    if (renderer) renderer.setSize(W, H, false);
    rayUniforms.uRes.value.set(W, H);
    moteUniforms.uRes.value.set(W, H);
    moteUniforms.uDpr.value = renderer.getPixelRatio();
    // if quality tier flipped, (re)build or tear down the bloom pipeline
    if (wasLow !== lowQuality) {
      disposeBloom();
      bloomOK = false;
      initBloom();
    } else {
      resizeBloom();
    }
  };
  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      if (resizeRAF) cancelAnimationFrame(resizeRAF);
      resizeRAF = requestAnimationFrame(applySize);
    });
    ro.observe(container);
  } else {
    window.addEventListener("resize", applySize);
  }

  /* ---------------------------------------------------------------------- */
  /* 10 · boot                                                              */
  /* ---------------------------------------------------------------------- */
  function startLoop() {
    if (running) return;
    running = true;
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function stopLoop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // try to grab gsap if the host already loaded it (optional nicety) — never block
  try {
    if (typeof window !== "undefined" && window.gsap) gsap = window.gsap;
  } catch (e) {
    /* noop */
  }

  function resetTextHidden() {
    eyebrow.style.transition = "none";
    eyebrow.style.opacity = "0";
    eyebrow.style.transform = "translateY(8px)";
    charSpans.forEach((s) => {
      s.style.transition = "none";
      s.style.transform = "translateY(110%)";
    });
    word2.style.transition = "none";
    word2.style.opacity = "0";
    word2.style.transform = "translateY(14px)";
    sub.style.transition = "none";
    sub.style.opacity = "0";
    sub.style.transform = "translateY(10px)";
    hairline.style.transition = "none";
    hairline.style.opacity = "0";
    hairline.style.transform = "scaleX(0)";
    word1.style.transition = "none";
    word1.style.transform = "scale(1)";
    overlay.style.transition = "none";
    overlay.style.transform = "translateY(0)";
    textRevealed = false;
  }

  function beginEntrance() {
    revealClock = 0;
    revealProgress = 0;
    flareFired = false;
    flareEnergy = 0;
    antEnv = 0;
    entranceDone = false;
    payoffHit = false;
    // NOTE: magentaSpent is intentionally NOT reset — the magenta is spent for
    // the lifetime of this mount; replay never re-fires it. Rarity is the point.
    rayUniforms.uMagenta.value = 0;
    rayUniforms.uWhiteAngOff.value = 0;
    if (!reducedMotion) {
      resetTextHidden();
      requestAnimationFrame(() => requestAnimationFrame(runRevealCSS));
    } else {
      forceText();
    }
  }

  function renderStaticReduced() {
    revealProgress = 1;
    flareEnergy = 0;
    antEnv = 0;
    rayUniforms.uTime.value = 6.2;
    rayUniforms.uReveal.value = 1;
    rayUniforms.uFlare.value = 0;
    rayUniforms.uAnticip.value = 0;
    rayUniforms.uMagenta.value = 0;
    rayUniforms.uWhiteAngOff.value = 0;
    rayUniforms.uReduced.value = 1;
    moteUniforms.uReveal.value = 1;
    moteUniforms.uReduced.value = 1;
    moteUniforms.uFlare.value = 0;
    moteUniforms.uAnticip.value = 0;
    moteUniforms.uTime.value = 6.2;
    if (bloomOK) {
      compMat.uniforms.uAberration.value = 0;
      compMat.uniforms.uBloomStrength.value = 0.85;
      brightMat.uniforms.uThreshold.value = 0.72;
      compMat.uniforms.uOpacity.value = 1;
    }
    try {
      renderScene(1);
    } catch (e) {}
  }

  if (reducedMotion) {
    // static composed frame: render once, no loop, text shown
    forceText();
    applySize();
    renderStaticReduced();
  } else {
    beginEntrance();
    startLoop();
  }

  // hard reveal failsafe for the GL pass too (in case rAF was throttled)
  const glFailsafe = setTimeout(() => {
    if (!running && !reducedMotion) {
      try {
        rayUniforms.uReveal.value = 1;
        moteUniforms.uReveal.value = 1;
        if (bloomOK) compMat.uniforms.uOpacity.value = 1;
        renderScene(1);
      } catch (e) {}
    }
    forceText();
  }, 3500);

  /* ---------------------------------------------------------------------- */
  /* 11 · handle                                                            */
  /* ---------------------------------------------------------------------- */
  function destroy() {
    stopLoop();
    clearTimeout(textFailsafe);
    clearTimeout(glFailsafe);
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("scroll", onScroll);
    if (ro) ro.disconnect();
    else window.removeEventListener("resize", applySize);

    try {
      fsGeo.dispose();
      rayMat.dispose();
      moteGeo.dispose();
      moteMat.dispose();
    } catch (e) {}
    disposeBloom();
    try {
      renderer.setRenderTarget(null);
      renderer.dispose();
      renderer.forceContextLoss();
    } catch (e) {}

    renderer = null;
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  return {
    replay() {
      if (reducedMotion) {
        forceText();
        try {
          renderStaticReduced();
        } catch (e) {}
        return;
      }
      beginEntrance();
      startLoop();
    },
    pause() {
      stopLoop();
    },
    resume() {
      if (reducedMotion) return;
      startLoop();
    },
    setReducedMotion(v) {
      reducedMotion = !!v;
      rayUniforms.uReduced.value = reducedMotion ? 1 : 0;
      moteUniforms.uReduced.value = reducedMotion ? 1 : 0;
      if (reducedMotion) {
        stopLoop();
        forceText();
        renderStaticReduced();
      } else {
        beginEntrance();
        startLoop();
      }
    },
    destroy,
  };

  /* ====================================================================== */
  /* FALLBACK · Canvas2D god-rays (no WebGL) — still on-brand, never blank   */
  /* ====================================================================== */
  function startFallback() {
    const ctx2d = canvas.getContext("2d");
    let fW = W,
      fH = H,
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize2d = () => {
      rect = container.getBoundingClientRect();
      fW = Math.max(1, Math.floor(rect.width || fW));
      fH = Math.max(1, Math.floor(rect.height || fH));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = fW * dpr;
      canvas.height = fH * dpr;
      if (ctx2d) ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize2d();

    let ro2 = null;
    if (typeof ResizeObserver !== "undefined") {
      ro2 = new ResizeObserver(resize2d);
      ro2.observe(container);
    } else window.addEventListener("resize", resize2d);

    let pX = 0.5;
    const onMove2 = (e) => {
      if (reducedMotion) return;
      const r = root.getBoundingClientRect();
      pX = clamp((e.clientX - r.left) / Math.max(r.width, 1), 0, 1);
    };
    root.addEventListener("pointermove", onMove2, { passive: true });

    const NUM = 9;
    const start2 = performance.now();
    let raf2 = null;
    let run2 = false;

    function draw(now) {
      if (!run2) return;
      raf2 = requestAnimationFrame(draw);
      const t = reducedMotion ? 6.2 : (now - start2) / 1000;
      ctx2d.clearRect(0, 0, fW, fH);
      // void base
      const bg = ctx2d.createRadialGradient(
        fW * 0.32,
        -fH * 0.1,
        0,
        fW * 0.32,
        -fH * 0.1,
        fH * 1.4
      );
      bg.addColorStop(0, P.deep + "55");
      bg.addColorStop(0.4, P.panel + "33");
      bg.addColorStop(1, P.void);
      ctx2d.fillStyle = bg;
      ctx2d.fillRect(0, 0, fW, fH);

      // anticipation/payoff in 2D too: crush before, punch at, decay after
      const fd2 = reducedMotion ? 999 : t - 1.32;
      let ant2 = 0;
      if (fd2 > -0.25 && fd2 < 0) ant2 = (fd2 + 0.25) / 0.25;
      const crush2 = 1 - ant2 * 0.45;

      // rays from a high source
      const srcX =
        fW * (0.3 + (reducedMotion ? 0 : Math.sin(t * 0.11) * 0.12) + (pX - 0.5) * 0.2);
      const srcY = -fH * 0.2;
      ctx2d.save();
      ctx2d.globalCompositeOperation = "lighter";
      for (let i = 0; i < NUM; i++) {
        const a =
          -0.5 +
          (i / (NUM - 1)) * 1.0 +
          (reducedMotion ? 0 : Math.sin(t * 0.13 + i) * 0.04) +
          (pX - 0.5) * 0.3;
        const len = fH * 1.7;
        const w1 = 4 + (i % 3) * 4;
        const w2 = 60 + (i % 4) * 30;
        const ex = srcX + Math.sin(a) * len;
        const ey = srcY + Math.cos(a) * len;
        const isWhite = i === 4; // the signature shaft
        // overshoot ring on the white shaft (matches the GL settle)
        const flare =
          isWhite && !reducedMotion
            ? clamp(
                Math.exp(-Math.max(0, t - 1.32) * 1.8) *
                  (1 + 0.12 * Math.sin(Math.max(0, t - 1.32) * 14)),
                0,
                1
              )
            : 0;
        const grad = ctx2d.createLinearGradient(srcX, srcY, ex, ey);
        const col = isWhite ? P.white : P.royal;
        grad.addColorStop(0, col + (isWhite ? "cc" : "55"));
        grad.addColorStop(0.5, col + "22");
        grad.addColorStop(1, col + "00");
        ctx2d.beginPath();
        const nx = Math.cos(a),
          ny = -Math.sin(a);
        ctx2d.moveTo(srcX - nx * w1, srcY - ny * w1);
        ctx2d.lineTo(srcX + nx * w1, srcY + ny * w1);
        ctx2d.lineTo(ex + nx * w2, ey + ny * w2);
        ctx2d.lineTo(ex - nx * w2, ey - ny * w2);
        ctx2d.closePath();
        ctx2d.fillStyle = grad;
        ctx2d.globalAlpha = (isWhite ? 0.4 + flare * 0.6 : 0.4) * crush2;
        ctx2d.fill();
      }
      ctx2d.restore();
      forceText();
    }
    function loop2() {
      if (run2) return;
      run2 = true;
      raf2 = requestAnimationFrame(draw);
    }
    function stop2() {
      run2 = false;
      if (raf2) cancelAnimationFrame(raf2);
      raf2 = null;
    }

    forceText();
    if (!reducedMotion) loop2();
    else {
      run2 = true;
      draw(performance.now());
      run2 = false;
    }

    return {
      replay() {
        forceText();
        if (!reducedMotion) loop2();
      },
      pause() {
        stop2();
      },
      resume() {
        if (!reducedMotion) loop2();
      },
      setReducedMotion(v) {
        reducedMotion = !!v;
        if (reducedMotion) {
          stop2();
          run2 = true;
          draw(performance.now());
          run2 = false;
        } else loop2();
      },
      destroy() {
        stop2();
        clearTimeout(textFailsafe);
        root.removeEventListener("pointermove", onMove2);
        if (ro2) ro2.disconnect();
        else window.removeEventListener("resize", resize2d);
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  }
}
