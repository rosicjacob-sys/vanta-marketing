/* ============================================================================
 * 02 - Aurora Veil  ·  V2  ·  lineage: The Field
 * ----------------------------------------------------------------------------
 * Raymarched volumetric aurora curtains royal -> lilac over a starfield, now a
 * true parallaxing VOLUME (2–3 z-layers with atmospheric fade + DOF-soft far
 * sheet), braided by a second domain-warp octave with anti-aliased filament
 * hairlines, energy-crested grading that crushes ~90% of the frame toward
 * ink-violet between beats, and a hand-rolled composite pass: half-res float
 * bright-pass bloom + velocity-coupled chromatic aberration + subtle barrel
 * warp. The signature beat is restaged as anticipation -> payoff -> settle:
 * the veil inhales (dims ~0.5s) as the starfield sharpens, a front-sheet
 * ignites and SWELLS past 1.0 into a silent hold where ONE earned hot-magenta
 * ion detonates at a curtain crest (white core + chromatic split), then the
 * overshoot settles back through equilibrium with a damped-spring micro-bounce
 * while embers bloom-then-drift downward.
 *
 * deps: [] - pure WebGL2. No three, no gsap. Generated procedurally.
 * perf: fullscreen-triangle scene pass (empty VAO, in-shader noise, dithered
 *       raymarch start, trans<0.02 early-out, zero per-frame alloc), plus an
 *       OPTIONAL half-res float bloom path (bright-pass -> separable blur ->
 *       composite) gated behind uQuality + a one-time RGBA16F capability check.
 *       Falls back cleanly to the V1 in-pass tonemap when float buffers are
 *       unsupported. DPR capped [1,2] (1.5 coarse), rAF paused offscreen,
 *       adaptive quality step-down, ResizeObserver. Capability-guarded with a
 *       CSS-gradient fallback so it NEVER blanks. Reduced-motion snaps to one
 *       static crescendo frame and halts the loop.
 * ==========================================================================*/

// ---- Royal palette (fallback when tokens are absent) -----------------------
const ROYAL = {
  void:    "#07060D",
  panel:   "#150E2A",
  royal:   "#7C3AED",
  deep:    "#4C1D95",
  haloA:   "#A855F7",
  haloB:   "#C4B5FD",
  white:   "#F6F3FE",
  flare:   "#E8409B",
};

export const meta = {
  id: 2,
  slug: "aurora-veil",
  title: "Aurora Veil",
  lineage: "The Field",
  version: "V2",
  signature: "The veil inhales, a front-sheet ignites and swells to a silent hold where one earned magenta ion detonates, then overshoots back through equilibrium on a damped spring as embers drift down.",
  interaction: "Move the cursor to spring-parallax a 3-layer volume in depth; flick fast to smear royal->lilac chromatic edges; click to fire an ion flare.",
  deps: [],
};

// ---- helpers ---------------------------------------------------------------
function hexToRGB(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// bespoke easings
const easeOutExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInCubic = t => t * t * t;
const easeOutBack = (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

// ---- shaders ---------------------------------------------------------------
const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  // fullscreen triangle
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// ---- shared GLSL chunks ----------------------------------------------------
const NOISE = `
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hash31(vec3 p){
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i + vec3(0,0,0));
  float n100 = hash31(i + vec3(1,0,0));
  float n010 = hash31(i + vec3(0,1,0));
  float n110 = hash31(i + vec3(1,1,0));
  float n001 = hash31(i + vec3(0,0,1));
  float n101 = hash31(i + vec3(1,0,1));
  float n011 = hash31(i + vec3(0,1,1));
  float n111 = hash31(i + vec3(1,1,1));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}
// domain-warped fbm; oct controls detail (far layers use fewer)
float fbm(vec3 p, int oct){
  float a = 0.5, s = 0.0;
  for(int i = 0; i < 5; i++){
    if(i >= oct) break;
    s += a * vnoise(p);
    p = p * 2.02 + vec3(11.3, 7.1, 3.7);
    a *= 0.5;
  }
  return s;
}
float fbm(vec3 p){ return fbm(p, 5); }
`;

// SCENE PASS - raymarch the volumetric aurora into an HDR target -------------
const FRAG_SCENE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uParallax;     // smoothed cursor offset, -1..1
uniform float uReveal;       // 0..1 entrance
uniform float uSwell;        // 0..~1.06 crescendo intensity (overshoots)
uniform float uEmber;        // 0..1 exhale-to-embers blend
uniform float uSpark;        // 0..1 momentary ion-spark flash on click
uniform float uDetonate;     // 0..1 the ONE earned magenta detonation (hold)
uniform float uInhale;       // 0..1 anticipation undershoot (dim+sharpen)
uniform float uQuality;      // 1.0 full, 0.6 lite
uniform vec3  uVoid;
uniform vec3  uPanel;
uniform vec3  uRoyal;
uniform vec3  uDeep;
uniform vec3  uHaloA;
uniform vec3  uHaloB;
uniform vec3  uWhite;
uniform vec3  uFlare;

${NOISE}

// curtain density field - vertical sheets braided by two warps.
// returns vec2( density, crest ) where crest is the sheet-edge filament factor.
vec2 curtain(vec3 p, float t, float soft){
  // primary warp -> the classic aurora "fold"
  float warp = fbm(vec3(p.x * 1.4 + t * 0.15, p.y * 0.6 - t * 0.25, t * 0.12), 5);
  // second finer warp folded in so sheets BRAID rather than run parallel
  float warp2 = fbm(vec3(p.x * 3.0 - t * 0.4, p.y * 1.1 + t * 0.18, t * 0.2), 4);
  float x = p.x + (warp - 0.5) * 1.7 + (warp2 - 0.5) * 0.55;
  // multiple thin sheets; soft widens the sheet for out-of-focus far layers
  float fr = mix(3.2, 2.2, soft);
  float sheets = sin(x * fr + warp * 6.0 + warp2 * 2.0) * 0.5 + 0.5;
  sheets = pow(sheets, mix(3.0, 1.7, soft));
  // vertical band: dense low, thinning toward the top like real curtains
  float vfall = smoothstep(1.25, -0.55, p.y);
  float fray  = fbm(vec3(p.x * 2.0, p.y * 2.4 - t * 0.5, t * 0.2), 4);
  float top   = smoothstep(0.0, 1.0, p.y * 0.5 + 0.5) * fray;
  float dens  = sheets * vfall * (0.55 + 0.65 * top);
  // anti-aliased filament hairline along the brightest crests
  float crest = smoothstep(0.90, 1.0, sheets) * vfall * (1.0 - soft * 0.7);
  return vec2(dens, crest);
}

// march one z-layer slab; accumulates into aurora + transmittance.
void marchLayer(
  vec3 ro, vec3 rd, float zMul, float parScale, float drift, float soft,
  float t, float energy, int steps, float stepLen,
  inout vec3 aurora, inout float trans, inout float crestPeak
){
  float dist = (0.6 + 0.55 * zMul) + hash21(gl_FragCoord.xy + zMul) * stepLen;
  for(int i = 0; i < 48; i++){
    if(i >= steps || trans < 0.02) break;
    vec3 pos = ro + rd * dist;
    vec3 q = vec3(pos.x * 1.05, pos.y, pos.z * 0.6 * zMul);
    q.x += t * (0.06 + drift);
    q.y -= t * (0.10 + drift * 0.5);
    vec2 cd = curtain(q, t, soft);
    float d = max(cd.x - 0.18, 0.0) * energy;
    if(d > 0.001){
      float h = clamp(pos.y * 0.6 + 0.4, 0.0, 1.0);
      vec3 base = mix(uDeep, uRoyal, smoothstep(0.0, 0.5, h));
      vec3 hue  = mix(base, uHaloA, smoothstep(0.35, 0.85, h));
      // lilac tips lift only as the veil swells
      hue = mix(hue, uHaloB, smoothstep(0.7, 1.0, h) * (0.45 + 0.55 * uSwell));
      hue = mix(hue, uHaloB, uSwell * 0.35);
      hue = mix(hue, uDeep,  uEmber * 0.5);
      // atmospheric fade toward void by depth -> spatial separation
      float fade = 1.0 - exp(-dist * 0.18 * zMul);
      hue = mix(hue, uVoid, fade * (0.35 + 0.45 * soft));

      float dens = d * stepLen * 2.4;
      float bloomBoost = 1.2 + 1.6 * uSwell;
      aurora += hue * dens * trans * bloomBoost;

      // bright filament hairline lifted toward lilac, only on near/mid layers
      float fil = cd.y * energy * trans * (0.6 + 0.9 * uSwell);
      aurora += uHaloB * fil * dens * 1.8;
      crestPeak = max(crestPeak, cd.y * dens * trans);

      trans *= exp(-dens * 1.9);
    }
    dist += stepLen;
  }
}

void main(){
  vec2 uv = vUv;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;  // aspect-correct, centered
  float t = uTime;

  // ---- background: void with faint vertical violet lift --------------------
  vec3 col = uVoid;
  float lift = smoothstep(-0.7, 0.65, -p.y);
  col = mix(col, uDeep * 0.16, lift * 0.5);

  // ---- sparse starfield - SHARPENS on the inhale (anticipation) ------------
  float starGain = (0.6 + 0.4 * uReveal) * (1.0 + uInhale * 0.9);
  float starTight = mix(0.16, 0.105, uInhale); // tighter point on inhale
  vec2 sp = p + uParallax * 0.015;
  vec2 gid = floor(sp * 26.0);
  float star = hash21(gid);
  if(star > 0.985){
    vec2 cellf = fract(sp * 26.0) - 0.5;
    float tw = 0.5 + 0.5 * sin(t * 2.0 + star * 60.0);
    float s = smoothstep(starTight, 0.0, length(cellf)) * (0.35 + 0.65 * tw);
    float rare = step(0.997, star);
    vec3 starCol = mix(uHaloB * 0.7, uWhite, rare);
    col += starCol * s * starGain;
  }

  // ---- raymarch the aurora VOLUME across z-layers --------------------------
  vec3 ro = vec3(0.0, 0.0, -2.2);

  // intensity envelope: inhale dims, swell crescendos, ember exhale
  float energy = uReveal * (0.55 + 0.9 * uSwell);
  energy *= mix(1.0, 0.32, uEmber);
  energy *= mix(1.0, 0.62, uInhale);   // veil thins/dims on the inhale

  int baseSteps = int(mix(20.0, 44.0, uQuality));
  float stepLen = 0.135;

  vec3 aurora = vec3(0.0);
  float trans = 1.0;
  float crestPeak = 0.0;

  // NEAR layer - moves most, sharp, brightest
  {
    vec2 par = uParallax * 0.22;
    vec3 rd = normalize(vec3(p.x + par.x, p.y + par.y + 0.04, 1.0));
    marchLayer(ro, rd, 1.0, 0.22, 0.02, 0.0, t, energy * 1.05,
               baseSteps, stepLen, aurora, trans, crestPeak);
  }
  // MID layer - moderate parallax + drift
  {
    vec2 par = uParallax * 0.12;
    vec3 rd = normalize(vec3(p.x + par.x, p.y + par.y + 0.02, 1.0));
    marchLayer(ro, rd, 2.2, 0.12, -0.015, 0.35, t, energy * 0.8,
               int(float(baseSteps) * 0.7), stepLen * 1.25, aurora, trans, crestPeak);
  }
  // FAR layer - barely parallaxes, soft (DOF), atmospheric - quality-gated
  if(uQuality > 0.7){
    vec2 par = uParallax * 0.05;
    vec3 rd = normalize(vec3(p.x + par.x, p.y + par.y, 1.0));
    marchLayer(ro, rd, 4.0, 0.05, 0.008, 0.85, t, energy * 0.55,
               int(float(baseSteps) * 0.5), stepLen * 1.6, aurora, trans, crestPeak);
  }

  // soft additive in-pass tonemap to keep purples rich (bloom adds on top)
  aurora = aurora / (1.0 + aurora * 0.5);
  col += aurora;

  // ---- ion sparks riding the curtain crests --------------------------------
  {
    vec2 g = floor((p * vec2(7.0, 9.0)) + vec2(t * 0.05, -t * 0.13));
    float r = hash21(g + 3.7);
    if(r > 0.992){
      vec2 cf = fract((p * vec2(7.0, 9.0)) + vec2(t * 0.05, -t * 0.13)) - 0.5;
      // 1-frame haptic tick: sharp attack, instant on, exp decay
      float ph = fract(t * 0.9 + r * 7.0);
      float tick = exp(-ph * 9.0);
      float s = smoothstep(0.12, 0.0, length(cf)) * tick;
      col += uWhite * s * energy * 1.5;
    }
  }

  // ---- THE ONE earned magenta detonation (signature hold) ------------------
  // fired automatically at the hold + on click; lands at a curtain crest.
  float det = max(uDetonate, uSpark);
  if(det > 0.001){
    // crest anchor: slightly off-center, riding the bright in-scatter
    vec2 anchor = vec2(0.06 + 0.12 * sin(t * 0.3), 0.10);
    float d = length(p - anchor);
    // velocity-free chromatic split on the detonation itself
    float halo = exp(-d * 3.0) * det;
    col += uFlare * halo * 1.05;
    // white-hot core
    col += uWhite * exp(-d * 11.0) * det * 0.85;
    // tight ring shimmer
    float ring = smoothstep(0.02, 0.0, abs(d - 0.05 - 0.04 * det)) * det;
    col += mix(uFlare, uHaloB, 0.5) * ring * 0.6;
  }

  // ---- ember motes on exhale: bloom then DRIFT DOWNWARD --------------------
  if(uEmber > 0.01){
    // downward drift: cells migrate down over the ember phase
    vec2 ep = p + vec2(0.0, uEmber * 0.18 - 0.09);
    vec2 eg = floor((ep * 10.0) + vec2(-t * 0.1, t * 0.05));
    float er = hash21(eg + 9.1);
    if(er > 0.95){
      vec2 ef = fract((ep * 10.0) + vec2(-t * 0.1, t * 0.05)) - 0.5;
      ef.y += sin(t * 0.6 + er * 30.0) * 0.05;   // gentle fall sway
      float fade = 0.5 + 0.5 * sin(t * 1.5 + er * 40.0);
      float s = smoothstep(0.18, 0.0, length(ef)) * fade;
      col += mix(uRoyal, uHaloA, er) * s * uEmber * 0.6;
    }
  }

  // ---- ENERGY-CRESTED grade -------------------------------------------------
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  // crest: lift midtones up the royal->lilac ramp + faint white rim on peaks
  col = mix(col, col * mix(uHaloA, uHaloB, 0.5) * 1.4, uSwell * 0.18);
  col += uWhite * smoothstep(0.55, 0.95, luma) * crestPeak * uSwell * 1.2;
  // crush shadows toward ink-violet between beats (~90% of frame goes blacker)
  float crush = smoothstep(0.16, 0.0, luma) * (1.0 - clamp(uSwell, 0.0, 1.0));
  col = mix(col, uPanel * 0.5, crush * 0.6);
  // re-crush toward ink on the ember/rest exhale
  col = mix(col, mix(uVoid, uPanel, 0.4),
            smoothstep(0.12, 0.0, luma) * uEmber * 0.55);

  // ---- film grain -----------------------------------------------------------
  float grain = hash21(gl_FragCoord.xy + fract(t) * 113.0) - 0.5;
  col += grain * 0.022;

  // entrance: lift from black
  col *= mix(0.0, 1.0, smoothstep(0.0, 1.0, uReveal));

  frag = vec4(max(col, 0.0), 1.0);
}`;

// BRIGHT-PASS - isolate aurora/spark highlights (not the void) into half-res --
const FRAG_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uScene;
uniform float uThreshold;
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // soft knee above threshold so only true highlights bloom
  float k = max(l - uThreshold, 0.0) / max(l, 1e-4);
  frag = vec4(c * k, 1.0);
}`;

// SEPARABLE GAUSSIAN BLUR - 7 taps, one axis per pass ------------------------
const FRAG_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uTex;
uniform vec2 uDir;     // texel * direction
void main(){
  // weights for a 7-tap gaussian
  float w0 = 0.227027;
  float w1 = 0.1945946;
  float w2 = 0.1216216;
  float w3 = 0.054054;
  vec3 c = texture(uTex, vUv).rgb * w0;
  c += texture(uTex, vUv + uDir * 1.0).rgb * w1;
  c += texture(uTex, vUv - uDir * 1.0).rgb * w1;
  c += texture(uTex, vUv + uDir * 2.0).rgb * w2;
  c += texture(uTex, vUv - uDir * 2.0).rgb * w2;
  c += texture(uTex, vUv + uDir * 3.0).rgb * w3;
  c += texture(uTex, vUv - uDir * 3.0).rgb * w3;
  frag = vec4(c, 1.0);
}`;

// COMPOSITE - scene + bloom, chromatic aberration (∝ velocity), barrel warp --
const FRAG_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uVel;        // cursor velocity 0..1
uniform float uDetonate;   // boosts split during the hold
uniform float uBloomAmt;
uniform vec2  uRes;
void main(){
  vec2 uv = vUv;
  // subtle barrel warp from center
  vec2 cc = uv - 0.5;
  uv += cc * dot(cc, cc) * 0.03;

  // velocity-coupled chromatic aberration, radial, royal->lilac smear at edges
  float ca = (0.0012 + uVel * 0.010 + uDetonate * 0.004);
  vec2 dir = normalize(cc + 1e-5);
  float edge = smoothstep(0.1, 0.75, length(cc));
  vec2 off = dir * ca * (0.35 + edge);

  vec3 scene;
  scene.r = texture(uScene, uv + off).r;
  scene.g = texture(uScene, uv).g;
  scene.b = texture(uScene, uv - off).b;

  // bloom: also split a touch on the highlight channels for a chromatic halo
  vec3 bloom;
  bloom.r = texture(uBloom, uv + off * 1.6).r;
  bloom.g = texture(uBloom, uv).g;
  bloom.b = texture(uBloom, uv - off * 1.6).b;

  vec3 col = scene + bloom * uBloomAmt;

  // deep vignette (kept in composite so bloom doesn't wash the edges)
  float vig = smoothstep(1.25, 0.35, length(vUv - 0.5) * 1.7);
  col *= 0.32 + 0.68 * vig;

  frag = vec4(max(col, 0.0), 1.0);
}`;

// FALLBACK COMPOSITE - no float bloom; vignette + light CA only --------------
const FRAG_COMPOSITE_LOFI = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uScene;
uniform float uVel;
uniform float uDetonate;
void main(){
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  uv += cc * dot(cc, cc) * 0.03;
  float ca = (0.0010 + uVel * 0.008 + uDetonate * 0.003);
  vec2 dir = normalize(cc + 1e-5);
  float edge = smoothstep(0.1, 0.75, length(cc));
  vec2 off = dir * ca * (0.35 + edge);
  vec3 col;
  col.r = texture(uScene, uv + off).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - off).b;
  float vig = smoothstep(1.25, 0.35, length(vUv - 0.5) * 1.7);
  col *= 0.32 + 0.68 * vig;
  frag = vec4(max(col, 0.0), 1.0);
}`;

// ---- mount -----------------------------------------------------------------
export function mount(container, opts = {}) {
  const tokens = (opts && opts.tokens) || {};
  const pick = (k) => tokens[k] || ROYAL[k];

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let reducedMotion = !!(opts && opts.reducedMotion) || prefersReduced;

  const coarse =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(pointer: coarse)").matches;

  // ---- state -------------------------------------------------------------
  let raf = 0;
  let running = false;
  let destroyed = false;
  let startTime = performance.now();
  let lastFrame = startTime;

  // spring parallax (velocity-coupled, critically-damped w/ slight overshoot)
  let pTargetX = 0, pTargetY = 0;
  let pX = 0, pY = 0;
  let pVX = 0, pVY = 0;
  let velMag = 0;          // smoothed cursor velocity for chromatic aberration

  // signature timeline (seconds)
  let cycleStart = startTime;
  const T_REVEAL = 1.0;
  const T_IDLE_TO_INHALE = 4.7;  // idle breathe before the inhale
  const T_INHALE = 0.5;          // anticipation undershoot
  const T_SWELL = 1.5;           // ignite + swell up (easeOutExpo past 1.0)
  const T_HOLD = 0.4;            // silent crescendo hold (the screenshot)
  const T_EMBER = 3.0;           // exhale to embers + damped-spring settle
  const T_REST = 3.4;            // calm before looping

  let sparkStart = -10;          // click flash time

  // adaptive quality
  let quality = coarse ? 0.6 : 1.0;
  let slowFrames = 0;

  // ---- DOM scaffold ------------------------------------------------------
  container.style.overflow = "hidden";
  container.style.background = pick("void");

  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  container.appendChild(canvas);

  const FONT =
    "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

  // wordmark / brand whisper - staggered masked reveal, timed to the crest
  const label = document.createElement("div");
  label.style.position = "absolute";
  label.style.left = "22px";
  label.style.bottom = "18px";
  label.style.zIndex = "2";
  label.style.pointerEvents = "none";
  label.style.fontFamily = FONT;
  label.style.color = pick("white");
  // two clip-path masked lines we reveal independently
  const lineEase = "cubic-bezier(.16,1,.3,1)";
  label.innerHTML =
    `<div class="av-l1" style="font-size:11px;letter-spacing:.42em;font-weight:600;opacity:0;` +
      `transform:translateY(10px);clip-path:inset(0 100% 0 0);` +
      `transition:opacity .8s ${lineEase},transform .8s ${lineEase},clip-path .9s ${lineEase}">VANTA</div>` +
    `<div class="av-l2" style="font-size:10px;letter-spacing:.06em;margin-top:5px;opacity:0;` +
      `transform:translateY(8px);color:${pick("haloB")};` +
      `transition:opacity .8s ${lineEase},transform .8s ${lineEase}">Trouvé partout · Google + IA</div>`;
  container.appendChild(label);

  // illustrative metric, top-right - count-up lands a flash on the hold
  const metric = document.createElement("div");
  metric.style.position = "absolute";
  metric.style.right = "22px";
  metric.style.top = "18px";
  metric.style.zIndex = "2";
  metric.style.pointerEvents = "none";
  metric.style.textAlign = "right";
  metric.style.fontFamily = FONT;
  metric.style.color = pick("haloB");
  metric.innerHTML =
    `<div class="av-mlabel" style="font-size:10px;letter-spacing:.18em;opacity:0;color:${pick("white")};` +
      `transform:translateY(6px);transition:opacity .8s ${lineEase},transform .8s ${lineEase}">CITATIONS IA</div>` +
    `<div class="av-mnum" style="font-size:20px;font-weight:600;margin-top:2px;letter-spacing:.02em;` +
      `color:${pick("white")};opacity:0;transition:opacity .6s ease,text-shadow .25s ease">0</div>` +
    `<div class="av-msub" style="font-size:9px;opacity:0;margin-top:1px;` +
      `transition:opacity .8s ease">+24 % ce mois · illustratif</div>`;
  container.appendChild(metric);

  const l1 = label.querySelector(".av-l1");
  const l2 = label.querySelector(".av-l2");
  const mLabel = metric.querySelector(".av-mlabel");
  const mNum = metric.querySelector(".av-mnum");
  const mSub = metric.querySelector(".av-msub");

  // count-up state for the metric (1 240 illustrative)
  const COUNT_TARGET = 1240;
  let countRAF = 0;
  let countDone = false;

  // ---- WebGL setup -------------------------------------------------------
  let gl = null;
  let webglOK = false;
  let bloomOK = false;          // float-FBO bloom path available

  // programs
  let progScene = null, progBright = null, progBlur = null;
  let progComp = null, progLofi = null;
  let uScene = {}, uBright = {}, uBlur = {}, uComp = {}, uLofi = {};

  // FBOs
  let sceneFBO = null, sceneTex = null;
  let brightFBO = null, brightTex = null;
  let blurFBO = null, blurTex = null;
  let vao = null;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("[aurora-veil] shader:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }
  function link(vsSrc, fsSrc) {
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[aurora-veil] link:", gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }
  function locs(prog, names) {
    const o = {};
    for (const n of names) o[n] = gl.getUniformLocation(prog, n);
    return o;
  }

  function makeTex(w, h, internal, format, type) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }
  function makeFBO(tex) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return fbo;
  }

  function setSceneColors() {
    gl.useProgram(progScene);
    gl.uniform3fv(uScene.uVoid, hexToRGB(pick("void")));
    gl.uniform3fv(uScene.uPanel, hexToRGB(pick("panel")));
    gl.uniform3fv(uScene.uRoyal, hexToRGB(pick("royal")));
    gl.uniform3fv(uScene.uDeep, hexToRGB(pick("deep")));
    gl.uniform3fv(uScene.uHaloA, hexToRGB(pick("haloA")));
    gl.uniform3fv(uScene.uHaloB, hexToRGB(pick("haloB")));
    gl.uniform3fv(uScene.uWhite, hexToRGB(pick("white")));
    gl.uniform3fv(uScene.uFlare, hexToRGB(pick("flare")));
  }

  function initGL() {
    try {
      gl = canvas.getContext("webgl2", {
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      });
    } catch (e) {
      gl = null;
    }
    if (!gl) return false;

    // one-time float-buffer capability check (RGBA16F renderable)
    const extCBF = gl.getExtension("EXT_color_buffer_float");
    bloomOK = !!extCBF;
    gl.getExtension("OES_texture_float_linear"); // linear filtering on float (best-effort)

    progScene = link(VERT, FRAG_SCENE);
    if (!progScene) return false;
    uScene = locs(progScene, [
      "uRes", "uTime", "uParallax", "uReveal", "uSwell", "uEmber",
      "uSpark", "uDetonate", "uInhale", "uQuality",
      "uVoid", "uPanel", "uRoyal", "uDeep", "uHaloA", "uHaloB", "uWhite", "uFlare",
    ]);
    setSceneColors();

    if (bloomOK) {
      progBright = link(VERT, FRAG_BRIGHT);
      progBlur = link(VERT, FRAG_BLUR);
      progComp = link(VERT, FRAG_COMPOSITE);
      if (!progBright || !progBlur || !progComp) {
        bloomOK = false; // any failure -> drop to lofi path
      } else {
        uBright = locs(progBright, ["uScene", "uThreshold"]);
        uBlur = locs(progBlur, ["uTex", "uDir"]);
        uComp = locs(progComp, ["uScene", "uBloom", "uVel", "uDetonate", "uBloomAmt", "uRes"]);
      }
    }
    // lofi composite is always available (used when bloom is off/unsupported)
    progLofi = link(VERT, FRAG_COMPOSITE_LOFI);
    if (!progLofi) return false;
    uLofi = locs(progLofi, ["uScene", "uVel", "uDetonate"]);

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    return true;
  }

  // ---- CSS fallback (never blank) ----------------------------------------
  function showFallback() {
    canvas.style.display = "none";
    container.style.background =
      `radial-gradient(120% 90% at 50% 115%, ${pick("royal")}22 0%, transparent 55%),` +
      `radial-gradient(80% 60% at 50% 100%, ${pick("haloA")}33 0%, transparent 60%),` +
      `linear-gradient(180deg, ${pick("void")} 0%, ${pick("panel")} 100%)`;
    revealLabels(true);
  }

  // ---- staggered, masked label reveal ------------------------------------
  let labelsRevealed = false;
  function revealLabels(instant) {
    if (labelsRevealed) return;
    labelsRevealed = true;
    const d = instant ? 0 : 1;
    // line 1 (wordmark) wipes in via clip-path
    setTimeout(() => {
      l1.style.opacity = "0.92";
      l1.style.transform = "translateY(0)";
      l1.style.clipPath = "inset(0 0% 0 0)";
    }, 0 * d);
    setTimeout(() => {
      l2.style.opacity = "0.6";
      l2.style.transform = "translateY(0)";
    }, 140 * d);
    setTimeout(() => {
      mLabel.style.opacity = "0.55";
      mLabel.style.transform = "translateY(0)";
    }, 90 * d);
    setTimeout(() => {
      mNum.style.opacity = "1";
      if (instant) { mNum.textContent = "1 240"; countDone = true; }
    }, 200 * d);
    setTimeout(() => { mSub.style.opacity = "0.5"; }, 360 * d);
  }

  function formatCount(n) {
    // French-style thin-space thousands: "1 240"
    return Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ");
  }

  // count-up animation; flashLanding fires a brief glow on completion
  function startCountUp(landAtHold) {
    if (countDone || reducedMotion) return;
    cancelAnimationFrame(countRAF);
    const dur = Math.max(400, landAtHold);       // ms, lands ~on the hold
    const t0 = performance.now();
    const tick = (now) => {
      if (destroyed) return;
      const k = clamp((now - t0) / dur, 0, 1);
      const e = easeOutExpo(k);
      mNum.textContent = formatCount(COUNT_TARGET * e);
      if (k < 1) {
        countRAF = requestAnimationFrame(tick);
      } else {
        countDone = true;
        mNum.textContent = "1 240";
        // landing flash on the silent hold
        mNum.style.textShadow =
          `0 0 18px ${pick("haloA")}, 0 0 6px ${pick("white")}`;
        setTimeout(() => { if (!destroyed) mNum.style.textShadow = "none"; }, 420);
      }
    };
    countRAF = requestAnimationFrame(tick);
  }

  // ---- sizing ------------------------------------------------------------
  let dpr = 1, W = 1, H = 1, BW = 1, BH = 1;
  function allocTargets() {
    if (!gl) return;
    // scene FBO at full res (float when available, else 8-bit)
    if (sceneTex) gl.deleteTexture(sceneTex);
    if (sceneFBO) gl.deleteFramebuffer(sceneFBO);
    if (bloomOK) {
      sceneTex = makeTex(W, H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    } else {
      sceneTex = makeTex(W, H, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE);
    }
    sceneFBO = makeFBO(sceneTex);

    if (bloomOK) {
      BW = Math.max(1, Math.floor(W / 2));
      BH = Math.max(1, Math.floor(H / 2));
      if (brightTex) gl.deleteTexture(brightTex);
      if (brightFBO) gl.deleteFramebuffer(brightFBO);
      if (blurTex) gl.deleteTexture(blurTex);
      if (blurFBO) gl.deleteFramebuffer(blurFBO);
      brightTex = makeTex(BW, BH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
      brightFBO = makeFBO(brightTex);
      blurTex = makeTex(BW, BH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
      blurFBO = makeFBO(blurTex);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function resize() {
    const r = container.getBoundingClientRect();
    const cssW = Math.max(1, r.width);
    const cssH = Math.max(1, r.height);
    const cap = coarse ? 1.5 : 2;
    dpr = clamp(window.devicePixelRatio || 1, 1, cap);
    const nW = Math.max(1, Math.round(cssW * dpr));
    const nH = Math.max(1, Math.round(cssH * dpr));
    const changed = nW !== W || nH !== H || !sceneFBO;
    W = nW; H = nH;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    if (gl && changed) allocTargets();
  }

  // ---- signature envelope ------------------------------------------------
  // anticipation(inhale) -> ignite/swell(past 1.0) -> hold(detonate)
  //  -> exhale with damped-spring settle + ember bloom-then-drift.
  function envelope(elapsed) {
    const tInhaleStart = T_IDLE_TO_INHALE;
    const tInhaleEnd = tInhaleStart + T_INHALE;
    const tSwellEnd = tInhaleEnd + T_SWELL;
    const tHoldEnd = tSwellEnd + T_HOLD;
    const tEmberEnd = tHoldEnd + T_EMBER;
    const tCycle = tEmberEnd + T_REST;

    const reveal = easeOutExpo(clamp(elapsed / T_REVEAL, 0, 1));

    let swell = 0, ember = 0, inhale = 0, detonate = 0;

    if (elapsed >= tInhaleStart && elapsed < tInhaleEnd) {
      // anticipation undershoot: dim/sharpen, swell dips slightly below idle
      const k = clamp((elapsed - tInhaleStart) / T_INHALE, 0, 1);
      inhale = Math.sin(k * Math.PI);          // up then back to 0 over 0.5s
      swell = -0.06 * inhale;                   // brief undershoot
    } else if (elapsed >= tInhaleEnd && elapsed < tSwellEnd) {
      // ignite + SWELL on easeOutExpo, ramping past 1.0
      const k = clamp((elapsed - tInhaleEnd) / T_SWELL, 0, 1);
      swell = easeOutExpo(k) * 1.06;
    } else if (elapsed >= tSwellEnd && elapsed < tHoldEnd) {
      // silent hold at the crest + the ONE earned magenta detonation
      swell = 1.06;
      const hk = clamp((elapsed - tSwellEnd) / T_HOLD, 0, 1);
      // detonation: sharp instant attack near the start of the hold, exp decay
      const dk = clamp((elapsed - (tSwellEnd + 0.02)) / (T_HOLD * 0.9), 0, 1);
      detonate = Math.exp(-dk * 4.5) * (dk > 0 ? 1 : 0);
      // ease the swell slightly during hold so the overshoot feels alive
      swell = 1.06 - 0.02 * hk;
    } else if (elapsed >= tHoldEnd && elapsed < tEmberEnd) {
      // EXHALE: settle back through equilibrium with a damped-spring micro-bounce
      const e = clamp((elapsed - tHoldEnd) / T_EMBER, 0, 1);
      // base fall from 1.06 -> ~0 on easeOutCubic
      const fall = 1.06 * (1 - easeOutCubic(e));
      // damped spring overshoot riding the early part: ~1.04 -> 0.97 -> 1.0
      const decay = Math.exp(-e * 6.0);
      const bounce = Math.cos(e * Math.PI * 3.2) * decay * 0.06;
      swell = Math.max(0, fall + bounce);
      // ember bloom-then-drift downward
      ember = Math.sin(easeOutCubic(e) * Math.PI) * 0.85;
      ember = Math.max(ember, easeOutCubic(e) * 0.35);
    } else if (elapsed >= tEmberEnd) {
      ember = clamp(1 - (elapsed - tEmberEnd) / (T_REST * 0.6), 0, 1) * 0.35;
    }

    // subtle idle breathe between beats (never fully flat before the inhale)
    if (elapsed < tInhaleStart) {
      swell += (0.5 + 0.5 * Math.sin(elapsed * 0.9)) * 0.12 *
               clamp((elapsed - T_REVEAL) / 1.5, 0, 1);
    }

    return {
      reveal,
      swell: clamp(swell, -0.1, 1.1),
      ember: clamp(ember, 0, 1),
      inhale: clamp(inhale, 0, 1),
      detonate: clamp(detonate, 0, 1),
      cycle: tCycle,
      tHoldStart: tSwellEnd,
    };
  }

  // static frame composition for reduced motion (the crescendo, post-detonate)
  function staticEnvelope() {
    return { reveal: 1, swell: 0.96, ember: 0.12, inhale: 0, detonate: 0.35, cycle: 1, tHoldStart: 0 };
  }

  // timing flags so DOM beats fire exactly once per cycle
  let firedReveal = false;
  let firedCountUp = false;

  // ---- render passes -----------------------------------------------------
  function drawScene(env, tSec) {
    gl.useProgram(progScene);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
    gl.viewport(0, 0, W, H);
    gl.uniform2f(uScene.uRes, W, H);
    gl.uniform1f(uScene.uTime, reducedMotion ? 6.2 : tSec);
    gl.uniform2f(uScene.uParallax, pX, pY);
    gl.uniform1f(uScene.uReveal, env.reveal);
    gl.uniform1f(uScene.uSwell, env.swell);
    gl.uniform1f(uScene.uEmber, env.ember);
    gl.uniform1f(uScene.uInhale, env.inhale);
    const clickSpark = reducedMotion ? 0 : Math.max(0, 1 - (tSec - sparkStart) / 0.5);
    gl.uniform1f(uScene.uSpark, clickSpark * clickSpark);
    gl.uniform1f(uScene.uDetonate, env.detonate);
    gl.uniform1f(uScene.uQuality, quality);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawBloomAndComposite(env) {
    // bright-pass into half-res
    gl.useProgram(progBright);
    gl.bindFramebuffer(gl.FRAMEBUFFER, brightFBO);
    gl.viewport(0, 0, BW, BH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(uBright.uScene, 0);
    gl.uniform1f(uBright.uThreshold, 0.6);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // separable gaussian: H then V (ping-pong bright<->blur)
    gl.useProgram(progBlur);
    // horizontal: bright -> blur
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurFBO);
    gl.viewport(0, 0, BW, BH);
    gl.bindTexture(gl.TEXTURE_2D, brightTex);
    gl.uniform1i(uBlur.uTex, 0);
    gl.uniform2f(uBlur.uDir, 1.0 / BW, 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // vertical: blur -> bright
    gl.bindFramebuffer(gl.FRAMEBUFFER, brightFBO);
    gl.bindTexture(gl.TEXTURE_2D, blurTex);
    gl.uniform2f(uBlur.uDir, 0.0, 1.0 / BH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // composite to screen: scene + bloom + CA + barrel + vignette
    gl.useProgram(progComp);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(uComp.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, brightTex);
    gl.uniform1i(uComp.uBloom, 1);
    gl.uniform1f(uComp.uVel, clamp(velMag, 0, 1));
    gl.uniform1f(uComp.uDetonate, env.detonate);
    gl.uniform1f(uComp.uBloomAmt, 0.9 + 0.6 * clamp(env.swell, 0, 1.1));
    gl.uniform2f(uComp.uRes, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawLofiComposite(env) {
    gl.useProgram(progLofi);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(uLofi.uScene, 0);
    gl.uniform1f(uLofi.uVel, clamp(velMag, 0, 1));
    gl.uniform1f(uLofi.uDetonate, env.detonate);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // bloom is enabled only when supported AND quality is high enough
  function bloomActive() {
    return bloomOK && quality > 0.7;
  }

  // ---- render loop -------------------------------------------------------
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    if (!running) return;

    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    // adaptive quality
    if (dt > 0.024 && !coarse) {
      slowFrames++;
      if (slowFrames > 50 && quality > 0.6) { quality = 0.6; slowFrames = 0; }
    } else {
      slowFrames = Math.max(0, slowFrames - 1);
    }

    const tSec = (now - startTime) / 1000;

    // ---- spring parallax: critically-damped with a touch of overshoot ----
    if (!reducedMotion) {
      const stiffness = 90;     // pull toward target
      const damping = 14;       // < 2*sqrt(k) => slight overshoot
      const ax = (pTargetX - pX) * stiffness - pVX * damping;
      const ay = (pTargetY - pY) * stiffness - pVY * damping;
      pVX += ax * dt;
      pVY += ay * dt;
      pX += pVX * dt;
      pY += pVY * dt;
      // velocity magnitude (for chromatic aberration), smoothed + decayed
      const inst = Math.min(1, Math.hypot(pVX, pVY) * 0.5);
      velMag += (inst - velMag) * Math.min(1, dt * 8);
    }

    // ---- envelope --------------------------------------------------------
    let env;
    if (reducedMotion) {
      env = staticEnvelope();
    } else {
      let elapsed = (now - cycleStart) / 1000;
      const probe = envelope(elapsed);
      if (elapsed >= probe.cycle) {
        cycleStart = now;
        elapsed = 0;
        firedReveal = false;
        firedCountUp = false;
        countDone = false;
        labelsRevealed = false;
        // reset DOM for the next cycle's staggered reveal
        l1.style.opacity = "0"; l1.style.transform = "translateY(10px)";
        l1.style.clipPath = "inset(0 100% 0 0)";
        l2.style.opacity = "0"; l2.style.transform = "translateY(8px)";
        mLabel.style.opacity = "0"; mLabel.style.transform = "translateY(6px)";
        mNum.style.opacity = "0"; mNum.textContent = "0";
        mSub.style.opacity = "0";
      }
      env = envelope(elapsed);

      // DOM beat 1: staggered reveal once entrance settles
      if (!firedReveal && env.reveal > 0.55) {
        firedReveal = true;
        revealLabels(false);
      }
      // DOM beat 2: count-up so "1 240" LANDS its flash on the silent hold
      if (!firedCountUp && elapsed > env.tHoldStart - 1.0 && env.tHoldStart > 0) {
        firedCountUp = true;
        const msToHold = Math.max(300, (env.tHoldStart - elapsed) * 1000 + T_HOLD * 500);
        startCountUp(msToHold);
      }
    }

    if (!webglOK || !gl) return;

    // ---- draw: scene -> (bloom) -> composite -----------------------------
    drawScene(env, tSec);
    if (bloomActive()) {
      drawBloomAndComposite(env);
    } else {
      drawLofiComposite(env);
    }
  }

  // ---- interaction -------------------------------------------------------
  function onPointerMove(e) {
    if (reducedMotion) return;
    const r = container.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    pTargetX = clamp(x * 2 - 1, -1, 1);
    pTargetY = clamp(-(y * 2 - 1), -1, 1);
  }
  function onPointerLeave() {
    pTargetX = 0;
    pTargetY = 0;
  }
  function onClick() {
    if (reducedMotion) return;
    sparkStart = (performance.now() - startTime) / 1000;
  }

  // ---- lifecycle ---------------------------------------------------------
  let ro = null;
  function onVisibility() {
    if (document.hidden) { running = false; }
    else if (!destroyed && !reducedMotion && webglOK) { running = true; lastFrame = performance.now(); }
  }
  function attach() {
    container.addEventListener("pointermove", onPointerMove, { passive: true });
    container.addEventListener("pointerleave", onPointerLeave, { passive: true });
    container.addEventListener("pointerdown", onClick, { passive: true });

    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => resize());
      ro.observe(container);
    } else {
      window.addEventListener("resize", resize);
    }
    document.addEventListener("visibilitychange", onVisibility);

    canvas.addEventListener("webglcontextlost", onContextLost, false);
    canvas.addEventListener("webglcontextrestored", onContextRestored, false);
  }

  function onContextLost(e) {
    e.preventDefault();
    running = false;
  }
  function onContextRestored() {
    if (destroyed) return;
    // null stale GL objects; re-init from scratch
    sceneFBO = sceneTex = brightFBO = brightTex = blurFBO = blurTex = null;
    progScene = progBright = progBlur = progComp = progLofi = null;
    webglOK = initGL();
    if (webglOK) { resize(); running = !document.hidden && !reducedMotion; }
    else showFallback();
  }

  // ---- boot --------------------------------------------------------------
  webglOK = initGL();
  if (!webglOK) {
    showFallback();
  } else {
    resize();
  }
  attach();

  // reveal failsafe - never leave labels invisible
  const failTimer = setTimeout(() => revealLabels(true), 3500);

  startTime = performance.now();
  lastFrame = startTime;
  cycleStart = startTime;
  running = true;
  raf = requestAnimationFrame(frame);

  if (reducedMotion) {
    // draw a couple frames so uniforms settle, then halt the loop
    setTimeout(() => { running = false; }, 80);
    revealLabels(true);
  }

  // ---- handle ------------------------------------------------------------
  const replayFailTimers = [];
  function resetCycleDOM() {
    labelsRevealed = false;
    countDone = false;
    firedReveal = false;
    firedCountUp = false;
    cancelAnimationFrame(countRAF);
    l1.style.opacity = "0"; l1.style.transform = "translateY(10px)";
    l1.style.clipPath = "inset(0 100% 0 0)";
    l2.style.opacity = "0"; l2.style.transform = "translateY(8px)";
    mLabel.style.opacity = "0"; mLabel.style.transform = "translateY(6px)";
    mNum.style.opacity = "0"; mNum.textContent = "0"; mNum.style.textShadow = "none";
    mSub.style.opacity = "0";
  }

  return {
    replay() {
      if (destroyed) return;
      startTime = performance.now();
      lastFrame = startTime;
      cycleStart = startTime;
      sparkStart = -10;
      velMag = 0;
      resetCycleDOM();
      clearTimeout(failTimer);
      const ft = setTimeout(() => revealLabels(true), 3500);
      // keep a reference so destroy can clear it
      replayFailTimers.push(ft);
      if (reducedMotion) {
        running = true;
        setTimeout(() => { running = false; }, 80);
        revealLabels(true);
      } else {
        running = !document.hidden;
      }
    },
    pause() {
      running = false;
    },
    resume() {
      if (destroyed || reducedMotion) return;
      running = true;
      lastFrame = performance.now();
    },
    setReducedMotion(v) {
      reducedMotion = !!v;
      if (reducedMotion) {
        pTargetX = 0; pTargetY = 0;
        pX = 0; pY = 0; pVX = 0; pVY = 0; velMag = 0;
        cancelAnimationFrame(countRAF);
        running = true;
        setTimeout(() => { running = false; }, 80);
        revealLabels(true);
      } else {
        startTime = performance.now();
        lastFrame = startTime;
        cycleStart = startTime;
        resetCycleDOM();
        running = !document.hidden;
      }
    },
    destroy() {
      destroyed = true;
      running = false;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(countRAF);
      clearTimeout(failTimer);
      for (const ft of replayFailTimers) clearTimeout(ft);

      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("pointerdown", onClick);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (ro) { try { ro.disconnect(); } catch (e) {} ro = null; }

      if (gl) {
        try {
          if (progScene) gl.deleteProgram(progScene);
          if (progBright) gl.deleteProgram(progBright);
          if (progBlur) gl.deleteProgram(progBlur);
          if (progComp) gl.deleteProgram(progComp);
          if (progLofi) gl.deleteProgram(progLofi);
          if (sceneTex) gl.deleteTexture(sceneTex);
          if (brightTex) gl.deleteTexture(brightTex);
          if (blurTex) gl.deleteTexture(blurTex);
          if (sceneFBO) gl.deleteFramebuffer(sceneFBO);
          if (brightFBO) gl.deleteFramebuffer(brightFBO);
          if (blurFBO) gl.deleteFramebuffer(blurFBO);
          if (vao) gl.deleteVertexArray(vao);
          const ext = gl.getExtension("WEBGL_lose_context");
          if (ext) ext.loseContext();
        } catch (e) {}
      }
      gl = null;
      progScene = progBright = progBlur = progComp = progLofi = null;
      sceneFBO = sceneTex = brightFBO = brightTex = blurFBO = blurTex = vao = null;
      uScene = uBright = uBlur = uComp = uLofi = null;

      try { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); } catch (e) {}
      try { if (label.parentNode) label.parentNode.removeChild(label); } catch (e) {}
      try { if (metric.parentNode) metric.parentNode.removeChild(metric); } catch (e) {}
    },
  };
}
