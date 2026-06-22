/**
 * 12 · Fresnel Monolith — lineage "The Orb"
 * A dark obsidian monolith with a razor lilac fresnel edge-glow and an inner light that
 * pulses upward; on hover the beacon charges and — at full charge — BURSTS from the top
 * like a signal flare (the one screenshot moment).
 *
 * Stack: three@0.160.0 (true 3D, single WebGL context) + gsap@3.12.5 (entrance / charge eases).
 * Royal System palette only. French (Québec) micro-copy.
 *
 * Perf notes: one renderer, DPR capped [1,2], no per-frame allocation (scratch vectors/colors
 * reused), additive glow via cheap shader layers (no postprocessing lib), beam is a single
 * instanced-free cone w/ vertex-driven alpha. Reduced-motion + WebGL-fail both snap to a
 * composed static frame / CSS gradient. Fully disposes on destroy (gallery re-mounts cells).
 */

import * as THREE from "https://esm.sh/three@0.160.0";
import gsap from "https://esm.sh/gsap@3.12.5";

export const meta = {
  id: 12,
  slug: "fresnel-monolith",
  title: "Fresnel Monolith",
  lineage: "The Orb",
  signature: "Inner light bursts from the top like a beacon at full charge.",
  interaction: "Hover to charge the beacon; release lets it cool back down.",
  deps: ["three@0.160.0", "gsap@3.12.5"],
};

/* ---------------------------------------------------------------- Royal palette ---- */
const ROYAL = {
  void: "#07060D",
  ink: "#150E2A",
  royal: "#7C3AED",
  deep: "#4C1D95",
  lilac: "#A855F7",
  halo: "#C4B5FD",
  white: "#F6F3FE",
  flare: "#E8409B",
};

function pal(tokens) {
  const t = tokens || {};
  return {
    void: t.void || ROYAL.void,
    ink: t.ink || ROYAL.ink,
    royal: t.royal || ROYAL.royal,
    deep: t.deep || ROYAL.deep,
    lilac: t.lilac || ROYAL.lilac,
    halo: t.halo || ROYAL.halo,
    white: t.white || ROYAL.white,
    flare: t.flare || ROYAL.flare,
  };
}

/* ------------------------------------------------------------------- utilities ---- */
function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    return false;
  }
}

function isCoarsePointer() {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch (e) {
    return false;
  }
}

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch (e) {
    return false;
  }
}

/* ---------------------------------------------------------------------- mount ---- */
export function mount(container, opts = {}) {
  const P = pal(opts.tokens);
  const reducedInit = !!opts.reducedMotion || prefersReducedMotion();
  const coarse = isCoarsePointer();

  /* state shared by closures */
  let disposed = false;
  let running = false;
  let reduced = reducedInit;
  let rafId = 0;
  let revealTimer = 0;

  // sizes
  let W = 1, H = 1, DPR = 1;

  // interaction
  let hovering = false;
  let charge = 0;            // 0..1 charge level
  let chargeTarget = 0;      // where charge eases toward
  let burst = 0;             // 0..1 burst envelope (the screenshot moment)
  let burstCooldown = 0;     // prevents repeated bursts while held
  let pointerX = 0, pointerY = 0;   // -1..1 normalized
  let pointerXt = 0, pointerYt = 0; // targets (smoothed)
  let entranceT = 0;         // 0..1 entrance progress driven by gsap
  let ro = null;             // ResizeObserver (declared early — bindEvents runs in ctor)
  let entranceTl = null;     // gsap entrance timeline (declared early — playEntrance runs in ctor)
  let last = 0;              // last rAF timestamp (declared early — start() runs in ctor)

  /* ---------- DOM scaffolding ---------- */
  container.style.background =
    `radial-gradient(120% 90% at 50% 18%, ${P.ink} 0%, ${P.void} 62%)`;

  const root = document.createElement("div");
  root.style.cssText =
    "position:absolute;inset:0;overflow:hidden;";
  container.appendChild(root);

  // static gradient fallback layer (also the never-blank failsafe)
  const fallback = document.createElement("div");
  fallback.style.cssText =
    `position:absolute;inset:0;opacity:0;transition:opacity .5s ease;` +
    `background:` +
    `radial-gradient(60% 42% at 50% 30%, ${hexA(P.royal,0.55)} 0%, transparent 60%),` +
    `linear-gradient(180deg, ${hexA(P.halo,0.0)} 0%, ${hexA(P.lilac,0.18)} 100%),` +
    `radial-gradient(120% 90% at 50% 18%, ${P.ink} 0%, ${P.void} 62%);`;
  root.appendChild(fallback);

  // overlays (grain + vignette + copy) live above canvas
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:absolute;inset:0;pointer-events:none;";
  root.appendChild(overlay);

  // vignette
  const vignette = document.createElement("div");
  vignette.style.cssText =
    `position:absolute;inset:0;pointer-events:none;` +
    `background:radial-gradient(120% 100% at 50% 42%, transparent 46%, ${hexA("#000000",0.62)} 100%);`;
  overlay.appendChild(vignette);

  // film grain (procedural svg noise data-uri, animated subtly via opacity flicker)
  const grain = document.createElement("div");
  grain.style.cssText =
    `position:absolute;inset:-30%;pointer-events:none;mix-blend-mode:overlay;opacity:.05;` +
    `background-image:url("${grainURI()}");background-size:240px 240px;`;
  overlay.appendChild(grain);

  // copy block (French Québec) — masked reveal
  const copy = document.createElement("div");
  copy.style.cssText =
    `position:absolute;left:0;right:0;bottom:6.5%;text-align:center;pointer-events:none;` +
    `font-family:"Inter","Helvetica Neue",Arial,system-ui,sans-serif;`;
  const k = document.createElement("div");
  k.textContent = "VANTA · SIGNAL";
  k.style.cssText =
    `font-size:10px;letter-spacing:.42em;text-transform:uppercase;` +
    `color:${hexA(P.halo,0.72)};margin-bottom:7px;` +
    `opacity:0;transform:translateY(8px);`;
  const head = document.createElement("div");
  head.textContent = "Trouvé partout.";
  head.style.cssText =
    `font-family:"Playfair Display","Times New Roman",Georgia,serif;` +
    `font-size:clamp(15px,4.4vw,26px);color:${P.white};font-weight:600;` +
    `letter-spacing:.005em;opacity:0;transform:translateY(12px);`;
  const sub = document.createElement("div");
  sub.innerHTML = `Survolez pour charger le faisceau · <span style="color:${hexA(P.halo,0.85)}">Google + IA</span>`;
  sub.style.cssText =
    `font-size:10.5px;letter-spacing:.02em;color:${hexA(P.white,0.5)};` +
    `margin-top:6px;opacity:0;transform:translateY(8px);`;
  copy.appendChild(k);
  copy.appendChild(head);
  copy.appendChild(sub);
  overlay.appendChild(copy);

  // charge meter hairline (top-left) — tactile readout
  const meter = document.createElement("div");
  meter.style.cssText =
    `position:absolute;left:7%;top:8%;width:34%;max-width:160px;pointer-events:none;` +
    `font-family:"Inter",system-ui,sans-serif;opacity:0;transform:translateY(-6px);`;
  const meterLabel = document.createElement("div");
  meterLabel.innerHTML =
    `<span style="font-size:9px;letter-spacing:.28em;text-transform:uppercase;color:${hexA(P.halo,0.65)}">Citations IA</span>` +
    `<span style="float:right;font-size:9px;color:${hexA(P.white,0.55)};font-variant-numeric:tabular-nums" id="vm-pct">0 %</span>`;
  const meterTrack = document.createElement("div");
  meterTrack.style.cssText =
    `position:relative;height:2px;margin-top:6px;border-radius:2px;` +
    `background:${hexA(P.white,0.08)};overflow:hidden;`;
  const meterFill = document.createElement("div");
  meterFill.style.cssText =
    `position:absolute;left:0;top:0;bottom:0;width:0%;border-radius:2px;` +
    `background:linear-gradient(90deg, ${P.deep}, ${P.royal}, ${P.halo});` +
    `box-shadow:0 0 8px ${hexA(P.royal,0.8)};`;
  meterTrack.appendChild(meterFill);
  meter.appendChild(meterLabel);
  meter.appendChild(meterTrack);
  overlay.appendChild(meter);
  const pctEl = meterLabel.querySelector("#vm-pct");

  /* ---------- WebGL capability guard ---------- */
  if (!webglOK()) {
    return staticFallback("no-webgl");
  }

  /* ---------- three.js scene ---------- */
  let renderer, scene, camera;
  let monolith, fresnelShell, beam, beamCore, topCap, basePlate, atmo, sparks;
  let fresnelMat, beamMat, beamCoreMat, capMat, monoMat, atmoMat, sparkMat;
  let geos = [];
  let mats = [];

  // scratch (no per-frame alloc)
  const scratchColA = new THREE.Color();
  const scratchColB = new THREE.Color();

  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const cv = renderer.domElement;
    cv.style.cssText = "position:absolute;inset:0;display:block;width:100%;height:100%;";
    root.insertBefore(cv, overlay); // canvas under overlay, above fallback

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.35, 7.2);
    camera.lookAt(0, 0.15, 0);

    buildScene();
    measure();
    bindEvents();

    // force a guaranteed-visible state regardless of timers
    revealTimer = window.setTimeout(forceReveal, 3500);

    if (reduced) {
      snapStatic();
    } else {
      playEntrance();
      start();
    }

    // one render so first paint is never blank even before rAF kicks
    renderOnce();
  } catch (err) {
    cleanupThree();
    return staticFallback("webgl-init-failed");
  }

  /* ------------------------------------------------------- scene construction ---- */
  function buildScene() {
    // --- The monolith: a tall rounded slab of near-black obsidian ---
    const mGeo = new THREE.BoxGeometry(1.5, 3.5, 0.7, 1, 1, 1);
    geos.push(mGeo);
    monoMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(P.void),
      metalness: 0.62,
      roughness: 0.28,
      emissive: new THREE.Color(P.deep),
      emissiveIntensity: 0.12,
    });
    mats.push(monoMat);
    monolith = new THREE.Mesh(mGeo, monoMat);
    monolith.position.y = 0.0;
    scene.add(monolith);

    // --- Fresnel shell: slightly larger transparent slab w/ razor rim-light ---
    const fGeo = new THREE.BoxGeometry(1.54, 3.54, 0.74, 1, 1, 1);
    geos.push(fGeo);
    fresnelMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      uniforms: {
        uTime: { value: 0 },
        uCharge: { value: 0 },
        uRim: { value: new THREE.Color(P.lilac) },
        uRimHot: { value: new THREE.Color(P.halo) },
        uPower: { value: 2.6 },
        uReveal: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vView;
        varying vec3 vPos;
        void main(){
          vec4 wp = modelMatrix * vec4(position,1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vView = normalize(cameraPosition - wp.xyz);
          vPos = position;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vN;
        varying vec3 vView;
        varying vec3 vPos;
        uniform float uTime;
        uniform float uCharge;
        uniform float uPower;
        uniform float uReveal;
        uniform vec3 uRim;
        uniform vec3 uRimHot;
        void main(){
          float f = 1.0 - max(dot(normalize(vN), normalize(vView)), 0.0);
          float rim = pow(f, uPower);
          // razor edge accent on vertical extremities
          float yy = vPos.y / 1.77;            // -1..1
          float topGlow = smoothstep(0.2, 1.0, yy) * (0.35 + uCharge*0.9);
          // travelling shimmer up the rim
          float shimmer = 0.5 + 0.5*sin(vPos.y*3.0 - uTime*2.2 + uCharge*6.0);
          shimmer = mix(0.7, 1.0, shimmer);
          vec3 col = mix(uRim, uRimHot, clamp(rim*1.2 + uCharge, 0.0, 1.0));
          float a = (rim*0.9 + topGlow*0.5) * shimmer;
          a *= uReveal;
          gl_FragColor = vec4(col * (1.0 + uCharge*0.6), a);
        }
      `,
    });
    mats.push(fresnelMat);
    fresnelShell = new THREE.Mesh(fGeo, fresnelMat);
    scene.add(fresnelShell);

    // --- Inner light core: a soft emissive plane riding up inside the slab face ---
    const coreGeo = new THREE.PlaneGeometry(1.2, 3.3, 1, 1);
    geos.push(coreGeo);
    beamCoreMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uCharge: { value: 0 },
        uBurst: { value: 0 },
        uReveal: { value: 0 },
        uColA: { value: new THREE.Color(P.royal) },
        uColB: { value: new THREE.Color(P.halo) },
        uColHot: { value: new THREE.Color(P.flare) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uCharge;
        uniform float uBurst;
        uniform float uReveal;
        uniform vec3 uColA;
        uniform vec3 uColB;
        uniform vec3 uColHot;
        void main(){
          // horizontal falloff (centered column of light)
          float cx = 1.0 - smoothstep(0.0, 0.5, abs(vUv.x-0.5));
          // pulse rising upward: a soft band that climbs over time
          float climb = fract(uTime*0.32);
          float wave = 0.6 + 0.4*sin((vUv.y - climb)*12.566 - uTime*1.4);
          // light pools toward the top, more so with charge
          float vert = mix(0.15, 1.0, pow(vUv.y, mix(2.2, 0.8, uCharge)));
          float body = cx * vert * wave;
          // burst: a hot surge concentrated at the very top
          float top = smoothstep(0.62, 1.0, vUv.y);
          body += top * uBurst * cx * 2.4;
          vec3 col = mix(uColA, uColB, vert);
          col = mix(col, uColHot, clamp(uBurst*top*1.3, 0.0, 1.0)); // rare magenta flare at top
          float a = body * (0.32 + uCharge*0.5 + uBurst*0.6) * uReveal;
          gl_FragColor = vec4(col, clamp(a,0.0,1.0));
        }
      `,
    });
    mats.push(beamCoreMat);
    beamCore = new THREE.Mesh(coreGeo, beamCoreMat);
    beamCore.position.z = 0.36; // just in front of slab face
    scene.add(beamCore);

    // --- The vertical beacon beam shooting OUT the top (the signature) ---
    const beamGeo = new THREE.CylinderGeometry(0.02, 0.46, 5.0, 24, 1, true);
    geos.push(beamGeo);
    beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uCharge: { value: 0 },
        uBurst: { value: 0 },
        uReveal: { value: 0 },
        uColA: { value: new THREE.Color(P.royal) },
        uColB: { value: new THREE.Color(P.halo) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vY;
        void main(){
          vUv = uv;
          vY = uv.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        varying float vY;
        uniform float uTime;
        uniform float uCharge;
        uniform float uBurst;
        uniform float uReveal;
        uniform vec3 uColA;
        uniform vec3 uColB;
        void main(){
          // radial softness across the cone wall
          float edge = 1.0 - abs(vUv.x-0.5)*2.0;
          edge = pow(max(edge,0.0), 1.4);
          // taper: bright at base, fading toward the sky tip
          float taper = pow(1.0 - vY, 1.6);
          float pulse = 0.7 + 0.3*sin(vY*22.0 - uTime*8.0);
          float a = edge * taper * pulse * uBurst * 0.9 * uReveal;
          vec3 col = mix(uColB, uColA, vY);
          gl_FragColor = vec4(col*1.4, clamp(a,0.0,1.0));
        }
      `,
    });
    mats.push(beamMat);
    beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 1.77 + 2.5; // base of cone at slab top, extending up
    scene.add(beam);

    // --- Top cap: glowing sprite-like disc that flares on burst ---
    const capGeo = new THREE.PlaneGeometry(2.4, 2.4, 1, 1);
    geos.push(capGeo);
    capMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uCharge: { value: 0 },
        uBurst: { value: 0 },
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uCol: { value: new THREE.Color(P.halo) },
        uHot: { value: new THREE.Color(P.flare) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uCharge;
        uniform float uBurst;
        uniform float uTime;
        uniform float uReveal;
        uniform vec3 uCol;
        uniform vec3 uHot;
        void main(){
          vec2 p = vUv - 0.5;
          float d = length(p);
          float core = smoothstep(0.5, 0.0, d);
          // sharp central spark
          float spark = smoothstep(0.16, 0.0, d);
          // anamorphic horizontal streak on burst (lens-flare feel)
          float streak = smoothstep(0.5, 0.0, abs(p.y)*7.0) * smoothstep(0.5, 0.0, abs(p.x));
          float glow = core*(0.25 + uCharge*0.5) + spark*(0.4+uBurst*1.4) + streak*uBurst*1.2;
          vec3 col = mix(uCol, uHot, clamp(uBurst*0.7,0.0,1.0));
          gl_FragColor = vec4(col, glow * uReveal);
        }
      `,
    });
    mats.push(capMat);
    topCap = new THREE.Mesh(capGeo, capMat);
    topCap.position.y = 1.77; // at the top edge of the slab
    topCap.position.z = 0.42;
    scene.add(topCap);

    // --- Ambient atmosphere: large soft radial behind everything ---
    const atmoGeo = new THREE.PlaneGeometry(16, 16, 1, 1);
    geos.push(atmoGeo);
    atmoMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uCharge: { value: 0 },
        uReveal: { value: 0 },
        uCol: { value: new THREE.Color(P.royal) },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uCharge;
        uniform float uReveal;
        uniform float uTime;
        uniform vec3 uCol;
        void main(){
          vec2 p = vUv - vec2(0.5, 0.46);
          float d = length(p*vec2(1.1,1.0));
          float breathe = 0.5 + 0.5*sin(uTime*0.8);
          float g = smoothstep(0.5, 0.0, d) * (0.10 + uCharge*0.20 + breathe*0.03);
          gl_FragColor = vec4(uCol, g * uReveal);
        }
      `,
    });
    mats.push(atmoMat);
    atmo = new THREE.Mesh(atmoGeo, atmoMat);
    atmo.position.z = -2.0;
    scene.add(atmo);

    // --- Reflective base plate (grounding + a mirror smear of the glow) ---
    const baseGeo = new THREE.PlaneGeometry(6, 4, 1, 1);
    geos.push(baseGeo);
    const baseMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uCharge: { value: 0 },
        uReveal: { value: 0 },
        uCol: { value: new THREE.Color(P.deep) },
        uHot: { value: new THREE.Color(P.royal) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uCharge;
        uniform float uReveal;
        uniform vec3 uCol;
        uniform vec3 uHot;
        void main(){
          float cx = 1.0 - smoothstep(0.0, 0.45, abs(vUv.x-0.5));
          float fade = smoothstep(0.0, 0.85, 1.0 - vUv.y); // reflection fades downward
          vec3 col = mix(uCol, uHot, uCharge*0.6);
          float a = cx * fade * (0.10 + uCharge*0.22) * uReveal;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    mats.push(baseMat);
    basePlate = new THREE.Mesh(baseGeo, baseMat);
    basePlate.rotation.x = -Math.PI / 2.0;
    basePlate.position.y = -1.78;
    basePlate.position.z = 0.2;
    scene.add(basePlate);
    basePlate.userData.mat = baseMat;

    // --- Sparks: GPU points that rise on burst (rarest white embers) ---
    const SPARKN = coarse ? 36 : 80;
    const sPos = new Float32Array(SPARKN * 3);
    const sSeed = new Float32Array(SPARKN);
    for (let i = 0; i < SPARKN; i++) {
      sPos[i * 3 + 0] = (Math.random() - 0.5) * 1.0;
      sPos[i * 3 + 1] = Math.random();        // 0..1, used as phase up the beam
      sPos[i * 3 + 2] = 0.36 + (Math.random() - 0.5) * 0.1;
      sSeed[i] = Math.random();
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    sGeo.setAttribute("aSeed", new THREE.BufferAttribute(sSeed, 1));
    geos.push(sGeo);
    sparkMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBurst: { value: 0 },
        uCharge: { value: 0 },
        uReveal: { value: 0 },
        uColA: { value: new THREE.Color(P.halo) },
        uColB: { value: new THREE.Color(P.white) },
        uDpr: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        varying float vA;
        varying float vHot;
        uniform float uTime;
        uniform float uBurst;
        uniform float uCharge;
        uniform float uDpr;
        void main(){
          float phase = fract(position.y + uTime*(0.25+aSeed*0.4) + aSeed);
          float rise = mix(-1.6, 4.6, phase);
          vec3 p = vec3(position.x*(0.6+aSeed*0.5), rise, position.z);
          // converge toward the beacon axis as they climb
          p.x *= mix(1.0, 0.18, smoothstep(0.0, 3.0, rise));
          float life = smoothstep(1.0,0.7,phase)*smoothstep(0.0,0.15,phase);
          vA = life * (uBurst*0.85 + uCharge*0.15);
          vHot = aSeed;
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          gl_Position = projectionMatrix * mv;
          float sz = (1.2 + aSeed*2.2) * (1.0 + uBurst*2.0) * uDpr;
          gl_PointSize = sz * (60.0 / -mv.z);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying float vA;
        varying float vHot;
        uniform float uReveal;
        uniform vec3 uColA;
        uniform vec3 uColB;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA * uReveal;
          vec3 col = mix(uColA, uColB, smoothstep(0.7,1.0,vHot));
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    mats.push(sparkMat);
    sparks = new THREE.Points(sGeo, sparkMat);
    scene.add(sparks);

    // soft key + fill so the obsidian reads as a solid object
    const key = new THREE.PointLight(new THREE.Color(P.lilac), 2.4, 30);
    key.position.set(2.6, 3.2, 4.0);
    scene.add(key);
    const fill = new THREE.PointLight(new THREE.Color(P.deep), 1.6, 30);
    fill.position.set(-3.0, -1.0, 3.0);
    scene.add(fill);
    const amb = new THREE.AmbientLight(new THREE.Color(P.ink), 0.7);
    scene.add(amb);
    // (lights are disposed implicitly with scene; no geometry/material to free)
  }

  /* ----------------------------------------------------------- entrance (gsap) ---- */
  function playEntrance() {
    if (entranceTl) entranceTl.kill();
    entranceT = 0;
    // ensure copy hidden before reveal
    gsap.set([k, head, sub], { opacity: 0 });
    gsap.set(meter, { opacity: 0, y: -6 });

    entranceTl = gsap.timeline({
      onUpdate: () => { /* entranceT used in loop via proxy */ },
    });
    // monolith rises + reveal uniform ramps
    const proxy = { r: 0, lift: 0.55, spin: -0.42 };
    entranceTl.to(proxy, {
      r: 1, lift: 0, spin: 0,
      duration: 1.05, ease: "expo.out",
      onUpdate: () => {
        entranceT = proxy.r;
        if (monolith) {
          monolith.position.y = proxy.lift * -1.4;
          monolith.rotation.y = proxy.spin;
        }
        if (fresnelShell) { fresnelShell.position.y = monolith.position.y; fresnelShell.rotation.y = monolith.rotation.y; }
        if (beamCore) { beamCore.position.y = monolith.position.y; beamCore.rotation.y = monolith.rotation.y * 0.4; }
        if (topCap) topCap.position.y = 1.77 + monolith.position.y;
        if (beam) beam.position.y = 1.77 + 2.5 + monolith.position.y;
        setReveal(proxy.r);
      },
    });
    // copy masked reveal
    entranceTl.to(k, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.45);
    entranceTl.to(head, { opacity: 1, y: 0, duration: 0.8, ease: "power4.out" }, 0.55);
    entranceTl.to(sub, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.7);
    entranceTl.to(meter, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.6);
  }

  function setReveal(v) {
    const vv = Math.max(0, Math.min(1, v));
    if (fresnelMat) fresnelMat.uniforms.uReveal.value = vv;
    if (beamCoreMat) beamCoreMat.uniforms.uReveal.value = vv;
    if (beamMat) beamMat.uniforms.uReveal.value = vv;
    if (capMat) capMat.uniforms.uReveal.value = vv;
    if (atmoMat) atmoMat.uniforms.uReveal.value = vv;
    if (sparkMat) sparkMat.uniforms.uReveal.value = vv;
    if (basePlate && basePlate.userData.mat) basePlate.userData.mat.uniforms.uReveal.value = vv;
  }

  /* ------------------------------------------------------------------ the loop ---- */
  function tick(now) {
    if (disposed) return;
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    // smooth pointer
    pointerX += (pointerXt - pointerX) * Math.min(1, dt * 7);
    pointerY += (pointerYt - pointerY) * Math.min(1, dt * 7);

    // charge dynamics
    chargeTarget = hovering ? 1 : 0;
    const rate = hovering ? 0.85 : 1.6; // charges slower than it cools? cool faster so it feels eager
    charge += (chargeTarget - charge) * Math.min(1, dt * (hovering ? 1.7 : 3.0));
    charge = Math.max(0, Math.min(1, charge));

    // trigger burst when fully charged (the screenshot moment), once per charge-up
    if (charge > 0.985 && burstCooldown <= 0 && hovering) {
      fireBurst();
      burstCooldown = 1; // require charge to drop before next burst
    }
    if (charge < 0.6) burstCooldown = 0;

    // burst envelope decays
    burst += (0 - burst) * Math.min(1, dt * 2.4);
    if (burst < 0.001) burst = 0;

    // --- drive uniforms ---
    if (fresnelMat) {
      fresnelMat.uniforms.uTime.value = t;
      fresnelMat.uniforms.uCharge.value = charge;
    }
    if (beamCoreMat) {
      beamCoreMat.uniforms.uTime.value = t;
      beamCoreMat.uniforms.uCharge.value = charge;
      beamCoreMat.uniforms.uBurst.value = burst;
    }
    if (beamMat) {
      beamMat.uniforms.uTime.value = t;
      beamMat.uniforms.uCharge.value = charge;
      beamMat.uniforms.uBurst.value = burst;
    }
    if (capMat) {
      capMat.uniforms.uTime.value = t;
      capMat.uniforms.uCharge.value = charge;
      capMat.uniforms.uBurst.value = burst;
    }
    if (atmoMat) {
      atmoMat.uniforms.uTime.value = t;
      atmoMat.uniforms.uCharge.value = charge;
    }
    if (sparkMat) {
      sparkMat.uniforms.uTime.value = t;
      sparkMat.uniforms.uCharge.value = charge;
      sparkMat.uniforms.uBurst.value = burst;
    }
    if (basePlate && basePlate.userData.mat) {
      basePlate.userData.mat.uniforms.uCharge.value = charge;
    }

    // emissive on the obsidian breathes with charge
    if (monoMat) {
      monoMat.emissiveIntensity = 0.12 + charge * 0.35 + burst * 0.5;
      scratchColA.set(P.deep);
      scratchColB.set(P.royal);
      scratchColA.lerp(scratchColB, charge * 0.7 + burst * 0.3);
      monoMat.emissive.copy(scratchColA);
    }

    // --- ambient life: slow breathing sway + parallax toward cursor ---
    if (monolith && entranceT > 0.5) {
      const idleSway = Math.sin(t * 0.6) * 0.05;
      const targetRotY = idleSway + pointerX * 0.28;
      const targetRotX = -pointerY * 0.14 + Math.sin(t * 0.45) * 0.015;
      monolith.rotation.y += (targetRotY - monolith.rotation.y) * Math.min(1, dt * 3);
      monolith.rotation.x += (targetRotX - monolith.rotation.x) * Math.min(1, dt * 3);
      fresnelShell.rotation.copy(monolith.rotation);
      beamCore.rotation.y = monolith.rotation.y;
      beamCore.rotation.x = monolith.rotation.x;
      // subtle camera dolly toward charge (push-in on the beacon)
      camera.position.z += (7.2 - charge * 0.6 - camera.position.z) * Math.min(1, dt * 2.5);
      camera.position.x += (pointerX * 0.25 - camera.position.x) * Math.min(1, dt * 2.5);
      camera.lookAt(0, 0.15, 0);
    }

    // top cap scales with charge/burst (the flare blooms)
    if (topCap) {
      const s = 1 + charge * 0.5 + burst * 1.6;
      topCap.scale.set(s, s, s);
    }
    if (beam) {
      const s = 0.7 + burst * 0.9;
      beam.scale.x = s; beam.scale.z = s;
    }

    // --- DOM meter readout (no layout thrash; just style writes) ---
    const pct = Math.round(charge * 100);
    meterFill.style.width = pct + "%";
    if (pctEl) pctEl.textContent = pct + " %";

    // grain flicker (cheap)
    grain.style.opacity = (0.045 + Math.sin(t * 13.0) * 0.012).toFixed(3);

    renderer.render(scene, camera);
  }

  function fireBurst() {
    burst = 1;
    // a quick punch on the cap + beam via gsap for a snappier envelope tip
    if (typeof gsap !== "undefined") {
      gsap.fromTo({ b: 1 }, { b: 1 }, {
        b: 0, duration: 0.9, ease: "power3.out",
        onUpdate: function () { /* envelope handled in loop; this is a no-op pacing guard */ },
      });
    }
    // brief copy emphasis
    gsap.fromTo(head, { color: P.white }, { color: P.halo, duration: 0.12, yoyo: true, repeat: 1, ease: "power1.inOut" });
  }

  function renderOnce() {
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  /* --------------------------------------------------------------- start/stop ---- */
  function start() {
    if (running || disposed || reduced) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ------------------------------------------------------------------ events ---- */
  function bindEvents() {
    container.addEventListener("pointerenter", onEnter);
    container.addEventListener("pointerleave", onLeave);
    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", measure);

    ro = new ResizeObserver(measure);
    ro.observe(container);
  }
  function unbindEvents() {
    container.removeEventListener("pointerenter", onEnter);
    container.removeEventListener("pointerleave", onLeave);
    container.removeEventListener("pointermove", onMove);
    container.removeEventListener("pointerdown", onDown);
    window.removeEventListener("resize", measure);
    if (ro) { try { ro.disconnect(); } catch (e) {} ro = null; }
  }

  function onEnter() {
    if (reduced) return;
    hovering = true;
  }
  function onLeave() {
    hovering = false;
    pointerXt = 0; pointerYt = 0;
  }
  function onMove(e) {
    if (reduced) return;
    const r = container.getBoundingClientRect();
    pointerXt = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointerYt = ((e.clientY - r.top) / r.height) * 2 - 1;
  }
  function onDown() {
    if (reduced) return;
    // click = instant charge kick → guarantees the burst even on a quick tap
    hovering = true;
    charge = Math.max(charge, 0.99);
  }

  /* ------------------------------------------------------------------ resize ---- */
  function measure() {
    if (!renderer) return;
    const r = container.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    renderer.setPixelRatio(DPR);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // keep the tall monolith framed on narrow cells
    camera.fov = W / H < 0.85 ? 44 : 34;
    camera.updateProjectionMatrix();
    if (sparkMat) sparkMat.uniforms.uDpr.value = DPR;
    if (!running) renderOnce();
  }

  /* ----------------------------------------------------------- static / fail ---- */
  function snapStatic() {
    stop();
    setReveal(1);
    entranceT = 1;
    charge = 0.34; // a calm, composed half-charge for the static frame
    burst = 0;
    // place everything at rest pose
    if (monolith) { monolith.position.y = 0; monolith.rotation.set(0, -0.12, 0); }
    if (fresnelShell) fresnelShell.rotation.copy(monolith.rotation);
    if (beamCore) { beamCore.position.y = 0; beamCore.rotation.set(0, -0.05, 0); }
    if (topCap) { topCap.position.y = 1.77; topCap.scale.set(1.18, 1.18, 1.18); }
    // push composed values into uniforms once
    const setU = (m, name, v) => { if (m && m.uniforms[name]) m.uniforms[name].value = v; };
    [fresnelMat, beamCoreMat, capMat, atmoMat].forEach((m) => { setU(m, "uCharge", charge); setU(m, "uTime", 1.2); });
    setU(beamCoreMat, "uBurst", 0.12);
    setU(capMat, "uBurst", 0.1);
    if (monoMat) { monoMat.emissiveIntensity = 0.28; }
    if (basePlate && basePlate.userData.mat) basePlate.userData.mat.uniforms.uCharge.value = charge;
    // reveal copy instantly
    gsap.set([k, head, sub], { opacity: 1, y: 0 });
    gsap.set(meter, { opacity: 1, y: 0 });
    meterFill.style.width = "34%";
    if (pctEl) pctEl.textContent = "34 %";
    renderOnce();
  }

  function forceReveal() {
    // failsafe: if entrance somehow stalled, guarantee a visible composed state
    if (disposed) return;
    if (entranceT < 0.99) {
      setReveal(1);
      entranceT = 1;
      gsap.set([k, head, sub], { opacity: 1, y: 0 });
      gsap.set(meter, { opacity: 1, y: 0 });
      if (!running && !reduced) start();
      renderOnce();
    }
  }

  function staticFallback(reason) {
    // CSS-only beautiful frame — never blank
    fallback.style.opacity = "1";
    // simple beacon glyph drawn with a div so even without WebGL there's a monolith
    const slab = document.createElement("div");
    slab.style.cssText =
      `position:absolute;left:50%;top:50%;width:18%;height:54%;transform:translate(-50%,-50%);` +
      `border-radius:6px;background:linear-gradient(180deg, ${P.ink}, ${P.void});` +
      `box-shadow:0 0 1px ${hexA(P.lilac,0.9)} inset, 0 0 40px ${hexA(P.royal,0.45)}, ` +
      `0 -30px 60px ${hexA(P.halo,0.35)};`;
    const beamDiv = document.createElement("div");
    beamDiv.style.cssText =
      `position:absolute;left:50%;top:8%;width:10px;height:38%;transform:translateX(-50%);` +
      `background:linear-gradient(180deg, ${hexA(P.halo,0.0)}, ${hexA(P.royal,0.55)});` +
      `filter:blur(6px);border-radius:50%;`;
    fallback.appendChild(beamDiv);
    fallback.appendChild(slab);
    gsap.set([k, head, sub], { opacity: 1, y: 0 });
    gsap.set(meter, { opacity: 1, y: 0 });
    meterFill.style.width = "34%";
    if (pctEl) pctEl.textContent = "34 %";

    return {
      replay() {},
      pause() {},
      resume() {},
      setReducedMotion() {},
      destroy() {
        if (revealTimer) clearTimeout(revealTimer);
        try { container.removeChild(root); } catch (e) {}
        container.style.background = "";
      },
      _fallback: reason,
    };
  }

  /* ------------------------------------------------------------------ cleanup ---- */
  function cleanupThree() {
    try {
      geos.forEach((g) => g && g.dispose && g.dispose());
    } catch (e) {}
    try {
      mats.forEach((m) => m && m.dispose && m.dispose());
    } catch (e) {}
    try {
      if (basePlate && basePlate.userData.mat) basePlate.userData.mat.dispose();
    } catch (e) {}
    geos = [];
    mats = [];
    if (renderer) {
      try { renderer.dispose(); } catch (e) {}
      try { renderer.forceContextLoss(); } catch (e) {}
      try {
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      } catch (e) {}
    }
    renderer = null; scene = null; camera = null;
    monolith = fresnelShell = beam = beamCore = topCap = basePlate = atmo = sparks = null;
    fresnelMat = beamMat = beamCoreMat = capMat = monoMat = atmoMat = sparkMat = null;
  }

  /* ------------------------------------------------------------------- handle ---- */
  return {
    replay() {
      if (disposed) return;
      if (reduced) { snapStatic(); return; }
      // reset interaction state
      hovering = false; charge = 0; chargeTarget = 0; burst = 0; burstCooldown = 0;
      pointerX = pointerXt = pointerY = pointerYt = 0;
      if (camera) { camera.position.set(0, 0.35, 7.2); camera.lookAt(0, 0.15, 0); }
      if (revealTimer) clearTimeout(revealTimer);
      revealTimer = window.setTimeout(forceReveal, 3500);
      playEntrance();
      start();
    },
    pause() {
      stop();
    },
    resume() {
      if (disposed || reduced) return;
      start();
    },
    setReducedMotion(v) {
      reduced = !!v;
      if (reduced) {
        if (entranceTl) entranceTl.kill();
        snapStatic();
      } else {
        if (revealTimer) clearTimeout(revealTimer);
        revealTimer = window.setTimeout(forceReveal, 3500);
        playEntrance();
        start();
      }
    },
    destroy() {
      disposed = true;
      stop();
      if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
      if (entranceTl) { try { entranceTl.kill(); } catch (e) {} entranceTl = null; }
      try { gsap.killTweensOf([k, head, sub, meter]); } catch (e) {}
      unbindEvents();
      cleanupThree();
      try { container.removeChild(root); } catch (e) {}
      container.style.background = "";
    },
  };
}

/* ====================================================== small helpers (module) ==== */
// hex (#rrggbb) -> rgba() string with alpha
function hexA(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// procedural film-grain tile as a data URI (no external asset)
function grainURI() {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>` +
    `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>` +
    `<feColorMatrix type='saturate' values='0'/></filter>` +
    `<rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>`;
  return "data:image/svg+xml;utf8," + svg;
}
