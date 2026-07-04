/*
 * Crown Core - #8  ·  ELEVATED V2
 * Lineage: The Orb
 *
 * A distorted royal-emissive icosahedron suspended inside a slow-rotating wireframe
 * double-cage, ringed by a soft fresnel halo and orbited by glowing motes (one rare
 * magenta). It ASSEMBLES from scattered shards - but in V2 the shards don't just snap,
 * they LAND with weight: in the last beat of assembly the triangles COIL inward a hair
 * (anticipation), then on the frame they hit home the lilac flash fires with a sharper
 * attack while an expanding SHOCKWAVE ring rips outward through the halo, the camera
 * takes a 1-frame haptic z-kick, and the whole orb overshoots its scale (easeBackOut,
 * 0.92->1.0) before settling. Synced to that single frame the new hand-rolled composite
 * pass spikes its bloom intensity so the royal/lilac highlights genuinely blossom, and
 * chromatic aberration smears outward with the camera velocity. White is spent only
 * here; the rest of the frame crushes back toward ink-violet void.
 *
 * What V2 adds over V1 (without regressing a single V1 feature):
 *   1. Hand-rolled COMPOSITE pass - render scene to a target, half-res bright-pass
 *      threshold bloom (separable 2-pass gaussian), then ONE final fullscreen frag that
 *      does composite = scene + bloom*intensity, barrel distortion, velocity-coupled
 *      chromatic aberration, shadow-crush toward #150E2A, vignette + grain folded in.
 *   2. Real CORE material - specular glint (half-vector key light), back-fresnel
 *      subsurface absorption, and energy-gated royal lift (saturation only blooms at
 *      the beat; settles toward ink-violet).
 *   3. Depth & parallax - a far additive DUST layer (z=-8..-12, atmospheric void fade)
 *      plus cursor-driven camera micro-parallax layered against the root tilt.
 *   4. Denser, cleaner geometry - coreDetail 2->3 on capable devices, a double-cage
 *      energy-breathing wireframe shell, and orbit nodes as soft additive radial
 *      sprites (procedural alpha) instead of low-poly spheres.
 *   5. Three-phase signature beat - anticipation coil -> sharper flash + halo shockwave
 *      + camera kick -> easeBackOut root-scale settle, all synced to the bloom spike.
 *   6. Tightened grade - shadows crushed toward #150E2A, white reserved for the rarest
 *      sparks (gated behind energy), one earned magenta untouched.
 *
 * Deps: three@0.160.0 (pinned esm.sh). gsap optional - bespoke easing is hand-rolled,
 *       so this module has NO hard gsap dependency.
 * Perf: one WebGL context, instanced sprite nodes, geometry built once, no per-frame
 *       allocation, DPR capped [1,2], rAF-gated, paused offscreen via handle.pause().
 *       Bloom target is DPR-capped + half-res. Coarse-pointer / small devices drop
 *       shard count, dust count, detail + DPR. Capability-guarded with a painted static
 *       gradient fallback so it NEVER renders blank.
 */

import * as THREE from "https://esm.sh/three@0.160.0";

export const meta = {
  id: 8,
  slug: "crown-core",
  title: "Crown Core",
  lineage: "The Orb",
  version: "V2",
  signature: "Shards coil, then LAND - lilac flash, shockwave, camera kick, bloom spike.",
  interaction: "Hover spins up the orbit; cursor magnetically tilts and parallaxes the camera.",
  deps: ["three@0.160.0"],
};

/* ---- Royal palette (fallback when no tokens passed) ------------------------ */
const ROYAL = {
  void: "#07060D",
  panel: "#150E2A",
  royal: "#7C3AED",
  deep: "#4C1D95",
  haloA: "#A855F7",
  haloB: "#C4B5FD",
  white: "#F6F3FE",
  flare: "#E8409B", // the single rare magenta
};

/* ---- bespoke easing -------------------------------------------------------- */
const easeExpoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeBackOut = (t, c1 = 1.70158) => {
  const c3 = c1 + 1, x = t - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
};
const easePow4Out = (t) => 1 - Math.pow(1 - t, 4);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
// smoothstep scalar (matches glsl)
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export function mount(container, opts = {}) {
  const tokens = opts.tokens || {};
  const C = {
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
  let reduced = opts.reducedMotion === true || prefersReduced;

  const coarse =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(pointer: coarse)").matches;

  // ---- size --------------------------------------------------------------
  let rect = container.getBoundingClientRect();
  let W = Math.max(1, rect.width || 320);
  let H = Math.max(1, rect.height || 320);
  const small = Math.min(W, H) < 360 || coarse;

  // ---------------------------------------------------------------------------
  // WebGL capability guard + painted fallback (never blank)
  // ---------------------------------------------------------------------------
  function paintFallback(msg) {
    container.innerHTML = "";
    const cv = document.createElement("canvas");
    cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    cv.width = Math.floor(W * dpr);
    cv.height = Math.floor(H * dpr);
    container.appendChild(cv);
    const g = cv.getContext("2d");
    if (g) {
      g.scale(dpr, dpr);
      g.fillStyle = C.void;
      g.fillRect(0, 0, W, H);
      // ink-violet wash so the void has depth even in fallback
      const ink = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      ink.addColorStop(0, C.panel);
      ink.addColorStop(1, C.void);
      g.fillStyle = ink;
      g.fillRect(0, 0, W, H);
      const grd = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.55);
      grd.addColorStop(0, C.royal);
      grd.addColorStop(0.4, C.deep);
      grd.addColorStop(1, C.void);
      g.globalAlpha = 0.55;
      g.fillStyle = grd;
      g.beginPath();
      g.arc(W / 2, H / 2, Math.min(W, H) * 0.32, 0, Math.PI * 2);
      g.fill();
      // single magenta mote, the royal-spent-as-light gesture
      g.globalAlpha = 0.9;
      g.fillStyle = C.flare;
      g.beginPath();
      g.arc(W / 2 + Math.min(W, H) * 0.26, H / 2 - Math.min(W, H) * 0.12, 2.4, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
    if (msg) console.warn("[crown-core] fallback:", msg);
    return {
      replay() {},
      pause() {},
      resume() {},
      setReducedMotion() {},
      destroy() {
        try { container.removeChild(cv); } catch (e) {}
      },
    };
  }

  let testGL;
  try {
    const t = document.createElement("canvas");
    testGL = t.getContext("webgl2") || t.getContext("webgl") || t.getContext("experimental-webgl");
  } catch (e) {
    testGL = null;
  }
  if (!testGL) return paintFallback("no webgl");

  // ---------------------------------------------------------------------------
  // Renderer / scene / camera
  // ---------------------------------------------------------------------------
  let renderer, scene, camera;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !small, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    return paintFallback("renderer ctor failed");
  }
  const DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const pixelRatio = small ? Math.min(1.5, DPR) : DPR;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
  const CAM_Z = 6.2;
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, 0);

  const cVoid = new THREE.Color(C.void);
  const cPanel = new THREE.Color(C.panel);
  const cRoyal = new THREE.Color(C.royal);
  const cDeep = new THREE.Color(C.deep);
  const cHaloA = new THREE.Color(C.haloA);
  const cHaloB = new THREE.Color(C.haloB);
  const cWhite = new THREE.Color(C.white);
  const cFlare = new THREE.Color(C.flare);

  // Root group we tilt with the cursor + scale-overshoot on the settle.
  const root = new THREE.Group();
  scene.add(root);

  // disposables registry
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  // ---------------------------------------------------------------------------
  // Procedural soft radial sprite texture (for dust + orbit motes).
  // Anti-aliased glow disc; no network asset.
  // ---------------------------------------------------------------------------
  function makeSpriteTexture(size) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const g = cv.getContext("2d");
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0.0, "rgba(255,255,255,1.0)");
    grd.addColorStop(0.25, "rgba(255,255,255,0.85)");
    grd.addColorStop(0.5, "rgba(255,255,255,0.25)");
    grd.addColorStop(1.0, "rgba(255,255,255,0.0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }
  const spriteTex = track(makeSpriteTexture(64));

  // ---------------------------------------------------------------------------
  // 1) The CORE - distorted emissive icosahedron (custom shader)
  //    Domain-warped vertex displacement + real material. Shards = faces that fly in,
  //    with anticipation-coil in the last beat of assembly.
  // ---------------------------------------------------------------------------
  const coreDetail = small ? 1 : 3; // V2: 2 -> 3 finer facets on capable devices
  const baseGeo = new THREE.IcosahedronGeometry(1.35, coreDetail);
  // Non-indexed so each triangle is an independent "shard" with its own attributes.
  const coreGeo = track(baseGeo.toNonIndexed());
  baseGeo.dispose();

  const posAttr = coreGeo.getAttribute("position");
  const triCount = posAttr.count / 3;

  // Per-vertex shard data: centroid (for fly-in origin) + per-shard random + delay.
  const aCentroid = new Float32Array(posAttr.count * 3);
  const aShardRand = new Float32Array(posAttr.count);
  const aShardDelay = new Float32Array(posAttr.count);
  const aScatter = new Float32Array(posAttr.count * 3); // scattered start offset

  const tmpC = new THREE.Vector3();
  for (let i = 0; i < triCount; i++) {
    const i0 = i * 3, i1 = i0 + 1, i2 = i0 + 2;
    tmpC.x = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3;
    tmpC.y = (posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2)) / 3;
    tmpC.z = (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3;
    const rnd = Math.random();
    // scatter direction: pushed outward from centroid + random jitter
    const dir = tmpC.clone().normalize();
    const dist = 3.2 + rnd * 3.0;
    const sx = dir.x * dist + (Math.random() - 0.5) * 2.2;
    const sy = dir.y * dist + (Math.random() - 0.5) * 2.2;
    const sz = dir.z * dist + (Math.random() - 0.5) * 2.2;
    const delay = rnd * 0.55; // staggered snap
    for (let v of [i0, i1, i2]) {
      aCentroid[v * 3] = tmpC.x;
      aCentroid[v * 3 + 1] = tmpC.y;
      aCentroid[v * 3 + 2] = tmpC.z;
      aShardRand[v] = rnd;
      aShardDelay[v] = delay;
      aScatter[v * 3] = sx;
      aScatter[v * 3 + 1] = sy;
      aScatter[v * 3 + 2] = sz;
    }
  }
  coreGeo.setAttribute("aCentroid", new THREE.BufferAttribute(aCentroid, 3));
  coreGeo.setAttribute("aShardRand", new THREE.BufferAttribute(aShardRand, 1));
  coreGeo.setAttribute("aShardDelay", new THREE.BufferAttribute(aShardDelay, 1));
  coreGeo.setAttribute("aScatter", new THREE.BufferAttribute(aScatter, 3));
  coreGeo.computeVertexNormals();

  const coreUniforms = {
    uTime: { value: 0 },
    uAssemble: { value: 0 },     // 0 scattered -> 1 home
    uFlash: { value: 0 },        // lilac snap flash
    uEnergy: { value: 0 },       // V2: gates royal lift + white sparks
    uDistort: { value: small ? 0.12 : 0.18 },
    cRoyal: { value: cRoyal },
    cDeep: { value: cDeep },
    cPanel: { value: cPanel },
    cHaloA: { value: cHaloA },
    cHaloB: { value: cHaloB },
    cWhite: { value: cWhite },
    uReduced: { value: reduced ? 1 : 0 },
  };

  const coreMat = track(new THREE.ShaderMaterial({
    uniforms: coreUniforms,
    transparent: true,
    depthWrite: true,
    blending: THREE.NormalBlending,
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uAssemble;
      uniform float uDistort;
      uniform float uReduced;
      attribute vec3 aCentroid;
      attribute vec3 aScatter;
      attribute float aShardRand;
      attribute float aShardDelay;
      varying vec3 vN;
      varying vec3 vViewDir;
      varying vec3 vViewN;       // view-space normal for specular key light
      varying float vRand;
      varying float vAssembleLocal;

      // cheap 3d noise (value-ish via sin field) - no texture needed
      float hash(vec3 p){ return fract(sin(dot(p, vec3(17.1,113.5,57.3)))*43758.5453); }
      float noise(vec3 p){
        vec3 i=floor(p); vec3 f=fract(p);
        f=f*f*(3.0-2.0*f);
        float n=mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                        mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                    mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                        mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
        return n*2.0-1.0;
      }

      void main(){
        vRand = aShardRand;
        // per-shard assemble progress with stagger; backOut style overshoot
        float a = clamp((uAssemble - aShardDelay) / max(0.0001, (1.0 - aShardDelay)), 0.0, 1.0);
        // backOut easing inline
        float x = a - 1.0;
        float c1 = 1.9; float c3 = c1 + 1.0;
        float ab = 1.0 + c3*x*x*x + c1*x*x;
        vAssembleLocal = a;

        // breathing domain-warp displacement (idle life)
        float n = noise(position*1.7 + uTime*0.35 + aShardRand*6.28);
        float disp = uDistort * n * (uReduced > 0.5 ? 0.45 : 1.0);
        vec3 home = position + normal * disp;

        // ---- ANTICIPATION COIL (V2) ------------------------------------------
        // In the last ~0.16 of each shard's local assembly, pull it slightly PAST
        // home toward the centroid (coil) before the backOut springs it out.
        // Windowed so it only happens just before the snap, then releases.
        float coilWin = smoothstep(0.70, 0.86, a) * (1.0 - smoothstep(0.86, 1.0, a));
        vec3 toCenter = normalize(aCentroid - position + vec3(1e-4));
        home += toCenter * coilWin * 0.12;

        // start scattered + spun, end home
        vec3 scattered = aScatter;
        // add a swirl to scattered start
        float ang = (1.0 - ab) * (3.0 + aShardRand*4.0);
        float cs = cos(ang), sn = sin(ang);
        scattered.xz = mat2(cs,-sn,sn,cs) * scattered.xz;

        vec3 p = mix(scattered, home, ab);

        vec4 wp = modelMatrix * vec4(p, 1.0);
        vViewDir = normalize(cameraPosition - wp.xyz);
        vN = normalize(mat3(modelMatrix) * normal);
        vViewN = normalize(normalMatrix * normal);

        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime;
      uniform float uFlash;
      uniform float uEnergy;
      uniform vec3 cRoyal, cDeep, cPanel, cHaloA, cHaloB, cWhite;
      varying vec3 vN;
      varying vec3 vViewDir;
      varying vec3 vViewN;
      varying float vRand;
      varying float vAssembleLocal;

      void main(){
        vec3 N = normalize(vN);
        vec3 V = normalize(vViewDir);
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float fres = pow(1.0 - ndv, 2.4);

        // emissive royal body, deeper in the valleys
        vec3 body = mix(cDeep, cRoyal, 0.45 + 0.55*fres);
        // lilac fresnel rim
        vec3 rim = mix(cHaloA, cHaloB, fres);
        vec3 col = mix(body, rim, fres*0.9);

        // ---- SPECULAR GLINT (V2) --------------------------------------------
        // fixed key light in view space; half-vector against view dir (also view space).
        vec3 Nv = normalize(vViewN);
        vec3 keyDir = normalize(vec3(0.45, 0.7, 0.85));
        vec3 Vv = vec3(0.0, 0.0, 1.0); // camera looks down -z in view space
        vec3 Hh = normalize(keyDir + Vv);
        float spec = pow(max(dot(Nv, Hh), 0.0), 64.0);
        col += cWhite * spec * 0.35;

        // ---- BACK-FRESNEL SUBSURFACE / ABSORPTION (V2) ----------------------
        // light bleeding through the emissive body, tinted toward cDeep.
        float back = pow(1.0 - fres, 3.0);
        col += cDeep * back * 0.18;

        // ---- per-shard sparkle: rarest shards glow white at their tips -------
        // V2: gate white behind energy so settled idle frames stay royal/lilac.
        float spark = step(0.93, vRand) * pow(fres, 1.5);
        float sparkW = spark * (0.18 + 0.82 * uEnergy); // white reserved for beats
        col = mix(col, cWhite, clamp(sparkW, 0.0, 0.9) * 0.8);

        // assemble flash - lilac bloom right as shard lands
        float land = smoothstep(0.7, 1.0, vAssembleLocal) * (1.0 - smoothstep(1.0, 1.25, vAssembleLocal));
        col += cHaloB * land * 0.6;

        // global signature flash (sharper attack handled host-side)
        col += cHaloB * uFlash * (0.5 + fres);

        // slight additive glow feel via brightness lift on rim
        col += rim * fres * 0.25;

        // ---- ENERGY-GATED ROYAL LIFT (V2) -----------------------------------
        // saturation only blooms at the beat; crush toward cPanel between beats.
        col = mix(col, col*1.3 + cRoyal*0.15, uEnergy);
        col = mix(mix(cPanel, col, 0.55), col, smoothstep(0.0, 0.25, uEnergy + fres*0.4));

        float alpha = clamp(0.85 + fres*0.15, 0.0, 1.0);
        // fade shards that haven't started assembling (keeps scatter subtle)
        alpha *= mix(0.15, 1.0, clamp(vAssembleLocal*2.0, 0.0, 1.0));
        gl_FragColor = vec4(col, alpha);
      }
    `,
  }));
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  root.add(coreMesh);

  // ---------------------------------------------------------------------------
  // 2) WIREFRAME SHELL - DOUBLE CAGE (V2): two concentric icosahedron edge sets,
  //    additive lilac, opacity breathes with uEnergy.
  // ---------------------------------------------------------------------------
  const shellMatA = track(new THREE.LineBasicMaterial({
    color: cHaloA,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  const shellMatB = track(new THREE.LineBasicMaterial({
    color: cHaloB,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  // outer cage
  let shellBaseA = new THREE.IcosahedronGeometry(2.05, 1);
  const shellEdgesA = track(new THREE.EdgesGeometry(shellBaseA, 1));
  shellBaseA.dispose();
  const shellA = new THREE.LineSegments(shellEdgesA, shellMatA);
  root.add(shellA);
  // inner cage (detail 0, slightly smaller) - the double-cage read
  let shellBaseB = new THREE.IcosahedronGeometry(1.78, 0);
  const shellEdgesB = track(new THREE.EdgesGeometry(shellBaseB, 1));
  shellBaseB.dispose();
  const shellB = new THREE.LineSegments(shellEdgesB, shellMatB);
  root.add(shellB);

  // ---------------------------------------------------------------------------
  // 3) HALO - billboard fresnel ring sprite (shader plane facing camera)
  //    V2: adds an expanding SHOCKWAVE ring driven by uShock.
  // ---------------------------------------------------------------------------
  const haloGeo = track(new THREE.PlaneGeometry(6.2, 6.2, 1, 1));
  const haloUniforms = {
    uTime: { value: 0 },
    uReveal: { value: 0 },
    uShock: { value: 0 },     // V2: 0..1 expanding shockwave progress
    uEnergy: { value: 0 },
    cHaloA: { value: cHaloA },
    cHaloB: { value: cHaloB },
    cRoyal: { value: cRoyal },
    cWhite: { value: cWhite },
  };
  const haloMat = track(new THREE.ShaderMaterial({
    uniforms: haloUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      precision highp float;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime;
      uniform float uReveal;
      uniform float uShock;
      uniform float uEnergy;
      uniform vec3 cHaloA, cHaloB, cRoyal, cWhite;
      varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        // soft annulus ring
        float ring = smoothstep(0.78, 0.55, r) * smoothstep(0.30, 0.55, r);
        // gentle inner glow
        float glow = smoothstep(0.62, 0.0, r) * 0.35;
        float pulse = 0.85 + 0.15*sin(uTime*1.3) + uEnergy*0.25;
        vec3 col = mix(cRoyal, cHaloB, smoothstep(0.45,0.7,r));
        float a = (ring*0.9 + glow) * pulse * uReveal;
        // rotating shimmer along the ring
        float ang = atan(p.y, p.x);
        float shimmer = 0.5 + 0.5*sin(ang*6.0 - uTime*1.6);
        col += cHaloB * ring * shimmer * 0.25;

        // ---- EXPANDING SHOCKWAVE (V2) -------------------------------------
        // a thin bright ring that rips outward when uShock animates 0->1.
        float swR = mix(0.10, 0.98, uShock);
        float swWidth = 0.045 + 0.05*uShock;
        float sw = smoothstep(swWidth, 0.0, abs(r - swR));
        float swFade = (1.0 - uShock); // dims as it travels out
        vec3 swCol = mix(cHaloB, cWhite, 0.4);
        col += swCol * sw * swFade * 1.4;
        a += sw * swFade * 0.9 * uReveal;

        gl_FragColor = vec4(col, a);
      }
    `,
  }));
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.position.z = -0.6;
  scene.add(halo); // in scene (not root) so it always faces camera flat

  // ---------------------------------------------------------------------------
  // 3b) FAR DUST LAYER (V2) - additive Points field at z=-8..-12, dim deep/panel,
  //     atmospheric void-fade at edges. Gives true parallax separation.
  // ---------------------------------------------------------------------------
  const DUST_COUNT = small ? 140 : 320;
  const dustGeo = track(new THREE.BufferGeometry());
  {
    const dpos = new Float32Array(DUST_COUNT * 3);
    const dsize = new Float32Array(DUST_COUNT);
    const drand = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      // spread across a wide slab behind the orb
      dpos[i * 3] = (Math.random() - 0.5) * 22.0;
      dpos[i * 3 + 1] = (Math.random() - 0.5) * 16.0;
      dpos[i * 3 + 2] = -8.0 - Math.random() * 4.0; // z = -8..-12
      dsize[i] = 6.0 + Math.random() * 18.0;
      drand[i] = Math.random();
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
    dustGeo.setAttribute("aSize", new THREE.BufferAttribute(dsize, 1));
    dustGeo.setAttribute("aRand", new THREE.BufferAttribute(drand, 1));
  }
  const dustUniforms = {
    uTime: { value: 0 },
    uReveal: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uTex: { value: spriteTex },
    cDeep: { value: cDeep },
    cPanel: { value: cPanel },
    cHaloA: { value: cHaloA },
  };
  const dustMat = track(new THREE.ShaderMaterial({
    uniforms: dustUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      precision highp float;
      uniform float uTime;
      uniform float uPixelRatio;
      attribute float aSize;
      attribute float aRand;
      varying float vFog;
      varying float vTwinkle;
      void main(){
        vec3 pos = position;
        // slow drift
        pos.x += sin(uTime*0.07 + aRand*6.28) * 0.6;
        pos.y += cos(uTime*0.05 + aRand*5.13) * 0.5;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        // atmospheric fade: dimmer the farther / the more eccentric
        float distXY = length(pos.xy);
        vFog = smoothstep(13.0, 4.0, distXY); // void fade at the edges
        vTwinkle = 0.5 + 0.5*sin(uTime*0.6 + aRand*40.0);
        gl_PointSize = aSize * uPixelRatio * (300.0 / max(0.001, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uTex;
      uniform float uReveal;
      uniform vec3 cDeep, cPanel, cHaloA;
      varying float vFog;
      varying float vTwinkle;
      void main(){
        float m = texture2D(uTex, gl_PointCoord).a;
        if (m < 0.01) discard;
        vec3 col = mix(cPanel, cDeep, 0.5);
        col = mix(col, cHaloA, vTwinkle*0.12);
        float a = m * vFog * (0.16 + vTwinkle*0.10) * uReveal;
        gl_FragColor = vec4(col, a);
      }
    `,
  }));
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust); // in scene so it parallaxes against root

  // ---------------------------------------------------------------------------
  // 4) ORBIT NODES - instanced soft additive radial SPRITES (V2: not low-poly
  //    spheres). One is magenta. Camera-facing motes that bloom cleanly.
  // ---------------------------------------------------------------------------
  const NODE_COUNT = small ? 7 : 11;
  // a unit quad per instance; billboarded + sized + colored in the shader.
  const nodeGeo = track(new THREE.InstancedBufferGeometry());
  {
    const quad = new Float32Array([
      -0.5, -0.5, 0,   0.5, -0.5, 0,   0.5, 0.5, 0,
      -0.5, -0.5, 0,   0.5, 0.5, 0,   -0.5, 0.5, 0,
    ]);
    const uv = new Float32Array([
      0, 0,  1, 0,  1, 1,
      0, 0,  1, 1,  0, 1,
    ]);
    nodeGeo.setAttribute("position", new THREE.BufferAttribute(quad, 3));
    nodeGeo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }
  // per-instance attributes (filled per-frame from JS; allocated once)
  const aOffset = new Float32Array(NODE_COUNT * 3);
  const aNodeScale = new Float32Array(NODE_COUNT);
  const aNodeColor = new Float32Array(NODE_COUNT * 3);
  nodeGeo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(aOffset, 3));
  nodeGeo.setAttribute("aNodeScale", new THREE.InstancedBufferAttribute(aNodeScale, 1));
  nodeGeo.setAttribute("aNodeColor", new THREE.InstancedBufferAttribute(aNodeColor, 3));
  const offsetAttr = nodeGeo.getAttribute("aOffset");
  const scaleAttr = nodeGeo.getAttribute("aNodeScale");

  const nodeUniforms = {
    uTex: { value: spriteTex },
    uReveal: { value: 0 },
    uEnergy: { value: 0 },
  };
  const nodeMat = track(new THREE.ShaderMaterial({
    uniforms: nodeUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      precision highp float;
      uniform float uEnergy;
      attribute vec3 aOffset;
      attribute float aNodeScale;
      attribute vec3 aNodeColor;
      varying vec2 vUv;
      varying vec3 vCol;
      void main(){
        vUv = uv;
        vCol = aNodeColor;
        // billboard: build the sprite in view space around the instance offset.
        vec4 center = modelViewMatrix * vec4(aOffset, 1.0);
        float s = aNodeScale * (1.0 + uEnergy*0.25);
        center.xy += position.xy * s;
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uTex;
      uniform float uReveal;
      varying vec2 vUv;
      varying vec3 vCol;
      void main(){
        float m = texture2D(uTex, vUv).a;
        if (m < 0.01) discard;
        // hot core + soft halo
        float core = pow(m, 2.2);
        vec3 col = vCol * (0.6 + core*1.6);
        float a = m * uReveal;
        gl_FragColor = vec4(col, a);
      }
    `,
  }));
  const nodes = new THREE.Mesh(nodeGeo, nodeMat);
  nodes.frustumCulled = false;
  root.add(nodes);

  // per-node params (no per-frame alloc later)
  const nodeRadius = new Float32Array(NODE_COUNT);
  const nodeSpeed = new Float32Array(NODE_COUNT);
  const nodePhase = new Float32Array(NODE_COUNT);
  const nodeIncl = new Float32Array(NODE_COUNT);     // ring inclination
  const nodeYaw = new Float32Array(NODE_COUNT);       // ring yaw
  const nodeSize = new Float32Array(NODE_COUNT);
  const magentaIndex = Math.floor(Math.random() * NODE_COUNT);

  for (let i = 0; i < NODE_COUNT; i++) {
    nodeRadius[i] = 2.25 + Math.random() * 0.55;
    nodeSpeed[i] = (0.25 + Math.random() * 0.4) * (Math.random() < 0.5 ? 1 : -1);
    nodePhase[i] = Math.random() * Math.PI * 2;
    nodeIncl[i] = (Math.random() - 0.5) * 1.3;
    nodeYaw[i] = Math.random() * Math.PI;
    // sprite base size in world units (bigger than the old 0.06 spheres so glow reads)
    nodeSize[i] = i === magentaIndex ? 0.62 : 0.30 + Math.random() * 0.22;
    const col = i === magentaIndex ? cFlare : (Math.random() < 0.3 ? cHaloB : cRoyal);
    aNodeColor[i * 3] = col.r;
    aNodeColor[i * 3 + 1] = col.g;
    aNodeColor[i * 3 + 2] = col.b;
  }
  nodeGeo.getAttribute("aNodeColor").needsUpdate = true;

  // magenta trail ring (the only full-orbit line; the rare alert path)
  const trailGeo = track(new THREE.BufferGeometry());
  {
    const seg = 96;
    const arr = new Float32Array((seg + 1) * 3);
    trailGeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  }
  const trailMat = track(new THREE.LineBasicMaterial({
    color: cFlare,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  const trail = new THREE.Line(trailGeo, trailMat);
  root.add(trail);

  // ---------------------------------------------------------------------------
  // 5) HAND-ROLLED COMPOSITE PIPELINE (V2) - the headline upgrade.
  //    scene -> sceneRT, bright-pass (half-res) -> brightRT, 2x gaussian blur ->
  //    blurRT/blurRT2, final fullscreen frag = scene + bloom + barrel + CA + grade.
  // ---------------------------------------------------------------------------
  const fsScene = new THREE.Scene();
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsGeo = track(new THREE.PlaneGeometry(2, 2));

  function makeRT(w, h, depth) {
    const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: !!depth, // only the 3D scene target needs depth
      stencilBuffer: false,
    });
    return rt;
  }
  const rtW = () => Math.max(1, Math.floor(W * pixelRatio));
  const rtH = () => Math.max(1, Math.floor(H * pixelRatio));
  const bloomScale = 0.5; // half-res bright extract
  let sceneRT = makeRT(rtW(), rtH(), true);
  let brightRT = makeRT(Math.floor(rtW() * bloomScale), Math.floor(rtH() * bloomScale), false);
  let blurRTa = makeRT(Math.floor(rtW() * bloomScale), Math.floor(rtH() * bloomScale), false);
  let blurRTb = makeRT(Math.floor(rtW() * bloomScale), Math.floor(rtH() * bloomScale), false);
  disposables.push(sceneRT, brightRT, blurRTa, blurRTb);

  // -- bright-pass material (luma threshold, keep royal/lilac) ----------------
  const brightUniforms = {
    tDiffuse: { value: null },
    uThreshold: { value: 0.60 },
  };
  const brightMat = track(new THREE.ShaderMaterial({
    uniforms: brightUniforms,
    depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tDiffuse;
      uniform float uThreshold;
      varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        float w = smoothstep(uThreshold, uThreshold + 0.25, luma);
        gl_FragColor = vec4(c.rgb * w, 1.0);
      }
    `,
  }));

  // -- separable gaussian blur material (reused for H and V) ------------------
  const blurUniforms = {
    tDiffuse: { value: null },
    uDir: { value: new THREE.Vector2(1, 0) },
    uTexel: { value: new THREE.Vector2(1 / 256, 1 / 256) },
  };
  const blurMat = track(new THREE.ShaderMaterial({
    uniforms: blurUniforms,
    depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tDiffuse;
      uniform vec2 uDir;
      uniform vec2 uTexel;
      varying vec2 vUv;
      void main(){
        // 9-tap gaussian
        vec2 o = uDir * uTexel;
        vec4 sum = texture2D(tDiffuse, vUv) * 0.2270270270;
        sum += texture2D(tDiffuse, vUv + o*1.3846153846) * 0.3162162162;
        sum += texture2D(tDiffuse, vUv - o*1.3846153846) * 0.3162162162;
        sum += texture2D(tDiffuse, vUv + o*3.2307692308) * 0.0702702703;
        sum += texture2D(tDiffuse, vUv - o*3.2307692308) * 0.0702702703;
        gl_FragColor = sum;
      }
    `,
  }));

  // -- final composite material (bloom + barrel + CA + grade + vignette + grain)
  const compUniforms = {
    tScene: { value: null },
    tBloom: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(W, H) },
    uBloom: { value: 0.85 },        // bloom intensity (spikes on the beat)
    uAberration: { value: 0.0 },    // velocity-coupled CA amount
    uBarrel: { value: 0.012 },      // barrel distortion strength
    cPanel: { value: cPanel },
    cVoid: { value: cVoid },
  };
  const compMat = track(new THREE.ShaderMaterial({
    uniforms: compUniforms,
    depthTest: false, depthWrite: false,
    transparent: true,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D tScene;
      uniform sampler2D tBloom;
      uniform float uTime;
      uniform vec2 uRes;
      uniform float uBloom;
      uniform float uAberration;
      uniform float uBarrel;
      uniform vec3 cPanel, cVoid;
      varying vec2 vUv;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }

      void main(){
        vec2 uv = vUv;
        vec2 c = uv - 0.5;
        float r2 = dot(c, c);

        // ---- BARREL DISTORTION: warp uv by r^2 toward center ----------------
        vec2 buv = uv + c * r2 * uBarrel * -1.0; // pull edges inward slightly

        // ---- CHROMATIC ABERRATION (∝ velocity), radial direction ----------
        vec2 dir = normalize(c + vec2(1e-5));
        float caAmt = uAberration * (0.4 + r2 * 2.2);
        vec2 caOff = dir * caAmt;

        // scene with per-channel radial offset for R/B
        float sr = texture2D(tScene, buv + caOff).r;
        float sg = texture2D(tScene, buv).g;
        float sb = texture2D(tScene, buv - caOff).b;
        vec3 scene = vec3(sr, sg, sb);

        // bloom (also aberrated a touch so highlights smear with velocity)
        float br = texture2D(tBloom, buv + caOff*1.4).r;
        float bg = texture2D(tBloom, buv).g;
        float bb = texture2D(tBloom, buv - caOff*1.4).b;
        vec3 bloom = vec3(br, bg, bb);

        vec3 col = scene + bloom * uBloom;

        // ---- SHADOW CRUSH toward ink-violet #150E2A (the void gets depth) ---
        float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(cPanel, col, smoothstep(0.0, 0.15, luma));

        // ---- DEEP VIGNETTE (folded in) ------------------------------------
        float vig = smoothstep(0.92, 0.30, length(c));
        col *= mix(0.30, 1.0, vig);
        // settle the very edges into pure void
        col = mix(col, cVoid, (1.0 - vig) * 0.5);

        // ---- FILM GRAIN (folded in) ---------------------------------------
        float g = hash(uv * uRes * 0.5 + uTime*60.0);
        col += (g - 0.5) * 0.045;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  }));
  const fsQuad = new THREE.Mesh(fsGeo, compMat);
  fsScene.add(fsQuad);

  function updateTexelSizes() {
    const bw = Math.max(1, Math.floor(rtW() * bloomScale));
    const bh = Math.max(1, Math.floor(rtH() * bloomScale));
    blurUniforms.uTexel.value.set(1 / bw, 1 / bh);
    compUniforms.uRes.value.set(W, H);
  }
  updateTexelSizes();

  // ---------------------------------------------------------------------------
  // STATE machine
  // ---------------------------------------------------------------------------
  let raf = 0;
  let running = false;
  let lastT = 0;
  let elapsed = 0;

  // entrance timeline (seconds)
  const T_ASSEMBLE = 1.15;
  let assembleStart = 0;
  let entranceDone = false;
  let flashFired = false;

  // signature-beat sub-state (V2: anticipation -> payoff -> settle)
  let shockT = 1.0;          // 1 = idle (no shock); animates 0->1 when fired
  let shockFired = false;
  let camKick = 0;           // 1-frame haptic z-kick, eased back
  let settleT = 1.0;         // root-scale settle progress (easeBackOut 0.92->1.0)
  let settleFired = false;

  // interaction targets
  let orbitSpin = 0;          // current
  let orbitSpinTarget = 0.0;  // 0 idle, ~1 hovered
  let idleSpinBase = reduced ? 0 : 0.12;

  // cursor magnetic tilt + camera micro-parallax
  const tiltTarget = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  const camParTarget = { x: 0, y: 0 };
  const camPar = { x: 0, y: 0 };
  let hovering = false;

  // camera velocity (drives chromatic aberration)
  let prevCamX = 0, prevCamY = 0;
  let camVel = 0;

  // energy signal (drives royal lift + white sparks + bloom + shell breathe)
  let energy = 0;

  // spin accumulators
  let orbitAngle = 0;
  let coreYaw = 0;

  // failsafe reveal timer
  let failsafe = 0;

  function fireSignatureBeat(strength) {
    // PAYOFF: sharper flash attack + shockwave + camera kick.
    coreUniforms.uFlash.value = Math.min(1.4, coreUniforms.uFlash.value + strength);
    shockT = 0.0;
    shockFired = true;
    camKick = Math.min(1.0, 0.04 * strength / 1.0 + camKick); // tiny z-kick
    settleT = 0.0;
    settleFired = true;
  }

  function setStaticFrame() {
    // beautifully composed static: fully assembled, halo present, nodes placed,
    // a gentle resting energy so the royal grade reads (not crushed to flat panel).
    coreUniforms.uAssemble.value = 1;
    coreUniforms.uFlash.value = 0;
    coreUniforms.uEnergy.value = 0.32;
    coreUniforms.uReduced.value = 1;
    haloUniforms.uReveal.value = 1;
    haloUniforms.uShock.value = 1; // no active shock
    haloUniforms.uEnergy.value = 0.32;
    dustUniforms.uReveal.value = 1;
    nodeUniforms.uReveal.value = 1;
    nodeUniforms.uEnergy.value = 0.32;
    shellMatA.opacity = 0.5;
    shellMatB.opacity = 0.32;
    trailMat.opacity = 0.18;
    elapsed = 1.2;
    coreUniforms.uTime.value = 1.2;
    haloUniforms.uTime.value = 1.2;
    dustUniforms.uTime.value = 1.2;
    compUniforms.uTime.value = 1.2;
    compUniforms.uBloom.value = 0.85;
    compUniforms.uAberration.value = 0.0;
    orbitAngle = 0.6;
    coreYaw = 0.4;
    root.rotation.set(0.12, 0.4, 0);
    root.scale.setScalar(1);
    camera.position.set(0, 0, CAM_Z);
    camera.lookAt(0, 0, 0);
    coreMesh.rotation.set(0.1, 0.4, 0);
    shellA.rotation.set(0.1, -0.2, 0);
    shellB.rotation.set(-0.15, 0.3, 0.1);
    placeNodes(0.6, 0);
    renderAll();
  }

  // reusable scratch for node placement (no per-frame alloc)
  function placeNodes(angle, t) {
    for (let i = 0; i < NODE_COUNT; i++) {
      const a = nodePhase[i] + angle * nodeSpeed[i] * 6.0;
      const r = nodeRadius[i];
      let x = Math.cos(a) * r;
      let y = Math.sin(a) * r;
      let z = 0;
      const ci = Math.cos(nodeIncl[i]), si = Math.sin(nodeIncl[i]);
      let y2 = y * ci - z * si;
      let z2 = y * si + z * ci;
      const cy = Math.cos(nodeYaw[i]), sy = Math.sin(nodeYaw[i]);
      let x3 = x * cy + z2 * sy;
      let z3 = -x * sy + z2 * cy;
      aOffset[i * 3] = x3;
      aOffset[i * 3 + 1] = y2;
      aOffset[i * 3 + 2] = z3;
      const pulse = i === magentaIndex ? 1.0 + 0.25 * Math.sin(t * 4.0) : 1.0;
      aNodeScale[i] = nodeSize[i] * pulse;
    }
    offsetAttr.needsUpdate = true;
    scaleAttr.needsUpdate = true;

    // magenta trail ring follows magenta node's orbit plane
    const seg = 96;
    const arr = trailGeo.getAttribute("position").array;
    const r = nodeRadius[magentaIndex];
    const ci = Math.cos(nodeIncl[magentaIndex]), si = Math.sin(nodeIncl[magentaIndex]);
    const cy = Math.cos(nodeYaw[magentaIndex]), sy = Math.sin(nodeYaw[magentaIndex]);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      let x = Math.cos(a) * r, y = Math.sin(a) * r, z = 0;
      let y2 = y * ci - z * si;
      let z2 = y * si + z * ci;
      let x3 = x * cy + z2 * sy;
      let z3 = -x * sy + z2 * cy;
      arr[k * 3] = x3; arr[k * 3 + 1] = y2; arr[k * 3 + 2] = z3;
    }
    trailGeo.getAttribute("position").needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // RENDER - multi-pass composite pipeline
  // ---------------------------------------------------------------------------
  function renderAll() {
    // 1) scene -> sceneRT
    renderer.setRenderTarget(sceneRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);

    // 2) bright-pass: sceneRT -> brightRT (half-res)
    brightUniforms.tDiffuse.value = sceneRT.texture;
    fsQuad.material = brightMat;
    renderer.setRenderTarget(brightRT);
    renderer.clear(true, true, false);
    renderer.render(fsScene, fsCam);

    // 3) gaussian blur H: brightRT -> blurRTa
    fsQuad.material = blurMat;
    blurUniforms.tDiffuse.value = brightRT.texture;
    blurUniforms.uDir.value.set(1, 0);
    renderer.setRenderTarget(blurRTa);
    renderer.clear(true, true, false);
    renderer.render(fsScene, fsCam);

    // 4) gaussian blur V: blurRTa -> blurRTb
    blurUniforms.tDiffuse.value = blurRTa.texture;
    blurUniforms.uDir.value.set(0, 1);
    renderer.setRenderTarget(blurRTb);
    renderer.clear(true, true, false);
    renderer.render(fsScene, fsCam);

    // 5) final composite -> screen
    compUniforms.tScene.value = sceneRT.texture;
    compUniforms.tBloom.value = blurRTb.texture;
    fsQuad.material = compMat;
    renderer.setRenderTarget(null);
    renderer.clear(true, true, false);
    renderer.render(fsScene, fsCam);
  }

  // ---------------------------------------------------------------------------
  // animation loop
  // ---------------------------------------------------------------------------
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!lastT) lastT = now;
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.05) dt = 0.05; // clamp big gaps (tab refocus)
    elapsed += dt;

    coreUniforms.uTime.value = elapsed;
    haloUniforms.uTime.value = elapsed;
    dustUniforms.uTime.value = elapsed;
    compUniforms.uTime.value = elapsed;

    // ---- entrance: assemble shards ----
    if (!entranceDone) {
      const a = clamp01((elapsed - assembleStart) / T_ASSEMBLE);
      const eased = easeExpoOut(a);
      coreUniforms.uAssemble.value = eased;
      // shell + halo + dust + nodes reveal slightly behind
      const rev = easePow4Out(clamp01((elapsed - assembleStart - 0.15) / 0.8));
      shellMatA.opacity = lerp(0, 0.55, rev);
      shellMatB.opacity = lerp(0, 0.34, rev);
      haloUniforms.uReveal.value = rev;
      dustUniforms.uReveal.value = rev;
      nodeUniforms.uReveal.value = rev;
      trailMat.opacity = lerp(0, 0.2, rev);

      // signature flash fires right as assembly completes - three-phase beat
      if (a >= 0.88 && !flashFired) {
        flashFired = true;
        fireSignatureBeat(1.2); // PAYOFF: sharper flash + shock + cam kick + settle
      }
      if (a >= 1) entranceDone = true;
    }

    // flash decay (sharper attack, smooth decay)
    if (coreUniforms.uFlash.value > 0) {
      coreUniforms.uFlash.value = Math.max(0, coreUniforms.uFlash.value - dt * 3.6);
    }

    // shockwave travel (expands outward over ~0.32s, then rests at 1 = inactive)
    if (shockFired && shockT < 1.0) {
      shockT = Math.min(1.0, shockT + dt / 0.32);
      if (shockT >= 1.0) shockFired = false;
    }
    haloUniforms.uShock.value = shockT;

    // camera 1-frame haptic kick, eased back
    if (camKick > 0) camKick = Math.max(0, camKick - dt * 6.0);

    // root-scale settle: easeBackOut 0.92 -> 1.0 with weight (c1=1.9)
    if (settleFired && settleT < 1.0) {
      settleT = Math.min(1.0, settleT + dt / 0.55);
      if (settleT >= 1.0) settleFired = false;
    }
    const settleScale = settleFired || settleT < 1.0
      ? lerp(0.92, 1.0, easeBackOut(settleT, 1.9))
      : 1.0;

    // ---- idle + interaction spin ----
    orbitSpin += (orbitSpinTarget - orbitSpin) * Math.min(1, dt * 6.0);
    const totalSpin = idleSpinBase + orbitSpin;
    orbitAngle += dt * totalSpin;
    coreYaw += dt * (idleSpinBase * 0.5 + orbitSpin * 0.6);

    // ---- ENERGY signal: blends flash + spin into [0..1]; drives the grade -----
    const energyTarget = clamp01(coreUniforms.uFlash.value * 0.8 + orbitSpin * 0.35 + 0.06);
    energy += (energyTarget - energy) * Math.min(1, dt * 5.0);
    coreUniforms.uEnergy.value = energy;
    haloUniforms.uEnergy.value = energy;
    nodeUniforms.uEnergy.value = energy;

    if (!reduced) {
      coreMesh.rotation.y = coreYaw;
      coreMesh.rotation.x = Math.sin(elapsed * 0.4) * 0.12;
      // double-cage: counter-rotate the two cages for a parallax shimmer
      shellA.rotation.y = -coreYaw * 0.5;
      shellA.rotation.x = coreYaw * 0.25;
      shellB.rotation.y = coreYaw * 0.35;
      shellB.rotation.x = -coreYaw * 0.18 + 0.1;
      // double-cage opacity breathes with energy
      shellMatA.opacity = lerp(0.40, 0.75, energy) * clamp01(haloUniforms.uReveal.value);
      shellMatB.opacity = lerp(0.22, 0.5, energy) * clamp01(haloUniforms.uReveal.value);
      // halo subtle pulse-scale (transform only)
      const hp = 1 + Math.sin(elapsed * 1.3) * 0.02;
      halo.scale.set(hp, hp, 1);
    }

    // cursor magnetic tilt (root)
    tilt.x += (tiltTarget.x - tilt.x) * Math.min(1, dt * 5.0);
    tilt.y += (tiltTarget.y - tilt.y) * Math.min(1, dt * 5.0);
    root.rotation.x = tilt.x;
    root.rotation.y = tilt.y;
    root.scale.setScalar(settleScale);

    // ---- CAMERA MICRO-PARALLAX (V2) + haptic kick -------------------------
    camPar.x += (camParTarget.x - camPar.x) * Math.min(1, dt * 4.0);
    camPar.y += (camParTarget.y - camPar.y) * Math.min(1, dt * 4.0);
    if (!reduced) {
      camera.position.x = camPar.x;
      camera.position.y = camPar.y;
    } else {
      camera.position.x = 0;
      camera.position.y = 0;
    }
    camera.position.z = CAM_Z - camKick; // tiny z-kick eased back
    camera.lookAt(0, 0, 0);

    // ---- camera velocity -> chromatic aberration ---------------------------
    const dx = camera.position.x - prevCamX;
    const dy = camera.position.y - prevCamY;
    prevCamX = camera.position.x;
    prevCamY = camera.position.y;
    const instVel = Math.sqrt(dx * dx + dy * dy) / Math.max(0.0001, dt);
    camVel += (instVel - camVel) * Math.min(1, dt * 8.0);
    // CA scales with velocity + a spike from the flash beat
    compUniforms.uAberration.value =
      Math.min(0.018, camVel * 0.010 + coreUniforms.uFlash.value * 0.012);

    // ---- bloom intensity: spikes with the flash beat -----------------------
    const bloomTarget = 0.7 + coreUniforms.uFlash.value * 1.3 + energy * 0.25;
    compUniforms.uBloom.value = lerp(compUniforms.uBloom.value, bloomTarget, Math.min(1, dt * 8.0));

    placeNodes(orbitAngle, elapsed);

    // magenta trail glows brighter while spun up
    trailMat.opacity = lerp(trailMat.opacity, 0.18 + orbitSpin * 0.45, Math.min(1, dt * 4));

    renderAll();
  }

  // ---------------------------------------------------------------------------
  // interaction listeners
  // ---------------------------------------------------------------------------
  function onEnter() {
    hovering = true;
    if (reduced) return;
    orbitSpinTarget = 1.2;
  }
  function onLeave() {
    hovering = false;
    orbitSpinTarget = 0.0;
    tiltTarget.x = 0;
    tiltTarget.y = 0;
    camParTarget.x = 0;
    camParTarget.y = 0;
  }
  function onMove(e) {
    if (reduced) return;
    const r = container.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;   // 0..1
    const py = (e.clientY - r.top) / r.height;
    // magnetic tilt toward cursor (capped)
    tiltTarget.y = (px - 0.5) * 0.6;
    tiltTarget.x = (py - 0.5) * 0.6;
    // camera micro-parallax (smaller, opposite-ish for depth separation)
    camParTarget.x = (px - 0.5) * 0.25;
    camParTarget.y = -(py - 0.5) * 0.25;
  }
  function onClick() {
    if (reduced) return;
    // a click re-fires the signature beat (smaller) + brief spin kick
    fireSignatureBeat(0.8);
    orbitSpinTarget = 1.6;
    setTimeout(() => { if (!hovering) orbitSpinTarget = 0.0; else orbitSpinTarget = 1.2; }, 280);
  }

  // pointer events (coarse pointers: tap toggles spin, no tilt)
  if (!coarse) {
    container.addEventListener("pointerenter", onEnter);
    container.addEventListener("pointerleave", onLeave);
    container.addEventListener("pointermove", onMove);
  } else {
    let on = false;
    container.addEventListener("pointerdown", () => {
      on = !on;
      orbitSpinTarget = on ? 1.0 : 0.0;
      if (on) fireSignatureBeat(0.7);
    });
  }
  container.addEventListener("click", onClick);

  // ---------------------------------------------------------------------------
  // resize
  // ---------------------------------------------------------------------------
  let ro;
  function applySize() {
    rect = container.getBoundingClientRect();
    W = Math.max(1, rect.width || W);
    H = Math.max(1, rect.height || H);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    // resize render targets to match the (DPR-scaled) drawing buffer
    sceneRT.setSize(rtW(), rtH());
    const bw = Math.max(1, Math.floor(rtW() * bloomScale));
    const bh = Math.max(1, Math.floor(rtH() * bloomScale));
    brightRT.setSize(bw, bh);
    blurRTa.setSize(bw, bh);
    blurRTb.setSize(bw, bh);
    updateTexelSizes();
    if (!running) renderAll();
  }
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => applySize());
    ro.observe(container);
  } else {
    window.addEventListener("resize", applySize);
  }

  // ---------------------------------------------------------------------------
  // lifecycle
  // ---------------------------------------------------------------------------
  function start() {
    if (running) return;
    running = true;
    lastT = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function beginEntrance() {
    entranceDone = false;
    flashFired = false;
    shockFired = false;
    shockT = 1.0;
    settleFired = false;
    settleT = 1.0;
    camKick = 0;
    energy = 0;
    assembleStart = elapsed;
    coreUniforms.uAssemble.value = 0;
    coreUniforms.uFlash.value = 0;
    coreUniforms.uEnergy.value = 0;
    haloUniforms.uReveal.value = 0;
    haloUniforms.uShock.value = 1;
    dustUniforms.uReveal.value = 0;
    nodeUniforms.uReveal.value = 0;
    shellMatA.opacity = 0;
    shellMatB.opacity = 0;
    trailMat.opacity = 0;
    root.scale.setScalar(0.92);
  }

  // ---- boot ----
  if (reduced) {
    setStaticFrame();
    // no loop, no autoplay
  } else {
    beginEntrance();
    start();
    // reveal failsafe: if anything wedged the entrance, force the assembled state
    failsafe = setTimeout(() => {
      if (!entranceDone) {
        coreUniforms.uAssemble.value = 1;
        coreUniforms.uEnergy.value = 0.3;
        shellMatA.opacity = 0.55;
        shellMatB.opacity = 0.34;
        haloUniforms.uReveal.value = 1;
        haloUniforms.uShock.value = 1;
        dustUniforms.uReveal.value = 1;
        nodeUniforms.uReveal.value = 1;
        root.scale.setScalar(1);
        entranceDone = true;
        if (!running && !reduced) start();
      }
    }, 3500);
  }

  // ---------------------------------------------------------------------------
  // handle
  // ---------------------------------------------------------------------------
  return {
    replay() {
      if (reduced) { setStaticFrame(); return; }
      beginEntrance();
      if (!running) start();
    },
    pause() {
      stop();
    },
    resume() {
      if (reduced) return;
      if (!running) start();
    },
    setReducedMotion(b) {
      reduced = !!b;
      coreUniforms.uReduced.value = reduced ? 1 : 0;
      idleSpinBase = reduced ? 0 : 0.12;
      if (reduced) {
        stop();
        setStaticFrame();
      } else {
        beginEntrance();
        start();
      }
    },
    destroy() {
      stop();
      if (failsafe) clearTimeout(failsafe);
      // listeners
      if (!coarse) {
        container.removeEventListener("pointerenter", onEnter);
        container.removeEventListener("pointerleave", onLeave);
        container.removeEventListener("pointermove", onMove);
      }
      container.removeEventListener("click", onClick);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", applySize);
      // dispose tracked geo/mat/textures + render targets
      for (const d of disposables) {
        try { d.dispose && d.dispose(); } catch (e) {}
      }
      // renderer
      try {
        renderer.dispose();
        renderer.forceContextLoss && renderer.forceContextLoss();
      } catch (e) {}
      try {
        if (renderer.domElement && renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      } catch (e) {}
      // null refs
      renderer = null; scene = null; camera = null;
      sceneRT = null; brightRT = null; blurRTa = null; blurRTb = null;
    },
  };
}
