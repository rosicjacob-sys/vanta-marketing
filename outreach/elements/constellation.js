// 31 · Node Constellation - lineage: The Ledger - VERSION V2 (ELEVATED)
// A force-directed 3D graph of Québec restaurants, cities & channels settling under
// spring physics. A single ring of WHITE LIGHT races edge-by-edge from the seed
// restaurant outward through every BFS layer - each pulse a comet-streak running the
// link like a lit fuse - then the whole lattice flexes outward and springs back with a
// damped overshoot, the one earned hot-magenta flare fires, and the just-lit nodes flash
// their French labels in with a clip-path wipe. The cursor magnetically tugs the nearest
// node AND micro-parallaxes the camera so the cloud reads as a tangible held object.
//
// V2 vs V1 - what was pushed (all V1 features preserved):
//   1. Hand-rolled COMPOSITE PASS: scene -> WebGLRenderTarget -> fullscreen triangle with
//      bright-pass threshold bloom (9-tap separable Gaussian), velocity-driven chromatic
//      aberration (peaks at the cascade crest / on drag-release), subtle barrel distortion,
//      and graded vignette + grain composited INSIDE the shader (replaces the flat CSS look).
//   2. COMET-STREAK pulses: each pulse renders as 3 trailing points (t, t-trail, t-2·trail)
//      with falling alpha - light running down a fuse, not a hopping dot. Hot finale = longer tail.
//   3. FRESNEL nodes + DEPTH grade: custom ShaderMaterial with a fresnel rim tinted to lilac,
//      a darker interior core, and a near/far z-grade (far nodes crush to ink, near nodes lift
//      to royal) giving real volume + z-layering.
//   4. CAMERA micro-parallax to the cursor (spring-lerped), so you peer around the lattice.
//   5. Cascade DRAMATIC ARC: anticipation (inhale, seed swells, frame crushes to void) ->
//      payoff (accelerating BFS ring, aberration ramps to peak at the rim) -> settle with a
//      radial velocity-impulse overshoot the spring physics pulls back. BFS-ring spine intact.
//   6. Masked French LABELS: lit nodes flash their names with a left-to-right clip-path wipe +
//      lilac hairline underline, projected to screen, fading as excite decays.
//
// Deps: three@0.160.0 (WebGL). No gsap - easing is hand-rolled (expo/back/cubic/elastic).
// Perf: single WebGL context; InstancedMesh for nodes/halos; one additive LineSegments for
//       edges; fixed pulse pool (no per-frame alloc); DPR capped to [1,2]; physics on a fixed
//       substep; offscreen pause()/resume(); FULL dispose in destroy() (incl. RT + composite).
//       Coarse-pointer / small viewport -> fewer nodes, no bloom, thinner work.
//       prefers-reduced-motion / opts.reducedMotion -> static composed mid-cascade frame.
//       WebGL-failure -> CSS gradient + dotted fallback so it never renders blank.

import * as THREE from "https://esm.sh/three@0.160.0";

export const meta = {
  id: 31,
  slug: "node-constellation",
  title: "Node Constellation",
  lineage: "The Ledger",
  version: "V2",
  signature:
    "An inhale, then a ring of white comet-light races edge-by-edge to the rim, the lattice flexes and springs, one magenta flare fires, and the lit nodes flash their French names.",
  interaction:
    "Drag any node - the lattice springs and re-settles; the cursor also tugs the nearest node and micro-parallaxes the camera so you peer around the cloud.",
  deps: ["three@0.160.0"],
};

// ---- Royal System palette (fallback when no tokens passed) ------------------
const ROYAL = {
  void: "#07060D",
  ink: "#150E2A",
  royal: "#7C3AED",
  deep: "#4C1D95",
  lilacA: "#A855F7",
  lilacC: "#C4B5FD",
  white: "#F6F3FE",
  flare: "#E8409B",
};

export function mount(container, opts = {}) {
  const tokens = (opts && opts.tokens) || {};
  const C = {
    void: tokens.void || ROYAL.void,
    ink: tokens.ink || ROYAL.ink,
    royal: tokens.royal || ROYAL.royal,
    deep: tokens.deep || ROYAL.deep,
    lilacA: tokens.lilacA || ROYAL.lilacA,
    lilacC: tokens.lilacC || ROYAL.lilacC,
    white: tokens.white || ROYAL.white,
    flare: tokens.flare || ROYAL.flare,
  };

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let reducedMotion = !!opts.reducedMotion || prefersReduced;

  const coarse =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(pointer: coarse)").matches;

  // ---- size -----------------------------------------------------------------
  let rect = container.getBoundingClientRect();
  let W = Math.max(1, rect.width || 480);
  let H = Math.max(1, rect.height || 360);
  const small = () => Math.min(W, H) < 360;

  const c3 = (hex) => new THREE.Color(hex);

  // ---- easing (bespoke) -----------------------------------------------------
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---- WebGL capability guard ----------------------------------------------
  function webglOK() {
    try {
      const cv = document.createElement("canvas");
      return !!(
        window.WebGLRenderingContext &&
        (cv.getContext("webgl") || cv.getContext("experimental-webgl"))
      );
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  //  STATIC GRADIENT FALLBACK (no WebGL) - never blank
  // ---------------------------------------------------------------------------
  if (!webglOK()) {
    const fb = document.createElement("div");
    fb.style.cssText = `position:absolute;inset:0;overflow:hidden;background:
      radial-gradient(120% 120% at 50% 42%, ${C.deep}55 0%, ${C.void} 62%),
      radial-gradient(circle at 30% 70%, ${C.royal}1f 0%, transparent 50%),
      ${C.void};`;
    const pts = [[50, 46], [33, 30], [68, 34], [40, 64], [62, 66], [24, 52], [78, 56]];
    pts.forEach(([x, y], i) => {
      const d = document.createElement("div");
      const r = i === 0 ? 9 : 5;
      d.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:${r}px;height:${r}px;
        transform:translate(-50%,-50%);border-radius:50%;
        background:${i === 0 ? C.white : C.lilacC};
        box-shadow:0 0 ${r * 2}px ${C.royal}, 0 0 ${r * 4}px ${C.lilacA}66;`;
      fb.appendChild(d);
    });
    container.appendChild(fb);
    return {
      replay() {}, pause() {}, resume() {}, setReducedMotion() {},
      destroy() { fb.remove(); },
    };
  }

  // ---------------------------------------------------------------------------
  //  GRAPH MODEL - Québec restaurant / city / channel constellation
  // ---------------------------------------------------------------------------
  // type: 0 hub (restaurant) · 1 city · 2 channel
  const LABELS = [
    { name: "Bistro", type: 0 },
    { name: "Pizzeria", type: 0 },
    { name: "Café", type: 0 },
    { name: "Sushi", type: 0 },
    { name: "Brunch", type: 0 },
    { name: "Burger", type: 0 },
    { name: "Grill", type: 0 },
    { name: "Montréal", type: 1 },
    { name: "Laval", type: 1 },
    { name: "Longueuil", type: 1 },
    { name: "Brossard", type: 1 },
    { name: "Verdun", type: 1 },
    { name: "Google", type: 2 },
    { name: "ChatGPT", type: 2 },
    { name: "Perplexity", type: 2 },
    { name: "Bing", type: 2 },
    { name: "Reddit", type: 2 },
    { name: "Direct", type: 2 },
  ];

  const wantFull = !(small() || coarse);
  const NODES = wantFull ? LABELS.slice() : LABELS.filter((_, i) => i < 12);
  const N = NODES.length;

  function idxOfType(t) {
    const out = [];
    for (let i = 0; i < N; i++) if (NODES[i].type === t) out.push(i);
    return out;
  }
  const restaurants = idxOfType(0);
  const cities = idxOfType(1);
  const channels = idxOfType(2);

  // seeded PRNG (mulberry32) so layout & edges are stable per mount session
  let seed = 0x31c0ffee;
  function rnd() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const edgeSet = new Set();
  const EDGES = [];
  function addEdge(a, b) {
    if (a === b) return;
    const k = a < b ? a + "_" + b : b + "_" + a;
    if (edgeSet.has(k)) return;
    edgeSet.add(k);
    EDGES.push([a, b]);
  }
  restaurants.forEach((r, i) => {
    if (cities.length) {
      addEdge(r, cities[i % cities.length]);
      if (cities.length > 1 && rnd() > 0.4) addEdge(r, cities[(i + 1) % cities.length]);
    }
    if (channels.length) {
      addEdge(r, channels[i % channels.length]);
      if (channels.length > 1 && rnd() > 0.35) addEdge(r, channels[(i + 2) % channels.length]);
    }
  });
  cities.forEach((c, i) => {
    if (channels.length) {
      addEdge(c, channels[i % channels.length]);
      if (channels.length > 1) addEdge(c, channels[(i + 1) % channels.length]);
    }
  });
  for (let i = 0; i + 1 < restaurants.length; i++) {
    if (rnd() > 0.55) addEdge(restaurants[i], restaurants[i + 1]);
  }
  const E = EDGES.length;

  // adjacency for cascade traversal (BFS layers)
  const adj = Array.from({ length: N }, () => []);
  EDGES.forEach(([a, b], ei) => {
    adj[a].push({ to: b, edge: ei });
    adj[b].push({ to: a, edge: ei });
  });

  // physics arrays (typed) ----------------------------------------------------
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const rest0 = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = rnd(), v = rnd();
    const th = Math.acos(2 * u - 1), ph = 2 * Math.PI * v;
    const rad = 1.4 + rnd() * 1.4;
    pos[i * 3] = rad * Math.sin(th) * Math.cos(ph);
    pos[i * 3 + 1] = rad * Math.sin(th) * Math.sin(ph) * 0.8;
    pos[i * 3 + 2] = rad * Math.cos(th);
  }

  // ---------------------------------------------------------------------------
  //  THREE setup
  // ---------------------------------------------------------------------------
  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
  const CAM_Z = 8.2;
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, 0);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch (e) {
    renderer = null;
  }
  if (!renderer) {
    const fb = document.createElement("div");
    fb.style.cssText = `position:absolute;inset:0;background:radial-gradient(120% 120% at 50% 42%, ${C.deep}55, ${C.void} 62%), ${C.void};`;
    container.appendChild(fb);
    return { replay() {}, pause() {}, resume() {}, setReducedMotion() {}, destroy() { fb.remove(); } };
  }

  const DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;";
  container.appendChild(canvas);

  // Composite pass only on capable (non-small, non-coarse) devices.
  const useComposite = !(small() || coarse);

  // background plate (void + faint nebula) - kept as the dark base under the canvas
  const plate = document.createElement("div");
  plate.style.cssText = `position:absolute;inset:0;z-index:-1;pointer-events:none;background:
    radial-gradient(130% 120% at 50% 40%, ${C.deep}3a 0%, ${C.void} 60%),
    radial-gradient(circle at 28% 74%, ${C.royal}16 0%, transparent 52%),
    ${C.void};`;
  container.style.background = C.void;
  container.appendChild(plate);

  // If we're NOT compositing (small/coarse), keep the cheap CSS grain+vignette.
  let grain = null, vign = null;
  if (!useComposite) {
    grain = document.createElement("div");
    grain.style.cssText =
      "position:absolute;inset:0;z-index:2;pointer-events:none;mix-blend-mode:overlay;opacity:.06;" +
      'background-image:url("data:image/svg+xml;utf8,' +
      encodeURIComponent(
        "<svg xmlns='http://www.w3.org/2000/svg' width='90' height='90'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='90' height='90' filter='url(%23n)'/></svg>"
      ) +
      '");background-size:170px 170px;';
    vign = document.createElement("div");
    vign.style.cssText = `position:absolute;inset:0;z-index:2;pointer-events:none;background:radial-gradient(120% 120% at 50% 46%, transparent 52%, ${C.void}cc 100%);`;
    container.appendChild(grain);
    container.appendChild(vign);
  }

  // ---- LABEL OVERLAY layer (French names, masked clip-path reveals) ----------
  const labelLayer = document.createElement("div");
  labelLayer.style.cssText =
    "position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden;";
  container.appendChild(labelLayer);
  const labelEls = [];
  const labelState = new Float32Array(N); // animated reveal 0..1 per node (smoothed)
  if (!reducedMotion || true) {
    for (let i = 0; i < N; i++) {
      const el = document.createElement("div");
      el.textContent = NODES[i].name;
      el.style.cssText =
        "position:absolute;left:0;top:0;white-space:nowrap;font-family:" +
        "ui-sans-serif,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;" +
        "font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;" +
        "color:" + C.lilacC + ";opacity:0;transform:translate(-50%,-160%);" +
        "padding-bottom:3px;border-bottom:1px solid " + C.lilacA + "00;" +
        "text-shadow:0 0 10px " + C.royal + "aa;will-change:transform,opacity,clip-path;" +
        "clip-path:inset(0 100% 0 0);";
      labelLayer.appendChild(el);
      labelEls.push(el);
    }
  }

  // root group (slow ambient rotation) ---------------------------------------
  const root = new THREE.Group();
  scene.add(root);

  // ---- EDGES: single additive LineSegments ---------------------------------
  const edgeGeo = new THREE.BufferGeometry();
  const edgePos = new Float32Array(E * 2 * 3);
  const edgeCol = new Float32Array(E * 2 * 3);
  edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
  edgeGeo.setAttribute("color", new THREE.BufferAttribute(edgeCol, 3));
  const edgeMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
  root.add(edgeLines);

  const colEdgeBase = c3(C.deep).multiplyScalar(0.55);
  const colEdgeLit = c3(C.lilacA);
  const colEdgeHot = c3(C.flare);
  const edgeGlow = new Float32Array(E);
  const edgeHot = new Uint8Array(E);

  // ---- NODES: InstancedMesh (icosahedron core) with FRESNEL + DEPTH shader ---
  const baseR = small() ? 0.13 : 0.15;
  const nodeGeo = new THREE.IcosahedronGeometry(1, small() ? 1 : 2);

  // Custom ShaderMaterial: per-instance color via instanceColor, fresnel rim
  // tinted to lilac, darker interior core, and atmospheric near/far depth grade.
  const uLilac = new THREE.Color(C.lilacC);
  const uInk = new THREE.Color(C.ink);
  const uRoyal = new THREE.Color(C.royal);
  const nodeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {
      uLilac: { value: uLilac },
      uInk: { value: uInk },
      uRoyal: { value: uRoyal },
      uNear: { value: CAM_Z - 3.0 },
      uFar: { value: CAM_Z + 3.0 },
    },
    vertexShader: `
      varying vec3 vColor;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying float vCamZ;
      void main() {
        vColor = instanceColor;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        // normal in view space (instanceMatrix is ~uniform-scale; fine for fresnel)
        mat3 nm = mat3(modelViewMatrix) * mat3(instanceMatrix);
        vNormalV = normalize(nm * normal);
        vViewPos = mvPosition.xyz;
        vCamZ = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform vec3 uLilac;
      uniform vec3 uInk;
      uniform vec3 uRoyal;
      uniform float uNear;
      uniform float uFar;
      varying vec3 vColor;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying float vCamZ;
      void main() {
        vec3 N = normalize(vNormalV);
        vec3 V = normalize(-vViewPos);
        float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
        // darker interior core toward ink, bright rim toward lilac
        vec3 core = mix(vColor * 0.55, vColor, clamp(dot(N, V), 0.0, 1.0));
        core = mix(core, uInk * 0.6, 0.25 * (1.0 - clamp(dot(N,V),0.0,1.0)));
        vec3 rim = mix(uLilac, vec3(1.0), 0.35);
        vec3 col = core + rim * fres * 1.15;
        // atmospheric depth grade: far -> crush to ink, near -> lift to royal
        float d = clamp((vCamZ - uNear) / (uFar - uNear), 0.0, 1.0); // 0 near .. 1 far
        col = mix(col + uRoyal * 0.18, mix(col, uInk, 0.55), d);
        float depthFade = mix(1.0, 0.35, d);
        gl_FragColor = vec4(col, depthFade);
      }
    `,
  });
  const nodes = new THREE.InstancedMesh(nodeGeo, nodeMat, N);
  nodes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const instCol = new Float32Array(N * 3);
  nodes.instanceColor = new THREE.InstancedBufferAttribute(instCol, 3);
  root.add(nodes);

  // ---- NODE HALOS: additive sprite-like glow via second instanced mesh ------
  function makeGlowTexture() {
    const s = 64;
    const cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const g = cv.getContext("2d");
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.25, "rgba(255,255,255,0.7)");
    grd.addColorStop(0.55, "rgba(255,255,255,0.18)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const glowTex = makeGlowTexture();
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  const haloMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 1,
  });
  const halos = new THREE.InstancedMesh(haloGeo, haloMat, N);
  halos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const haloCol = new Float32Array(N * 3);
  halos.instanceColor = new THREE.InstancedBufferAttribute(haloCol, 3);
  halos.renderOrder = 3;
  root.add(halos);

  // per-node colors by type
  const colHub = c3(C.white);
  const colCity = c3(C.lilacC);
  const colChan = c3(C.lilacA);
  const colHubHalo = c3(C.royal);
  const colCityHalo = c3(C.lilacA);
  const colChanHalo = c3(C.deep).multiplyScalar(1.4);
  function nodeColor(i) {
    const t = NODES[i].type;
    return t === 0 ? colHub : t === 1 ? colCity : colChan;
  }
  function haloColor(i) {
    const t = NODES[i].type;
    return t === 0 ? colHubHalo : t === 1 ? colCityHalo : colChanHalo;
  }
  const nodeScaleBase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = NODES[i].type;
    nodeScaleBase[i] = t === 0 ? 1.35 : t === 1 ? 1.05 : 0.85;
  }
  const nodeExcite = new Float32Array(N);

  // ---- PULSES travelling along edges (fixed pool, no alloc) -----------------
  // COMET TAIL: each pulse renders as TAIL_SEG trailing points.
  const PULSE_MAX = small() ? 14 : 26;
  const TAIL_SEG = small() ? 2 : 3;
  const TAIL_GAP = 0.12; // t-spacing between tail samples
  const pEdge = new Int16Array(PULSE_MAX).fill(-1);
  const pFrom = new Int16Array(PULSE_MAX);
  const pT = new Float32Array(PULSE_MAX);
  const pSpeed = new Float32Array(PULSE_MAX);
  const pHot = new Uint8Array(PULSE_MAX);
  let pulseCount = 0;
  function spawnPulse(edge, fromNode, speed, hot) {
    for (let k = 0; k < PULSE_MAX; k++) {
      if (pEdge[k] === -1) {
        pEdge[k] = edge;
        pFrom[k] = fromNode;
        pT[k] = 0;
        pSpeed[k] = speed;
        pHot[k] = hot ? 1 : 0;
        pulseCount++;
        return true;
      }
    }
    return false;
  }
  // pulse render: PULSE_MAX * TAIL_SEG additive points (comet)
  const PT_PTS = PULSE_MAX * TAIL_SEG;
  const pulseGeo = new THREE.BufferGeometry();
  const pulsePos = new Float32Array(PT_PTS * 3);
  const pulseColA = new Float32Array(PT_PTS * 3);
  pulseGeo.setAttribute("position", new THREE.BufferAttribute(pulsePos, 3));
  pulseGeo.setAttribute("color", new THREE.BufferAttribute(pulseColA, 3));
  const pulseMat = new THREE.PointsMaterial({
    size: small() ? 0.16 : 0.2,
    map: glowTex,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    opacity: 1,
  });
  const pulsePoints = new THREE.Points(pulseGeo, pulseMat);
  pulsePoints.renderOrder = 4;
  root.add(pulsePoints);
  const colPulse = c3(C.white);
  const colPulseHot = c3(C.flare);

  // ---------------------------------------------------------------------------
  //  COMPOSITE PASS - RenderTarget -> fullscreen triangle bloom/CA/barrel/grade
  // ---------------------------------------------------------------------------
  let rt = null, brightRT = null, blurRTa = null, blurRTb = null;
  let compositeScene = null, compositeCam = null;
  let brightMat = null, blurMat = null, finalMat = null;
  let fsTriGeo = null, fsMesh = null;
  let uVelocityTarget = 0; // smoothed velocity feeding CA (0..1)
  let uVelocity = 0;
  let uCrush = 0; // anticipation "inhale" crush toward void (0..1), smoothed
  let uCrushTarget = 0;

  function makeRT(w, h) {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
  }

  function buildComposite() {
    const fw = Math.max(2, Math.floor(W * DPR));
    const fh = Math.max(2, Math.floor(H * DPR));
    const bw = Math.max(2, Math.floor(fw / 2));
    const bh = Math.max(2, Math.floor(fh / 2));
    rt = makeRT(fw, fh);
    brightRT = makeRT(bw, bh); brightRT.depthBuffer = false;
    blurRTa = makeRT(bw, bh); blurRTa.depthBuffer = false;
    blurRTb = makeRT(bw, bh); blurRTb.depthBuffer = false;

    compositeScene = new THREE.Scene();
    compositeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // fullscreen triangle (covers clip space, no wasted fragments)
    fsTriGeo = new THREE.BufferGeometry();
    fsTriGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0, 3, -1, 0, -1, 3, 0,
    ]), 3));
    fsTriGeo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([
      0, 0, 2, 0, 0, 2,
    ]), 2));

    const triVert = `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
    `;

    // (1) bright-pass threshold, weighted toward white/lilac
    brightMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: 0.6 },
      },
      vertexShader: triVert,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform float uThreshold;
        varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          float w = smoothstep(uThreshold, uThreshold + 0.25, lum);
          // bias bloom toward white/lilac (cool) pixels
          float cool = clamp(c.b * 0.6 + max(c.r,c.g) * 0.4, 0.0, 1.0);
          gl_FragColor = vec4(c * w * (0.55 + 0.45 * cool), 1.0);
        }
      `,
    });

    // (2) cheap 9-tap separable Gaussian
    blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDir: { value: new THREE.Vector2(1, 0) },
        uTexel: { value: new THREE.Vector2(1 / bw, 1 / bh) },
      },
      vertexShader: triVert,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform vec2 uDir;
        uniform vec2 uTexel;
        varying vec2 vUv;
        void main(){
          vec2 o = uDir * uTexel;
          vec3 s = vec3(0.0);
          s += texture2D(tDiffuse, vUv - o*4.0).rgb * 0.051;
          s += texture2D(tDiffuse, vUv - o*3.0).rgb * 0.0918;
          s += texture2D(tDiffuse, vUv - o*2.0).rgb * 0.1231;
          s += texture2D(tDiffuse, vUv - o*1.0).rgb * 0.1531;
          s += texture2D(tDiffuse, vUv          ).rgb * 0.1641;
          s += texture2D(tDiffuse, vUv + o*1.0).rgb * 0.1531;
          s += texture2D(tDiffuse, vUv + o*2.0).rgb * 0.1231;
          s += texture2D(tDiffuse, vUv + o*3.0).rgb * 0.0918;
          s += texture2D(tDiffuse, vUv + o*4.0).rgb * 0.051;
          gl_FragColor = vec4(s, 1.0);
        }
      `,
    });

    // (final) barrel + chromatic aberration + add bloom + vignette + grain + crush
    finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uVelocity: { value: 0 },
        uTime: { value: 0 },
        uCrush: { value: 0 },
        uVoid: { value: new THREE.Color(C.void) },
        uInk: { value: new THREE.Color(C.ink) },
      },
      vertexShader: triVert,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tScene;
        uniform sampler2D tBloom;
        uniform float uVelocity;
        uniform float uTime;
        uniform float uCrush;
        uniform vec3 uVoid;
        uniform vec3 uInk;
        varying vec2 vUv;
        float hash(vec2 p){
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        void main(){
          vec2 uv = vUv;
          vec2 cen = uv - 0.5;
          // (4) subtle barrel distortion
          uv = uv + cen * dot(cen, cen) * 0.045;
          // (3) chromatic aberration ∝ velocity, scaled by distance from center
          float ca = (0.0012 + uVelocity * 0.010) * (0.4 + dot(cen,cen)*2.2);
          vec2 dir = normalize(cen + 1e-5);
          vec3 col;
          col.r = texture2D(tScene, uv + dir * ca).r;
          col.g = texture2D(tScene, uv).g;
          col.b = texture2D(tScene, uv - dir * ca).b;
          // (2) add true threshold bloom
          vec3 bloom = texture2D(tBloom, uv).rgb;
          col += bloom * 1.35;
          // (anticipation) crush whole frame toward void during the inhale
          col = mix(col, uVoid * 0.6, uCrush * 0.55);
          col = mix(col, uInk, uCrush * 0.20);
          // (5) graded vignette inside the shader (composites over bloom)
          float vig = smoothstep(1.05, 0.30, length(cen) * 1.55);
          col *= mix(0.55, 1.0, vig);
          // faint grain
          float g = hash(vUv * vec2(640.0, 360.0) + uTime) - 0.5;
          col += g * 0.028;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    fsMesh = new THREE.Mesh(fsTriGeo, finalMat);
    fsMesh.frustumCulled = false;
    compositeScene.add(fsMesh);
  }
  if (useComposite) buildComposite();

  function resizeComposite() {
    if (!useComposite || !rt) return;
    const fw = Math.max(2, Math.floor(W * DPR));
    const fh = Math.max(2, Math.floor(H * DPR));
    const bw = Math.max(2, Math.floor(fw / 2));
    const bh = Math.max(2, Math.floor(fh / 2));
    rt.setSize(fw, fh);
    brightRT.setSize(bw, bh);
    blurRTa.setSize(bw, bh);
    blurRTb.setSize(bw, bh);
    blurMat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
  }

  // ---------------------------------------------------------------------------
  //  PHYSICS - force-directed (repulsion + spring + centering)
  // ---------------------------------------------------------------------------
  const tmp = new THREE.Vector3();
  const REPULSE = 0.55;
  const SPRING_K = 0.06;
  const SPRING_LEN = small() ? 1.7 : 1.9;
  const CENTER_K = 0.012;
  const DAMP = 0.86;

  function physicsStep(dt) {
    for (let i = 0; i < N; i++) {
      let fx = 0, fy = 0, fz = 0;
      const ix = pos[i * 3], iy = pos[i * 3 + 1], iz = pos[i * 3 + 2];
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const dx = ix - pos[j * 3];
        const dy = iy - pos[j * 3 + 1];
        const dz = iz - pos[j * 3 + 2];
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 0.0001) d2 = 0.0001;
        const inv = REPULSE / d2;
        const d = Math.sqrt(d2);
        fx += (dx / d) * inv;
        fy += (dy / d) * inv;
        fz += (dz / d) * inv;
      }
      fx -= ix * CENTER_K;
      fy -= iy * CENTER_K;
      fz -= iz * CENTER_K;
      vel[i * 3] += fx * dt;
      vel[i * 3 + 1] += fy * dt;
      vel[i * 3 + 2] += fz * dt;
    }
    for (let e = 0; e < E; e++) {
      const a = EDGES[e][0], b = EDGES[e][1];
      const dx = pos[b * 3] - pos[a * 3];
      const dy = pos[b * 3 + 1] - pos[a * 3 + 1];
      const dz = pos[b * 3 + 2] - pos[a * 3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001;
      const f = (d - SPRING_LEN) * SPRING_K;
      const ux = dx / d, uy = dy / d, uz = dz / d;
      vel[a * 3] += ux * f * dt * 60;
      vel[a * 3 + 1] += uy * f * dt * 60;
      vel[a * 3 + 2] += uz * f * dt * 60;
      vel[b * 3] -= ux * f * dt * 60;
      vel[b * 3 + 1] -= uy * f * dt * 60;
      vel[b * 3 + 2] -= uz * f * dt * 60;
    }
    const damp = Math.pow(DAMP, dt * 60);
    for (let i = 0; i < N; i++) {
      if (i === draggingNode) continue;
      vel[i * 3] *= damp;
      vel[i * 3 + 1] *= damp;
      vel[i * 3 + 2] *= damp;
      pos[i * 3] += vel[i * 3] * dt * 60 * 0.016;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt * 60 * 0.016;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt * 60 * 0.016;
    }
  }

  function meanSpeed() {
    let s = 0;
    for (let i = 0; i < N; i++) {
      const vx = vel[i * 3], vy = vel[i * 3 + 1], vz = vel[i * 3 + 2];
      s += Math.sqrt(vx * vx + vy * vy + vz * vz);
    }
    return s / N;
  }

  function warmUp(steps) {
    for (let s = 0; s < steps; s++) physicsStep(1 / 60);
    for (let i = 0; i < N * 3; i++) {
      rest0[i] = pos[i];
      vel[i] = 0;
    }
  }

  // ---------------------------------------------------------------------------
  //  WRITE BUFFERS (per frame) - no allocation
  // ---------------------------------------------------------------------------
  const mtx = new THREE.Matrix4();
  const qIdentity = new THREE.Quaternion();
  const sVec = new THREE.Vector3();
  const pVec = new THREE.Vector3();

  function updateNodeBuffers() {
    for (let i = 0; i < N; i++) {
      const ex = nodeExcite[i];
      const s = baseR * nodeScaleBase[i] * (1 + ex * 0.7);
      pVec.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      sVec.set(s, s, s);
      mtx.compose(pVec, qIdentity, sVec);
      nodes.setMatrixAt(i, mtx);
      const base = nodeColor(i);
      const br = 1 + ex * 1.2;
      instCol[i * 3] = clamp(base.r * br, 0, 1);
      instCol[i * 3 + 1] = clamp(base.g * br, 0, 1);
      instCol[i * 3 + 2] = clamp(base.b * br, 0, 1);
    }
    nodes.instanceMatrix.needsUpdate = true;
    nodes.instanceColor.needsUpdate = true;
  }

  // camera-space z for atmospheric grade on halos (depth fade / fake DOF)
  const camZTmp = new THREE.Vector3();
  function camZ(i) {
    camZTmp.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(root.matrixWorld);
    camZTmp.applyMatrix4(camera.matrixWorldInverse);
    return -camZTmp.z; // distance in front of camera
  }

  function updateHaloBuffers(camRot) {
    for (let i = 0; i < N; i++) {
      const ex = nodeExcite[i];
      const t = NODES[i].type;
      const haloBase = (t === 0 ? 0.95 : t === 1 ? 0.72 : 0.58) * (small() ? 0.82 : 1);
      // depth grade: far nodes' halos shrink + dim (fake DOF / atmospheric)
      const z = camZ(i);
      const d = clamp((z - (CAM_Z - 3.0)) / 6.0, 0, 1); // 0 near .. 1 far
      const depthMul = lerp(1.18, 0.5, d);
      const s = haloBase * (1 + ex * 1.3) * depthMul;
      pVec.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      sVec.set(s, s, 1);
      mtx.compose(pVec, camRot, sVec);
      halos.setMatrixAt(i, mtx);
      const base = haloColor(i);
      const depthBri = lerp(1.15, 0.4, d);
      const br = (0.5 + ex * 1.4) * (t === 0 ? 1.0 : 0.7) * depthBri;
      haloCol[i * 3] = clamp(base.r * br, 0, 1);
      haloCol[i * 3 + 1] = clamp(base.g * br, 0, 1);
      haloCol[i * 3 + 2] = clamp(base.b * br, 0, 1);
    }
    halos.instanceMatrix.needsUpdate = true;
    halos.instanceColor.needsUpdate = true;
  }

  function updateEdgeBuffers() {
    for (let e = 0; e < E; e++) {
      const a = EDGES[e][0], b = EDGES[e][1];
      const o = e * 6;
      edgePos[o] = pos[a * 3];
      edgePos[o + 1] = pos[a * 3 + 1];
      edgePos[o + 2] = pos[a * 3 + 2];
      edgePos[o + 3] = pos[b * 3];
      edgePos[o + 4] = pos[b * 3 + 1];
      edgePos[o + 5] = pos[b * 3 + 2];
      const g = edgeGlow[e];
      const litTarget = edgeHot[e] ? colEdgeHot : colEdgeLit;
      const r = colEdgeBase.r + (litTarget.r - colEdgeBase.r) * g;
      const gg = colEdgeBase.g + (litTarget.g - colEdgeBase.g) * g;
      const bb = colEdgeBase.b + (litTarget.b - colEdgeBase.b) * g;
      edgeCol[o] = r; edgeCol[o + 1] = gg; edgeCol[o + 2] = bb;
      edgeCol[o + 3] = r; edgeCol[o + 4] = gg; edgeCol[o + 5] = bb;
    }
    edgeGeo.attributes.position.needsUpdate = true;
    edgeGeo.attributes.color.needsUpdate = true;
  }

  // COMET: write TAIL_SEG trailing points per active pulse, falling alpha along length
  function updatePulseBuffers() {
    let n = 0;
    for (let k = 0; k < PULSE_MAX; k++) {
      if (pEdge[k] === -1) {
        for (let seg = 0; seg < TAIL_SEG; seg++) {
          pulsePos[n * 3] = 0; pulsePos[n * 3 + 1] = 0; pulsePos[n * 3 + 2] = -9999;
          pulseColA[n * 3] = 0; pulseColA[n * 3 + 1] = 0; pulseColA[n * 3 + 2] = 0;
          n++;
        }
        continue;
      }
      const e = pEdge[k];
      const a = EDGES[e][0], b = EDGES[e][1];
      const from = pFrom[k];
      const to = from === a ? b : a;
      const fx = pos[from * 3], fy = pos[from * 3 + 1], fz = pos[from * 3 + 2];
      const tx = pos[to * 3], ty = pos[to * 3 + 1], tz = pos[to * 3 + 2];
      const hot = pHot[k];
      const col = hot ? colPulseHot : colPulse;
      const gap = hot ? TAIL_GAP * 1.6 : TAIL_GAP; // hot finale = longer tail
      for (let seg = 0; seg < TAIL_SEG; seg++) {
        const ts = clamp(pT[k] - seg * gap, 0, 1);
        // falling brightness along the tail (head brightest)
        const fall = seg === 0 ? 1.0 : Math.pow(0.5, seg) * (hot ? 1.25 : 1.0);
        pulsePos[n * 3] = fx + (tx - fx) * ts;
        pulsePos[n * 3 + 1] = fy + (ty - fy) * ts;
        pulsePos[n * 3 + 2] = fz + (tz - fz) * ts;
        pulseColA[n * 3] = col.r * fall;
        pulseColA[n * 3 + 1] = col.g * fall;
        pulseColA[n * 3 + 2] = col.b * fall;
        n++;
      }
    }
    pulseGeo.attributes.position.needsUpdate = true;
    pulseGeo.attributes.color.needsUpdate = true;
    pulseGeo.setDrawRange(0, PT_PTS);
  }

  // ---- LABEL projection + masked reveal -------------------------------------
  const projV = new THREE.Vector3();
  function updateLabels(dt) {
    if (!labelEls.length) return;
    for (let i = 0; i < N; i++) {
      // target reveal driven by excitation above a threshold
      const ex = nodeExcite[i];
      const target = ex > 0.5 ? 1 : 0;
      // ease the smoothed state toward target (fast in, slower out)
      const rate = target > labelState[i] ? 9 : 3.2;
      labelState[i] += (target - labelState[i]) * clamp(rate * dt, 0, 1);
      if (labelState[i] < 0.002) labelState[i] = 0;
      const el = labelEls[i];
      if (labelState[i] <= 0) {
        if (el.style.opacity !== "0") el.style.opacity = "0";
        continue;
      }
      // project node world position to screen
      projV.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(root.matrixWorld);
      projV.project(camera);
      if (projV.z > 1) { el.style.opacity = "0"; continue; }
      const sx = (projV.x * 0.5 + 0.5) * W;
      const sy = (-projV.y * 0.5 + 0.5) * H;
      const s = labelState[i];
      const reveal = easeOutExpo(clamp(s, 0, 1));
      const wipe = (1 - reveal) * 100; // clip-path inset from right
      el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -170%)`;
      el.style.opacity = (s * 0.95).toFixed(3);
      el.style.clipPath = `inset(0 ${wipe.toFixed(1)}% 0 0)`;
      // hairline underline fades in with reveal
      const ua = Math.round(clamp(s, 0, 1) * 220).toString(16).padStart(2, "0");
      el.style.borderBottomColor = C.lilacA + ua;
    }
  }

  // ---------------------------------------------------------------------------
  //  INTERACTION - pointer pick / drag / magnetic pull / camera parallax
  // ---------------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer = { x: 0, y: 0, inside: false, down: false, ndcx: 0, ndcy: 0 };
  let draggingNode = -1;
  let hoverNode = -1;
  const dragPlane = new THREE.Plane();
  const dragPoint = new THREE.Vector3();
  const camDir = new THREE.Vector3();

  function setPointerFromEvent(ev) {
    const r = container.getBoundingClientRect();
    const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    const cy = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
    pointer.x = cx;
    pointer.y = cy;
    ndc.x = (cx / r.width) * 2 - 1;
    ndc.y = -(cy / r.height) * 2 + 1;
    pointer.ndcx = ndc.x;
    pointer.ndcy = ndc.y;
  }

  function pickNode() {
    raycaster.setFromCamera(ndc, camera);
    let best = -1, bestDist = Infinity;
    const ro = raycaster.ray.origin, rd = raycaster.ray.direction;
    for (let i = 0; i < N; i++) {
      pVec.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(root.matrixWorld);
      tmp.copy(pVec).sub(ro);
      const tproj = tmp.dot(rd);
      if (tproj < 0) continue;
      tmp.copy(rd).multiplyScalar(tproj).add(ro);
      const dd = tmp.distanceTo(pVec);
      const hitR = baseR * nodeScaleBase[i] * 2.4 + 0.12;
      if (dd < hitR && tproj < bestDist) {
        best = i;
        bestDist = tproj;
      }
    }
    return best;
  }

  function onMove(ev) {
    pointer.inside = true;
    setPointerFromEvent(ev);
    if (draggingNode >= 0 && ev.cancelable) ev.preventDefault();
  }
  function onEnter() { pointer.inside = true; }
  function onLeave() {
    pointer.inside = false;
    hoverNode = -1;
    pointer.ndcx = 0; pointer.ndcy = 0; // camera springs back to center
    container.style.cursor = "";
  }
  function onDown(ev) {
    setPointerFromEvent(ev);
    pointer.down = true;
    root.updateMatrixWorld();
    const hit = pickNode();
    if (hit >= 0) {
      draggingNode = hit;
      nodeExcite[hit] = Math.min(1, nodeExcite[hit] + 0.8);
      container.style.cursor = "grabbing";
      if (ev.cancelable) ev.preventDefault();
    }
  }
  function onUp() {
    if (draggingNode >= 0) {
      const node = draggingNode;
      adj[node].forEach((nb) => {
        spawnPulse(nb.edge, node, 1.4 + rnd() * 0.5, false);
      });
      // a little CA kick on release
      uVelocityTarget = Math.max(uVelocityTarget, 0.5);
    }
    draggingNode = -1;
    pointer.down = false;
    container.style.cursor = hoverNode >= 0 ? "grab" : "";
  }

  // ---------------------------------------------------------------------------
  //  SIGNATURE CASCADE - BFS-ring ignition with a dramatic arc
  //  (anticipation -> accelerating payoff -> settle with overshoot)
  //  THE BFS-RING SPINE IS PRESERVED: all edges at one depth fire together.
  // ---------------------------------------------------------------------------
  let cascadeTimer = null;
  let cascadeRunning = false;
  function buildCascadeSchedule(seedNode) {
    const visited = new Uint8Array(N);
    visited[seedNode] = 1;
    const fired = new Uint8Array(E);
    const schedule = [];
    let depth = 0;
    let frontier = [seedNode];
    let maxDepth = 0;
    while (frontier.length) {
      const next = [];
      for (const node of frontier) {
        for (const nb of adj[node]) {
          if (!fired[nb.edge]) {
            fired[nb.edge] = 1;
            schedule.push({ edge: nb.edge, from: node, depth });
          }
          if (!visited[nb.to]) {
            visited[nb.to] = 1;
            next.push(nb.to);
          }
        }
      }
      frontier = next;
      if (next.length) maxDepth = depth + 1;
      depth++;
    }
    return { schedule, maxDepth };
  }

  function runCascade(hotFinale) {
    if (cascadeRunning) return;
    cascadeRunning = true;
    const seed = restaurants.length ? restaurants[0] : 0;
    const built = buildCascadeSchedule(seed);
    const schedule = built.schedule;
    const maxDepth = Math.max(1, built.maxDepth);

    // (a) ANTICIPATION - inhale: seed swells, frame crushes toward void, dim edges.
    nodeExcite[seed] = 1.3;
    uCrushTarget = 1.0;
    edgeMat.opacity = 0.32;
    const inhale = small() ? 150 : 200;

    let i = 0;
    const fireDepth = () => {
      if (destroyed) return;
      // (b) PAYOFF - accelerate stepDelay across BFS depths (ring speeds to the rim)
      const depthNow = i < schedule.length ? schedule[i].depth : -1;
      const dp = clamp(depthNow / maxDepth, 0, 1);
      // ramp CA / velocity uniform so aberration peaks at the OUTERMOST ring
      uVelocityTarget = Math.max(uVelocityTarget, 0.25 + dp * 0.75);
      // pulses get faster toward the rim too
      const pSpeedBase = 1.9 + dp * 0.9;
      // === BFS-RING SPINE: fire every edge at this depth TOGETHER ===
      while (i < schedule.length && schedule[i].depth === depthNow) {
        const s = schedule[i];
        spawnPulse(s.edge, s.from, pSpeedBase + rnd() * 0.4, false);
        i++;
      }
      if (i < schedule.length) {
        // ease delay 110ms -> 45ms as depth increases
        const nextDp = clamp(schedule[i].depth / maxDepth, 0, 1);
        const delay = lerp(small() ? 130 : 110, small() ? 60 : 45, easeInOutCubic(nextDp));
        cascadeTimer = setTimeout(fireDepth, delay);
      } else {
        // (c) SETTLE with OVERSHOOT - radial velocity pop on every node; spring pulls back
        const flexK = small() ? 3.2 : 4.4;
        for (let nIdx = 0; nIdx < N; nIdx++) {
          if (nIdx === draggingNode) continue;
          const px = pos[nIdx * 3], py = pos[nIdx * 3 + 1], pz = pos[nIdx * 3 + 2];
          const len = Math.sqrt(px * px + py * py + pz * pz) || 0.0001;
          vel[nIdx * 3] += (px / len) * flexK;
          vel[nIdx * 3 + 1] += (py / len) * flexK;
          vel[nIdx * 3 + 2] += (pz / len) * flexK;
        }
        // peak CA at the crest, then it decays
        uVelocityTarget = 1.0;
        // the ONE earned hot magenta flare from the seed
        if (hotFinale) {
          adj[seed].forEach((nb) => spawnPulse(nb.edge, seed, 2.6, true));
          nodeExcite[seed] = 1.3;
        }
        cascadeTimer = setTimeout(() => { cascadeRunning = false; }, 700);
      }
    };
    // hold the inhale, then begin the ring
    uVelocityTarget = 0.15;
    cascadeTimer = setTimeout(() => {
      uCrushTarget = 0.0; // release the inhale exactly as the first ring lights
      edgeMat.opacity = 0.62;
      fireDepth();
    }, inhale);
  }

  // ---------------------------------------------------------------------------
  //  ENTRANCE - nodes ease from scatter into settled rest; first cascade fires
  // ---------------------------------------------------------------------------
  let entranceT = 0;
  let entering = false;
  const scatterStart = new Float32Array(N * 3);
  let usedFlare = false;

  function beginEntrance() {
    entering = true;
    entranceT = 0;
    for (let i = 0; i < N; i++) {
      const u = rnd(), v = rnd();
      const th = Math.acos(2 * u - 1), ph = 2 * Math.PI * v;
      const rad = 3.4 + rnd() * 1.6;
      scatterStart[i * 3] = rad * Math.sin(th) * Math.cos(ph);
      scatterStart[i * 3 + 1] = rad * Math.sin(th) * Math.sin(ph) * 0.8;
      scatterStart[i * 3 + 2] = rad * Math.cos(th);
      vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0;
      nodeExcite[i] = 0;
      labelState[i] = 0;
    }
    for (let e = 0; e < E; e++) { edgeGlow[e] = 0; edgeHot[e] = 0; }
    for (let k = 0; k < PULSE_MAX; k++) pEdge[k] = -1;
    pulseCount = 0;
    cascadeRunning = false;
    uCrushTarget = 0; uCrush = 0;
    uVelocity = 0; uVelocityTarget = 0;
    edgeMat.opacity = 0.62;
    if (cascadeTimer) { clearTimeout(cascadeTimer); cascadeTimer = null; }
  }

  // ---------------------------------------------------------------------------
  //  RESIZE
  // ---------------------------------------------------------------------------
  let ro2 = null;
  function applySize() {
    rect = container.getBoundingClientRect();
    W = Math.max(1, rect.width || W);
    H = Math.max(1, rect.height || H);
    camera.aspect = W / H;
    camera.position.z = CAM_Z * clamp(1 + (1 - Math.min(1, W / 520)) * 0.5, 1, 1.6);
    camera.updateProjectionMatrix();
    renderer.setSize(W, H, false);
    resizeComposite();
  }
  if (typeof ResizeObserver !== "undefined") {
    ro2 = new ResizeObserver(() => applySize());
    ro2.observe(container);
  }

  // ---------------------------------------------------------------------------
  //  RENDER - to RT then composite, or straight to screen on lite path
  // ---------------------------------------------------------------------------
  let blurT = 0;
  function renderComposite() {
    // 1) scene -> rt
    renderer.setRenderTarget(rt);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    // 2) bright pass -> brightRT
    renderer.setRenderTarget(brightRT);
    renderer.clear(true, false, false);
    brightMat.uniforms.tDiffuse.value = rt.texture;
    fsMesh.material = brightMat;
    renderer.render(compositeScene, compositeCam);
    // 3) blur H -> blurRTa, blur V -> blurRTb
    fsMesh.material = blurMat;
    blurMat.uniforms.uDir.value.set(1, 0);
    blurMat.uniforms.tDiffuse.value = brightRT.texture;
    renderer.setRenderTarget(blurRTa);
    renderer.clear(true, false, false);
    renderer.render(compositeScene, compositeCam);
    blurMat.uniforms.uDir.value.set(0, 1);
    blurMat.uniforms.tDiffuse.value = blurRTa.texture;
    renderer.setRenderTarget(blurRTb);
    renderer.clear(true, false, false);
    renderer.render(compositeScene, compositeCam);
    // 4) final composite -> screen
    fsMesh.material = finalMat;
    finalMat.uniforms.tScene.value = rt.texture;
    finalMat.uniforms.tBloom.value = blurRTb.texture;
    finalMat.uniforms.uVelocity.value = uVelocity;
    finalMat.uniforms.uCrush.value = uCrush;
    finalMat.uniforms.uTime.value = blurT;
    renderer.setRenderTarget(null);
    renderer.clear(true, true, true);
    renderer.render(compositeScene, compositeCam);
  }
  function renderPlain() {
    renderer.setRenderTarget(null);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
  }
  function doRender() {
    if (useComposite && rt) renderComposite();
    else renderPlain();
  }

  // ---------------------------------------------------------------------------
  //  STATIC FRAME (reduced motion) - settled, composed, frozen mid-cascade beat
  // ---------------------------------------------------------------------------
  function renderStaticFrame() {
    for (let i = 0; i < N * 3; i++) { pos[i] = rest0[i]; vel[i] = 0; }
    for (let e = 0; e < E; e++) edgeGlow[e] = 0.18;
    const seed = restaurants.length ? restaurants[0] : 0;
    adj[seed].forEach((nb) => { edgeGlow[nb.edge] = 0.85; });
    nodeExcite[seed] = 0.7;
    // light one neighbour's label for the data story, frozen
    if (adj[seed].length) nodeExcite[adj[seed][0].to] = 0.65;
    root.rotation.set(0.18, -0.5, 0);
    root.updateMatrixWorld();
    camera.updateMatrixWorld();
    const inv = root.quaternion.clone().invert();
    const localBillboard = inv.multiply(camera.quaternion);
    updateNodeBuffers();
    updateHaloBuffers(localBillboard);
    updateEdgeBuffers();
    updatePulseBuffers();
    // snap labels to their state (no animation in reduced motion)
    for (let i = 0; i < N; i++) labelState[i] = nodeExcite[i] > 0.5 ? 1 : 0;
    updateLabels(1);
    doRender();
  }

  // ---------------------------------------------------------------------------
  //  MAIN LOOP
  // ---------------------------------------------------------------------------
  let raf = 0;
  let running = false;
  let destroyed = false;
  let last = 0;
  let firstCascadeFired = false;
  const billboardQuat = new THREE.Quaternion();
  const rootInv = new THREE.Quaternion();
  // camera micro-parallax spring state
  let camTX = 0, camTY = 0;

  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    if (!running) return;
    let dt = (now - last) / 1000;
    if (!last) dt = 1 / 60;
    last = now;
    dt = Math.min(dt, 1 / 30);
    blurT += dt;

    // ambient root rotation (slow, alive)
    root.rotation.y += dt * 0.12;
    root.rotation.x = 0.14 + Math.sin(now * 0.0002) * 0.06;

    // ---- camera micro-parallax toward cursor (spring) ----
    camTX = pointer.ndcx * 0.45;
    camTY = pointer.ndcy * 0.32;
    camera.position.x = lerp(camera.position.x, camTX, clamp(0.06 * 60 * dt, 0, 1));
    camera.position.y = lerp(camera.position.y, camTY, clamp(0.06 * 60 * dt, 0, 1));
    camera.lookAt(0, 0, 0);

    // ---- entrance lerp ----
    if (entering) {
      entranceT += dt / (small() ? 0.9 : 1.05);
      const te = clamp(entranceT, 0, 1);
      for (let i = 0; i < N; i++) {
        const stag = clamp((te - (i / N) * 0.35) / (1 - 0.35), 0, 1);
        const ke = easeOutExpo(stag);
        for (let a = 0; a < 3; a++) {
          pos[i * 3 + a] = scatterStart[i * 3 + a] + (rest0[i * 3 + a] - scatterStart[i * 3 + a]) * ke;
        }
        nodeExcite[i] = Math.max(nodeExcite[i], (1 - Math.abs(stag - 0.6)) * 0.5 * (stag > 0.05 ? 1 : 0));
      }
      if (te >= 1) {
        entering = false;
        for (let i = 0; i < N * 3; i++) vel[i] = 0;
        if (!firstCascadeFired) {
          firstCascadeFired = true;
          setTimeout(() => { if (!destroyed) runCascade(!usedFlare && (usedFlare = true)); }, 260);
        }
      }
    } else {
      const sub = 2;
      for (let s = 0; s < sub; s++) physicsStep(dt / sub);
    }

    // ---- drag: move pinned node onto a camera-facing plane ----
    if (draggingNode >= 0) {
      raycaster.setFromCamera(ndc, camera);
      camera.getWorldDirection(camDir);
      pVec.set(pos[draggingNode * 3], pos[draggingNode * 3 + 1], pos[draggingNode * 3 + 2]).applyMatrix4(root.matrixWorld);
      dragPlane.setFromNormalAndCoplanarPoint(camDir, pVec);
      if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
        const local = dragPoint.clone().applyMatrix4(rootInvMatrix());
        vel[draggingNode * 3] = (local.x - pos[draggingNode * 3]) * 6;
        vel[draggingNode * 3 + 1] = (local.y - pos[draggingNode * 3 + 1]) * 6;
        vel[draggingNode * 3 + 2] = (local.z - pos[draggingNode * 3 + 2]) * 6;
        pos[draggingNode * 3] = local.x;
        pos[draggingNode * 3 + 1] = local.y;
        pos[draggingNode * 3 + 2] = local.z;
      }
      nodeExcite[draggingNode] = Math.min(1.1, nodeExcite[draggingNode] + dt * 2);
    } else if (pointer.inside && !reducedMotion) {
      root.updateMatrixWorld();
      raycaster.setFromCamera(ndc, camera);
      const ro = raycaster.ray.origin, rd = raycaster.ray.direction;
      let near = -1, nd = Infinity, nt = 0;
      for (let i = 0; i < N; i++) {
        pVec.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(root.matrixWorld);
        tmp.copy(pVec).sub(ro);
        const tproj = tmp.dot(rd);
        if (tproj < 0) continue;
        tmp.copy(rd).multiplyScalar(tproj).add(ro);
        const dd = tmp.distanceTo(pVec);
        if (dd < nd) { nd = dd; near = i; nt = tproj; }
      }
      if (near >= 0 && nd < 0.7) {
        hoverNode = near;
        container.style.cursor = "grab";
        tmp.copy(rd).multiplyScalar(nt).add(ro);
        const local = tmp.applyMatrix4(rootInvMatrix());
        const pull = 0.06 * (1 - nd / 0.7);
        vel[near * 3] += (local.x - pos[near * 3]) * pull * 60 * dt;
        vel[near * 3 + 1] += (local.y - pos[near * 3 + 1]) * pull * 60 * dt;
        vel[near * 3 + 2] += (local.z - pos[near * 3 + 2]) * pull * 60 * dt;
        nodeExcite[near] = Math.min(0.6, nodeExcite[near] + dt * 1.4);
      } else {
        hoverNode = -1;
        if (!pointer.down) container.style.cursor = "";
      }
    }

    // ---- advance pulses (comet); on arrival, light node + nothing relays here
    //      (the BFS scheduler owns relay timing; arrival just excites the node) ----
    for (let k = 0; k < PULSE_MAX; k++) {
      if (pEdge[k] === -1) continue;
      pT[k] += pSpeed[k] * dt;
      const e = pEdge[k];
      edgeGlow[e] = Math.min(1, edgeGlow[e] + dt * 3.5);
      if (pHot[k]) edgeHot[e] = 1;
      if (pT[k] >= 1) {
        const a = EDGES[e][0], b = EDGES[e][1];
        const arrived = pFrom[k] === a ? b : a;
        nodeExcite[arrived] = Math.min(1.1, nodeExcite[arrived] + (pHot[k] ? 0.9 : 0.55));
        pEdge[k] = -1;
        pulseCount--;
      }
    }

    // ---- decay transients ----
    for (let i = 0; i < N; i++) {
      nodeExcite[i] *= Math.pow(0.12, dt);
      if (nodeExcite[i] < 0.001) nodeExcite[i] = 0;
    }
    const glowDecay = Math.pow(0.06, dt);
    for (let e = 0; e < E; e++) {
      edgeGlow[e] *= glowDecay;
      if (edgeGlow[e] < 0.004) { edgeGlow[e] = 0; edgeHot[e] = 0; }
    }

    // ---- composite uniforms: velocity (CA) driven by mean |vel| + cascade ramp ----
    if (useComposite) {
      const ms = clamp(meanSpeed() * 0.5, 0, 1);
      // blend physical motion with the cascade-driven target; whichever is higher
      const tgt = Math.max(ms, uVelocityTarget);
      uVelocity = lerp(uVelocity, tgt, clamp(4 * dt, 0, 1));
      uVelocityTarget *= Math.pow(0.25, dt); // target decays back to 0
      uCrush = lerp(uCrush, uCrushTarget, clamp(8 * dt, 0, 1));
    }

    // ---- billboard quaternion for halos (root-local) ----
    rootInv.copy(root.quaternion).invert();
    billboardQuat.copy(rootInv).multiply(camera.quaternion);

    // ---- write GPU buffers ----
    updateNodeBuffers();
    updateHaloBuffers(billboardQuat);
    updateEdgeBuffers();
    updatePulseBuffers();
    updateLabels(dt);

    doRender();
  }

  const _rootInvM = new THREE.Matrix4();
  function rootInvMatrix() {
    _rootInvM.copy(root.matrixWorld).invert();
    return _rootInvM;
  }

  // ---------------------------------------------------------------------------
  //  WIRE LISTENERS
  // ---------------------------------------------------------------------------
  container.addEventListener("pointermove", onMove, { passive: false });
  container.addEventListener("pointerenter", onEnter);
  container.addEventListener("pointerleave", onLeave);
  container.addEventListener("pointerdown", onDown, { passive: false });
  window.addEventListener("pointerup", onUp);

  function onDbl() {
    if (reducedMotion) return;
    runCascade(false);
  }
  container.addEventListener("dblclick", onDbl);

  // ---------------------------------------------------------------------------
  //  BOOT
  // ---------------------------------------------------------------------------
  warmUp(small() ? 140 : 200);
  applySize();

  // failsafe: guarantee a visible frame immediately (never blank/stuck)
  root.updateMatrixWorld();
  camera.updateMatrixWorld();
  rootInv.copy(root.quaternion).invert();
  billboardQuat.copy(rootInv).multiply(camera.quaternion);
  for (let i = 0; i < N * 3; i++) pos[i] = rest0[i];
  updateNodeBuffers();
  updateHaloBuffers(billboardQuat);
  updateEdgeBuffers();
  updatePulseBuffers();
  doRender();

  if (reducedMotion) {
    renderStaticFrame();
  } else {
    beginEntrance();
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
    // reveal failsafe: if rAF somehow never advanced, force a static frame
    setTimeout(() => {
      if (!destroyed && entering && entranceT === 0) {
        entering = false;
        for (let i = 0; i < N * 3; i++) pos[i] = rest0[i];
        renderStaticFrame();
      }
    }, 1500);
  }

  // ---------------------------------------------------------------------------
  //  HANDLE
  // ---------------------------------------------------------------------------
  function replay() {
    if (destroyed) return;
    if (reducedMotion) {
      renderStaticFrame();
      return;
    }
    firstCascadeFired = false;
    if (cascadeTimer) { clearTimeout(cascadeTimer); cascadeTimer = null; }
    cascadeRunning = false;
    beginEntrance();
    running = true;
    last = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function pause() {
    running = false;
  }

  function resume() {
    if (destroyed || reducedMotion) return;
    if (!running) {
      running = true;
      last = 0;
      if (!raf) raf = requestAnimationFrame(frame);
    }
  }

  function setReducedMotion(v) {
    reducedMotion = !!v;
    if (reducedMotion) {
      running = false;
      if (cascadeTimer) { clearTimeout(cascadeTimer); cascadeTimer = null; }
      cascadeRunning = false;
      entering = false;
      renderStaticFrame();
    } else {
      replay();
    }
  }

  function destroy() {
    destroyed = true;
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (cascadeTimer) { clearTimeout(cascadeTimer); cascadeTimer = null; }

    container.removeEventListener("pointermove", onMove);
    container.removeEventListener("pointerenter", onEnter);
    container.removeEventListener("pointerleave", onLeave);
    container.removeEventListener("pointerdown", onDown);
    container.removeEventListener("dblclick", onDbl);
    window.removeEventListener("pointerup", onUp);
    if (ro2) { ro2.disconnect(); ro2 = null; }

    // dispose scene geometries / materials / textures
    try { edgeGeo.dispose(); } catch (e) {}
    try { edgeMat.dispose(); } catch (e) {}
    try { nodeGeo.dispose(); } catch (e) {}
    try { nodeMat.dispose(); } catch (e) {}
    try { haloGeo.dispose(); } catch (e) {}
    try { haloMat.dispose(); } catch (e) {}
    try { pulseGeo.dispose(); } catch (e) {}
    try { pulseMat.dispose(); } catch (e) {}
    try { glowTex.dispose(); } catch (e) {}

    // dispose composite pass (RTs + materials + geo)
    try { if (rt) rt.dispose(); } catch (e) {}
    try { if (brightRT) brightRT.dispose(); } catch (e) {}
    try { if (blurRTa) blurRTa.dispose(); } catch (e) {}
    try { if (blurRTb) blurRTb.dispose(); } catch (e) {}
    try { if (brightMat) brightMat.dispose(); } catch (e) {}
    try { if (blurMat) blurMat.dispose(); } catch (e) {}
    try { if (finalMat) finalMat.dispose(); } catch (e) {}
    try { if (fsTriGeo) fsTriGeo.dispose(); } catch (e) {}

    try {
      scene.remove(root);
      root.clear();
      if (compositeScene) compositeScene.clear();
    } catch (e) {}

    try { renderer.dispose(); } catch (e) {}
    try { renderer.forceContextLoss(); } catch (e) {}
    try {
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    } catch (e) {}
    try { plate.remove(); } catch (e) {}
    try { if (grain) grain.remove(); } catch (e) {}
    try { if (vign) vign.remove(); } catch (e) {}
    try { labelLayer.remove(); } catch (e) {}

    renderer = null;
    rt = brightRT = blurRTa = blurRTb = null;
  }

  return { replay, pause, resume, setReducedMotion, destroy };
}
