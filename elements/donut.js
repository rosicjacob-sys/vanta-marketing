/*
 * Royal Donut 3D - #28  ·  ELEVATED V2
 * Lineage: The Ledger
 *
 * An extruded 3D donut standing on a reflective ink floor: discovery-channel slices
 * extrude up in sequence (royal -> lilac), value-driven height so bigger channels
 * physically stand taller. A per-digit tabular count-up lands in the centre, and a
 * compact FR legend tallies each channel on gradient hairlines.
 *
 * THE SCREENSHOT MOMENT (anticipation -> payoff -> settle):
 *   ~120ms before the final lilac slice seats, the idle spin holds its breath and the
 *   global exposure dips ~8%. The last slice clicks in on a backOut overshoot; a single
 *   radial shockwave ring fires from centre; the bloom flares one frame toward the lone
 *   hot-magenta #E8409B then recoils to lilac; the centre digits slot-machine-settle.
 *   The number springs 1.0->1.18->0.98->1.0 while the whole donut takes a 1.5deg
 *   rotational overshoot and the reflective floor catches the flash - then everything
 *   crushes back toward void as the count locks at the total. One inevitable frame.
 *
 * Deps: three@0.160.0 (pinned esm.sh). gsap NOT required - easing is hand-rolled.
 * Perf: one WebGL context; each slice is a single ExtrudeGeometry built once (no per-frame
 *       alloc); slices grouped + transformed (scale/rotate) only; the scene renders to an
 *       RT once then a single fullscreen composite pass adds bloom + barrel + chromatic
 *       aberration + DOF + grain + vignette; planar reflection reuses that same RT (no
 *       second scene render). Raycast throttled; DPR capped [1,2]; coarse/small devices
 *       drop bevel, segments, reflection, and the heavy composite (cheap grain pass only).
 *       WebGL guard + painted gradient fallback so it never renders blank; 4s reveal
 *       failsafe forces the assembled frame; reduced-motion snaps to a static composed
 *       frame; full leak-free destroy.
 */

import * as THREE from "https://esm.sh/three@0.160.0";

export const meta = {
  id: 28,
  slug: "royal-donut-3d",
  title: "Royal Donut 3D",
  lineage: "The Ledger",
  version: "V2",
  signature:
    "The final lilac slice clicks in - a shockwave fires, the bloom flares to magenta then recoils, and the centre digits slot-machine-settle as the floor catches the flash.",
  interaction:
    "Hover a slice to lift and highlight it; the camera parallaxes to the cursor and the legend follows.",
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

/* ---- channel slices (Québec restaurant local-SEO copy) --------------------
 * Values are illustrative shares of "Citations IA / découverte" this month. */
let CHANNELS = [
  { label: "Google",     value: 38 },
  { label: "ChatGPT",    value: 22 },
  { label: "Perplexity", value: 15 },
  { label: "Bing",       value: 12 },
  { label: "Reddit",     value: 8  },
  { label: "Direct",     value: 5  },
];

/* ---- bespoke easing -------------------------------------------------------- */
const easeExpoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easePow4Out = (t) => 1 - Math.pow(1 - t, 4);
const easeBackOut = (t, s = 1.7) => {
  const c3 = s + 1, x = t - 1;
  return 1 + c3 * x * x * x + s * x * x;
};
const easeCubicInOut = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;

export function mount(container, opts = {}) {
  const tokens = opts.tokens || {};
  if (opts.sources && opts.sources.length) CHANNELS = opts.sources;
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
  let small = Math.min(W, H) < 360 || coarse;

  const SYS_FONT =
    "ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif";
  // tabular figures keep the slot-machine digits from jittering width
  const NUM_FONT =
    "'SF Mono','Roboto Mono',ui-monospace,'JetBrains Mono',Menlo,Consolas,monospace";

  // total for the count-up + slice fractions
  const TOTAL = CHANNELS.reduce((s, c) => s + c.value, 0);

  // ---------------------------------------------------------------------------
  // WebGL capability guard + painted fallback (never blank)
  // ---------------------------------------------------------------------------
  function mixHexSafe(h1, h2, t) {
    // tiny hand-rolled hex mix that doesn't need THREE (used in fallback path)
    const pa = parseInt(h1.slice(1), 16), pb = parseInt(h2.slice(1), 16);
    const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
    const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
    const r = Math.round(lerp(ar, br, t));
    const g = Math.round(lerp(ag, bg, t));
    const b = Math.round(lerp(ab, bb, t));
    return `rgb(${r},${g},${b})`;
  }

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
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.32, r = R * 0.55;
      // soft halo
      const halo = g.createRadialGradient(cx, cy, r * 0.5, cx, cy, R * 1.5);
      halo.addColorStop(0, mixHexSafe(C.royal, C.void, 0.55));
      halo.addColorStop(1, C.void);
      g.fillStyle = halo;
      g.fillRect(0, 0, W, H);
      // painted ring
      g.lineWidth = R - r;
      g.lineCap = "butt";
      let a0 = -Math.PI / 2;
      for (let i = 0; i < CHANNELS.length; i++) {
        const frac = CHANNELS[i].value / TOTAL;
        const a1 = a0 + frac * Math.PI * 2;
        const t = i / (CHANNELS.length - 1);
        g.strokeStyle = mixHexSafe(C.royal, C.haloB, t);
        g.globalAlpha = 0.92;
        g.beginPath();
        g.arc(cx, cy, (R + r) / 2, a0 + 0.02, a1 - 0.02);
        g.stroke();
        a0 = a1;
      }
      g.globalAlpha = 1;
      g.fillStyle = C.white;
      g.font = `700 ${Math.round(R * 0.7)}px ${SYS_FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(TOTAL) + "%", cx, cy - R * 0.05);
    }
    if (msg) console.warn("[royal-donut-3d] fallback:", msg);
    return {
      replay() {}, pause() {}, resume() {}, setReducedMotion() {},
      destroy() { try { container.removeChild(cv); } catch (e) {} },
    };
  }

  let testGL;
  try {
    const t = document.createElement("canvas");
    testGL = t.getContext("webgl2") || t.getContext("webgl") || t.getContext("experimental-webgl");
  } catch (e) { testGL = null; }
  if (!testGL) return paintFallback("no webgl");

  // ---------------------------------------------------------------------------
  // Renderer / scene / camera
  // ---------------------------------------------------------------------------
  let renderer, scene, camera;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !small, alpha: true, powerPreference: "high-performance" });
  } catch (e) { return paintFallback("renderer ctor failed"); }

  const DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const pixelRatio = small ? Math.min(1.5, DPR) : DPR;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  // Composite (bloom + barrel + chroma + DOF) only on capable devices; small/coarse
  // get the cheap grain+vignette pass to keep the craft bar without the RT cost.
  const useComposite = !small;

  scene = new THREE.Scene();
  // The donut is tilted; a slightly-perspective camera reads the extrusion depth.
  camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
  const CAM_BASE = new THREE.Vector3(0, 0.35, 7.4);
  camera.position.copy(CAM_BASE);
  const camLook = new THREE.Vector3(0, -0.15, 0);
  camera.lookAt(camLook);

  const cVoid  = new THREE.Color(C.void);
  const cPanel = new THREE.Color(C.panel);
  const cRoyal = new THREE.Color(C.royal);
  const cDeep  = new THREE.Color(C.deep);
  const cHaloA = new THREE.Color(C.haloA);
  const cHaloB = new THREE.Color(C.haloB);
  const cWhite = new THREE.Color(C.white);
  const cFlare = new THREE.Color(C.flare);

  // disposables registry
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  // ---------------------------------------------------------------------------
  // Render targets - scene RT (for composite + planar reflection sampling).
  // ---------------------------------------------------------------------------
  // Ping-pong: the floor's planar-reflection shader samples LAST frame's render
  // (rtRead) while the current frame renders into rtWrite - avoids reading and
  // writing the same FBO in one pass (undefined behaviour on some drivers).
  let rtA = null, rtB = null, rtWrite = null, rtRead = null;
  function makeRT() {
    if (rtA) { rtA.dispose(); rtA = null; }
    if (rtB) { rtB.dispose(); rtB = null; }
    const tw = Math.max(2, Math.floor(W * pixelRatio));
    const th = Math.max(2, Math.floor(H * pixelRatio));
    const optsRT = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    };
    rtA = new THREE.WebGLRenderTarget(tw, th, optsRT);
    rtB = new THREE.WebGLRenderTarget(tw, th, optsRT);
    rtA.texture.generateMipmaps = false;
    rtB.texture.generateMipmaps = false;
    rtWrite = rtA; rtRead = rtB;
  }
  if (useComposite) makeRT();

  // ---------------------------------------------------------------------------
  // Lights - single key + violet fill; emissive materials carry most of the glow.
  // ---------------------------------------------------------------------------
  const keyLight = new THREE.DirectionalLight(cHaloB, 1.15);
  keyLight.position.set(2.5, 4.0, 4.0);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(cDeep, 0.7);
  fillLight.position.set(-3.5, -2.0, 2.0);
  scene.add(fillLight);
  const ambient = new THREE.AmbientLight(cDeep, 0.55);
  scene.add(ambient);

  // Root group: the whole donut, given a subtle tilt for depth and
  // magnetically nudged by the cursor.
  const root = new THREE.Group();
  const ROOT_TILT = -0.20; // gentle lay-back: reads as a clean donut, not iso-chunky
  root.rotation.x = ROOT_TILT;
  scene.add(root);

  // A spin group inside root so idle rotation and tilt don't fight.
  const spin = new THREE.Group();
  root.add(spin);

  // ---------------------------------------------------------------------------
  // Geometry - one ExtrudeGeometry per slice (annular sector), built once.
  // ---------------------------------------------------------------------------
  const R_OUT = 2.0;
  const R_IN  = 1.18;
  const GAP   = 0.006;            // hairline angular gap so slices read flush/continuous
  const bevel = !small;
  const curveSeg = small ? 6 : 14;
  const SLICE_BASE_DEPTH = 0.30;  // uniform thickness for every slice (no value towers)

  function makeSliceGeometry(a0, a1) {
    const shape = new THREE.Shape();
    const seg = Math.max(3, Math.round((a1 - a0) / (Math.PI * 2) * 96));
    // outer arc (a0 -> a1)
    shape.moveTo(Math.cos(a0) * R_OUT, Math.sin(a0) * R_OUT);
    for (let i = 1; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg);
      shape.lineTo(Math.cos(a) * R_OUT, Math.sin(a) * R_OUT);
    }
    // inner arc back (a1 -> a0)
    for (let i = seg; i >= 0; i--) {
      const a = a0 + (a1 - a0) * (i / seg);
      shape.lineTo(Math.cos(a) * R_IN, Math.sin(a) * R_IN);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: SLICE_BASE_DEPTH,
      bevelEnabled: bevel,
      bevelThickness: 0.022,
      bevelSize: 0.014,        // small bevel so neighbours stay flush, not overlapping
      bevelSegments: small ? 1 : 3,
      curveSegments: curveSeg,
      steps: 1,
    });
    // Extrude builds along +Z; center depth so it grows symmetrically when scaled.
    geo.translate(0, 0, -SLICE_BASE_DEPTH / 2);
    geo.computeVertexNormals();
    return geo;
  }

  // Build slices
  const slices = [];
  let acc = -Math.PI / 2; // start at top (12 o'clock)
  for (let i = 0; i < CHANNELS.length; i++) {
    const frac = CHANNELS[i].value / TOTAL;
    const span = frac * Math.PI * 2;
    const a0 = acc + GAP / 2;
    const a1 = acc + span - GAP / 2;
    acc += span;

    const geo = track(makeSliceGeometry(a0, a1));

    // royal -> lilac gradient across the wheel; value also lifts brightness
    const t = i / (CHANNELS.length - 1);
    const base = new THREE.Color(C.royal).lerp(new THREE.Color(C.haloB), t * 0.85);
    const emissive = base.clone().multiplyScalar(0.45);

    const mat = track(new THREE.MeshStandardMaterial({
      color: base,
      emissive: emissive,
      emissiveIntensity: 1.0,
      metalness: 0.28,
      roughness: 0.40,
      transparent: true,
      opacity: 1,
    }));

    const mesh = new THREE.Mesh(geo, mat);
    // Uniform extrusion height for every slice so the ring stays flush + continuous
    // (no detached/floating towers). Emphasis comes from colour/brightness, not height.
    const heightScale = 1.0;
    const midAng = (a0 + a1) / 2;
    mesh.userData = {
      index: i,
      midAng,
      heightScale,
      frac,
      gradT: t,
      baseColor: base.clone(),
      baseEmissive: emissive.clone(),
      // animation state
      grow: 0,        // 0 -> 1 extrusion reveal
      hover: 0,       // 0 -> 1 highlight lift target
      lift: 0,        // smoothed outward lift offset
    };
    mesh.scale.z = 0.0001; // start flat
    spin.add(mesh);
    slices.push(mesh);
  }
  const lastIdx = CHANNELS.length - 1;

  // ---------------------------------------------------------------------------
  // Inner hub - a thin dark ink ring under the centre so the number sits on a plate.
  // ---------------------------------------------------------------------------
  const hubGeo = track(new THREE.CircleGeometry(R_IN * 0.97, 48));
  const hubMat = track(new THREE.MeshBasicMaterial({
    color: cVoid, transparent: true, opacity: 0.0,
  }));
  const hub = new THREE.Mesh(hubGeo, hubMat);
  hub.position.z = SLICE_BASE_DEPTH * 0.2;
  spin.add(hub);

  // ---------------------------------------------------------------------------
  // Reflective floor - a horizontal plane below the donut that samples a
  // vertically-flipped, blurred copy of the scene RT (planar reflection),
  // faded by Fresnel + distance + crushed toward C.panel. Capable devices only.
  // ---------------------------------------------------------------------------
  let floor = null, floorUniforms = null;
  let contactShadow = null, shockwave = null, shockUniforms = null;
  if (useComposite) {
    const floorGeo = track(new THREE.PlaneGeometry(16, 16, 1, 1));
    floorUniforms = {
      uScene: { value: null },
      uReveal: { value: 0 },
      uFlash: { value: 0 },
      cPanel: { value: cPanel },
      cHaloB: { value: cHaloB },
      cFlare: { value: cFlare },
    };
    const floorMat = track(new THREE.ShaderMaterial({
      uniforms: floorUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        varying vec4 vScreen;
        varying vec2 vLocal;
        void main(){
          vLocal = position.xy;            // plane-local coords for distance fade
          vec4 clip = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          vScreen = clip;
          gl_Position = clip;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D uScene;
        uniform float uReveal, uFlash;
        uniform vec3 cPanel, cHaloB, cFlare;
        varying vec4 vScreen;
        varying vec2 vLocal;
        void main(){
          // screen-space UV of this fragment
          vec2 uv = (vScreen.xy / vScreen.w) * 0.5 + 0.5;
          // planar reflection: sample the scene mirrored vertically and pulled up,
          // so the donut hanging above appears to stand on the floor.
          vec2 ruv = vec2(uv.x, 1.0 - uv.y);
          ruv.y = ruv.y * 0.62 + 0.40;     // compress + raise the mirrored band
          // cheap 5-tap blur for a wet-stone smear
          vec3 refl = vec3(0.0);
          float o = 0.006;
          refl += texture2D(uScene, ruv).rgb * 0.34;
          refl += texture2D(uScene, ruv + vec2( o, 0.0)).rgb * 0.165;
          refl += texture2D(uScene, ruv + vec2(-o, 0.0)).rgb * 0.165;
          refl += texture2D(uScene, ruv + vec2(0.0,  o*2.0)).rgb * 0.165;
          refl += texture2D(uScene, ruv + vec2(0.0, -o*2.0)).rgb * 0.165;
          // radial distance fade across the plane (centre stays, edges -> void)
          float d = length(vLocal) / 7.0;
          float distFade = smoothstep(1.0, 0.05, d);
          // Fresnel-ish: the floor is viewed at a grazing angle, so favour the
          // near band (front of plane, vLocal.y > 0 in local space) softly.
          float graze = smoothstep(-3.0, 4.0, vLocal.y) * 0.7 + 0.3;
          // crush reflection toward the ink panel so ~90% stays near-black
          vec3 col = mix(cPanel * 0.5, refl, 0.55);
          col = mix(col, cHaloB, 0.04);
          // the floor catches the landing flash (lilac -> one frame magenta)
          vec3 flashCol = mix(cHaloB, cFlare, clamp(uFlash - 1.0, 0.0, 1.0));
          col += flashCol * clamp(uFlash, 0.0, 1.4) * 0.10 * distFade;
          float a = distFade * graze * uReveal * 0.85;
          gl_FragColor = vec4(col, a);
        }
      `,
    }));
    floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.2;
    scene.add(floor);

    // radial contact-shadow sprite directly beneath the inner radius
    const csGeo = track(new THREE.PlaneGeometry(6.2, 6.2, 1, 1));
    const csMat = track(new THREE.ShaderMaterial({
      uniforms: { uReveal: { value: 0 }, cVoid: { value: cVoid } },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexShader: /* glsl */`
        varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uReveal; uniform vec3 cVoid;
        varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          // dark core under the donut, soft falloff, slightly elliptical to read as cast
          float core = smoothstep(0.95, 0.0, r);
          float a = pow(core, 1.6) * 0.72 * uReveal;
          gl_FragColor = vec4(cVoid, a);
        }
      `,
    }));
    contactShadow = new THREE.Mesh(csGeo, csMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = -2.17;
    scene.add(contactShadow);

    // one-shot radial shockwave ring sprite (additive), facing the donut plane
    const swGeo = track(new THREE.PlaneGeometry(9, 9, 1, 1));
    shockUniforms = {
      uShock: { value: 0 },   // 0 -> 1 over ~0.5s, one-shot
      cHaloB: { value: cHaloB },
      cFlare: { value: cFlare },
    };
    const swMat = track(new THREE.ShaderMaterial({
      uniforms: shockUniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uShock; uniform vec3 cHaloB, cFlare;
        varying vec2 vUv;
        void main(){
          if (uShock <= 0.0 || uShock >= 1.0) { discard; }
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          float radius = uShock * 1.05;            // expand outward
          float width = 0.06 + uShock * 0.10;      // thicken as it goes
          float ring = smoothstep(width, 0.0, abs(r - radius));
          float fade = (1.0 - uShock);             // dim as it expands
          fade *= fade;
          // tinted toward magenta at birth, recoiling to lilac
          vec3 col = mix(cFlare, cHaloB, smoothstep(0.0, 0.45, uShock));
          float a = ring * fade * 0.9;
          gl_FragColor = vec4(col, a);
        }
      `,
    }));
    shockwave = new THREE.Mesh(swGeo, swMat);
    shockwave.position.z = 0.05; // sit just in front of the donut centre, inside spin space
    spin.add(shockwave);
  }

  // ---------------------------------------------------------------------------
  // soft lilac glow ring sprite behind the donut (additive halo)
  // ---------------------------------------------------------------------------
  const haloGeo = track(new THREE.PlaneGeometry(7, 7, 1, 1));
  const haloUniforms = {
    uTime: { value: 0 },
    uReveal: { value: 0 },
    uFlash: { value: 0 },
    cRoyal: { value: cRoyal },
    cHaloB: { value: cHaloB },
    cFlare: { value: cFlare },
  };
  const haloMat = track(new THREE.ShaderMaterial({
    uniforms: haloUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime; uniform float uReveal; uniform float uFlash;
      uniform vec3 cRoyal, cHaloB, cFlare;
      varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float ring = smoothstep(0.62, 0.40, r) * smoothstep(0.18, 0.40, r);
        float glow = smoothstep(0.55, 0.0, r) * 0.18;
        float pulse = 0.85 + 0.15*sin(uTime*1.1);
        vec3 col = mix(cRoyal, cHaloB, smoothstep(0.30,0.6,r));
        // landing flash: lift toward lilac, and for the over-1 spike toward magenta
        col = mix(col, cHaloB, clamp(uFlash, 0.0, 1.0) * 0.5);
        col = mix(col, cFlare, clamp(uFlash - 1.0, 0.0, 1.0) * 0.7);
        float a = (ring*0.85 + glow) * pulse * uReveal * (1.0 + clamp(uFlash,0.0,1.4)*0.4);
        gl_FragColor = vec4(col, a);
      }
    `,
  }));
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.position.z = -0.9;
  scene.add(halo); // flat-facing, behind everything

  // ---------------------------------------------------------------------------
  // Fullscreen composite pass.
  //  - capable: bright-pass bloom + barrel + velocity chromatic aberration +
  //    depth-ish DOF + grain + vignette, sampling the scene RT.
  //  - small/coarse: cheap grain + vignette overlay (the V1 pass), drawn over the
  //    directly-rendered scene (no RT).
  // ---------------------------------------------------------------------------
  const overlayScene = new THREE.Scene();
  const overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsGeo = track(new THREE.PlaneGeometry(2, 2));

  let compUniforms = null, compMesh = null;
  if (useComposite) {
    compUniforms = {
      uScene: { value: null },
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(W, H) },
      uExposure: { value: 1.0 },   // dips ~8% in anticipation
      uFlash: { value: 0 },        // 0..~1.3 ; >1 tints one frame toward magenta
      uAberr: { value: 0 },        // chromatic aberration amount (∝ velocity)
      uDof: { value: 0.0 },        // global soft-focus amount
      cFlare: { value: cFlare },
      cVoid: { value: cVoid },
    };
    const compMat = track(new THREE.ShaderMaterial({
      uniforms: compUniforms,
      depthTest: false, depthWrite: false, transparent: true,
      vertexShader: /* glsl */`
        varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D uScene;
        uniform float uTime, uExposure, uFlash, uAberr, uDof;
        uniform vec2 uRes;
        uniform vec3 cFlare, cVoid;
        varying vec2 vUv;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }

        // luminance helper for the bright-pass
        float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }

        void main(){
          vec2 uv = vUv;
          vec2 c = uv - 0.5;
          float r2 = dot(c,c);

          // ---- subtle barrel distortion (pincushion-corrected) ----
          float barrel = 0.10;
          vec2 buv = uv + c * r2 * barrel;

          // ---- chromatic aberration scaled by velocity ----
          // shift along the radial direction; peaks during the signature landing.
          vec2 dir = normalize(c + 1e-5);
          float ca = (uAberr * 0.010 + 0.0008) * (0.3 + r2 * 1.4);
          vec2 rUv = buv + dir * ca;
          vec2 gUv = buv;
          vec2 bUv = buv - dir * ca;

          // ---- base scene sample with split channels ----
          vec3 col;
          col.r = texture2D(uScene, rUv).r;
          col.g = texture2D(uScene, gUv).g;
          col.b = texture2D(uScene, bUv).b;

          // ---- depth-ish DOF: a blurred copy blended by radial distance ----
          // (no depth buffer needed - edges/halo/floor fall into soft focus,
          //  centre/front stays crisp; amount lifts with uDof.)
          float foc = smoothstep(0.05, 0.55, r2);   // 0 centre -> 1 edges
          float blurAmt = (0.0018 + uDof * 0.0045) * (0.4 + foc);
          vec3 blur = vec3(0.0);
          blur += texture2D(uScene, buv + vec2( blurAmt,  blurAmt)).rgb;
          blur += texture2D(uScene, buv + vec2(-blurAmt,  blurAmt)).rgb;
          blur += texture2D(uScene, buv + vec2( blurAmt, -blurAmt)).rgb;
          blur += texture2D(uScene, buv + vec2(-blurAmt, -blurAmt)).rgb;
          blur += texture2D(uScene, buv + vec2( blurAmt*1.7, 0.0)).rgb;
          blur += texture2D(uScene, buv + vec2(-blurAmt*1.7, 0.0)).rgb;
          blur *= (1.0/6.0);
          col = mix(col, blur, foc * (0.55 + uDof*0.35));

          // ---- bright-pass threshold bloom on the purple highlights ----
          vec3 bloom = vec3(0.0);
          float bo = 0.0030 + uFlash * 0.0020;
          for (int i = 0; i < 8; i++){
            float ang = float(i) * 0.7853981; // 8 directions
            vec2 d = vec2(cos(ang), sin(ang)) * bo;
            vec3 s1 = texture2D(uScene, buv + d).rgb;
            vec3 s2 = texture2D(uScene, buv + d * 2.2).rgb;
            float t1 = max(0.0, luma(s1) - 0.55);
            float t2 = max(0.0, luma(s2) - 0.55);
            bloom += s1 * t1 + s2 * t2 * 0.6;
          }
          bloom *= 0.14 * (1.0 + uFlash * 1.2);
          col += bloom;

          // ---- landing flash tint: lilac base, one-frame magenta on the spike ----
          float mag = clamp(uFlash - 1.0, 0.0, 1.0);
          col = mix(col, col + cFlare * 0.5, mag * 0.6);

          // ---- exposure (dips in anticipation) ----
          col *= uExposure;

          // ---- vignette + crush shadows toward void ----
          float vig = smoothstep(0.95, 0.30, length(c));
          col = mix(cVoid * 0.4, col, vig * 0.85 + 0.15);

          // ---- faint film grain ----
          float g = hash(uv * uRes * 0.5 + uTime * 60.0);
          col += (g - 0.5) * 0.045;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }));
    compMesh = new THREE.Mesh(fsGeo, compMat);
    overlayScene.add(compMesh);
  } else {
    // cheap grain + vignette (V1-style) for small/coarse devices
    const grainUniforms = {
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(W, H) },
    };
    const grainMat = track(new THREE.ShaderMaterial({
      uniforms: grainUniforms,
      transparent: true, depthTest: false, depthWrite: false,
      vertexShader: /* glsl */`
        varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uTime; uniform vec2 uRes;
        varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          vec2 p = vUv - 0.5;
          float vig = smoothstep(0.85, 0.32, length(p));
          float darken = (1.0 - vig) * 0.6;
          float g = hash(vUv * uRes * 0.5 + uTime*60.0);
          float grain = (g - 0.5) * 0.055;
          gl_FragColor = vec4(vec3(0.0), darken) + vec4(vec3(grain), abs(grain)*2.0);
        }
      `,
    }));
    compMesh = new THREE.Mesh(fsGeo, grainMat);
    compUniforms = grainMat.uniforms; // for uTime/uRes updates
    overlayScene.add(compMesh);
  }

  // ---------------------------------------------------------------------------
  // DOM overlay - centre per-digit count-up + caption + legend + hover readout.
  // ---------------------------------------------------------------------------
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:absolute;inset:0;pointer-events:none;font-family:" + SYS_FONT + ";" +
    "user-select:none;-webkit-user-select:none;overflow:hidden;";
  container.appendChild(overlay);

  // centre number wrapper (slot-machine digit stack)
  const numWrap = document.createElement("div");
  numWrap.style.cssText =
    "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);" +
    "display:flex;flex-direction:column;align-items:center;line-height:1;" +
    "will-change:transform;";
  overlay.appendChild(numWrap);

  // the digit row uses tabular figures + per-digit overflow:hidden masks
  const numRow = document.createElement("div");
  numRow.style.cssText =
    "display:flex;align-items:flex-end;font-family:" + NUM_FONT + ";" +
    "font-weight:800;letter-spacing:-0.01em;color:" + C.white + ";" +
    "font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1;opacity:0;";
  numWrap.appendChild(numRow);

  // Each digit slot: an overflow-hidden mask containing a vertical strip 0-9.
  // We translateY the strip to show a digit; the slot-machine settle rolls it.
  // Slot count grows/shrinks with the displayed number (TOTAL=100 -> 3 slots).
  function buildDigitSlots(count) {
    numRow.innerHTML = "";
    const slots = [];
    for (let i = 0; i < count; i++) {
      const slot = document.createElement("div");
      slot.style.cssText =
        "position:relative;overflow:hidden;display:inline-block;text-align:center;";
      const strip = document.createElement("div");
      strip.style.cssText =
        "display:flex;flex-direction:column;align-items:center;" +
        "will-change:transform;";
      for (let d = 0; d <= 9; d++) {
        const cell = document.createElement("div");
        cell.textContent = String(d);
        cell.style.cssText = "display:block;";
        strip.appendChild(cell);
      }
      slot.appendChild(strip);
      numRow.appendChild(slot);
      slots.push({ slot, strip, value: 0 });
    }
    return slots;
  }
  let digitSlots = buildDigitSlots(2);

  // the trailing " %" sits outside the masked slots
  const pctEl = document.createElement("div");
  pctEl.style.cssText =
    "font-family:" + NUM_FONT + ";font-weight:800;color:" + C.haloB + ";opacity:0;" +
    "align-self:flex-end;";
  pctEl.textContent = "%";
  numRow.appendChild(pctEl);

  const capEl = document.createElement("div");
  capEl.style.cssText =
    "font-weight:600;letter-spacing:.14em;text-transform:uppercase;" +
    "color:" + C.haloB + ";opacity:0;transition:opacity .4s;";
  capEl.textContent = "Discovery sources";
  numWrap.appendChild(capEl);

  // ---- right-side legend (FR labels + mini count-ups + gradient hairlines) ----
  const legend = document.createElement("div");
  legend.style.cssText =
    "position:absolute;display:flex;flex-direction:column;gap:0;" +
    "opacity:0;transition:opacity .6s ease;will-change:transform,opacity;";
  overlay.appendChild(legend);

  const legendRows = [];
  for (let i = 0; i < CHANNELS.length; i++) {
    const t = i / (CHANNELS.length - 1);
    const dot = mixHexSafe(C.royal, C.haloB, t);
    const row = document.createElement("div");
    row.style.cssText =
      "position:relative;display:flex;align-items:center;justify-content:space-between;" +
      "gap:10px;padding:0 2px 6px 2px;opacity:0;transform:translateX(8px);" +
      "transition:opacity .45s ease,transform .45s cubic-bezier(.22,1,.36,1);";
    const left = document.createElement("div");
    left.style.cssText = "display:flex;align-items:center;gap:8px;";
    const swatch = document.createElement("span");
    swatch.style.cssText =
      "width:7px;height:7px;border-radius:50%;flex:0 0 auto;" +
      "background:" + dot + ";box-shadow:0 0 8px " + dot + "99;";
    const lab = document.createElement("span");
    lab.style.cssText =
      "color:" + C.haloB + ";font-weight:600;letter-spacing:.01em;white-space:nowrap;";
    lab.textContent = CHANNELS[i].label;
    left.appendChild(swatch);
    left.appendChild(lab);
    const val = document.createElement("span");
    val.style.cssText =
      "font-family:" + NUM_FONT + ";font-variant-numeric:tabular-nums;" +
      "color:" + C.white + ";font-weight:700;white-space:nowrap;";
    val.textContent = "0 %";
    row.appendChild(left);
    row.appendChild(val);
    // gradient hairline under each row (2px royal -> lilac, scaleX in on reveal)
    const line = document.createElement("div");
    line.style.cssText =
      "position:absolute;left:2px;right:2px;bottom:0;height:2px;border-radius:2px;" +
      "transform-origin:left center;transform:scaleX(0);" +
      "transition:transform .5s cubic-bezier(.22,1,.36,1);" +
      "background:linear-gradient(90deg," + C.royal + "," + mixHexSafe(C.haloA, C.haloB, 0.6) + ");";
    row.appendChild(line);
    legend.appendChild(row);
    legendRows.push({ row, val, line, value: CHANNELS[i].value, displayed: 0 });
  }

  // hovered slice readout, top-left
  const tagEl = document.createElement("div");
  tagEl.style.cssText =
    "position:absolute;font-weight:600;letter-spacing:.02em;color:" + C.white + ";" +
    "opacity:0;transition:opacity .15s ease;text-shadow:0 0 14px " + C.royal + "55;";
  tagEl.innerHTML = "";
  overlay.appendChild(tagEl);

  // small illustrative footnote bottom-right
  const noteEl = document.createElement("div");
  noteEl.style.cssText =
    "position:absolute;font-weight:500;letter-spacing:.06em;" +
    "color:" + C.haloA + "99;opacity:0;transition:opacity .5s;";
  noteEl.textContent = "+23% this month · illustrative";
  overlay.appendChild(noteEl);

  // -- layout / sizing of all DOM bits (called on boot + resize) --
  let numSize = 0, digitH = 0;
  function layoutOverlay() {
    const mn = Math.min(W, H);
    numSize = Math.round(mn * 0.155);
    numRow.style.fontSize = numSize + "px";
    pctEl.style.fontSize = Math.round(numSize * 0.42) + "px";
    pctEl.style.marginLeft = Math.round(numSize * 0.06) + "px";
    pctEl.style.marginBottom = Math.round(numSize * 0.06) + "px";
    // digit slot height = one line; mask shows exactly one digit
    digitH = Math.round(numSize * 1.0);
    for (const s of digitSlots) {
      s.slot.style.width = Math.round(numSize * 0.58) + "px";
      s.slot.style.height = digitH + "px";
    }
    capEl.style.fontSize = Math.round(numSize * 0.2) + "px";
    capEl.style.marginTop = Math.round(numSize * 0.14) + "px";

    // legend: right side, vertically centred, hidden on very small frames
    const showLegend = W > 460 && H > 300 && !small;
    legend.style.display = showLegend ? "flex" : "none";
    if (showLegend) {
      const lw = Math.round(Math.min(W * 0.26, 230));
      legend.style.width = lw + "px";
      legend.style.right = Math.round(W * 0.05) + "px";
      legend.style.top = "50%";
      const lfs = Math.round(mn * 0.034);
      legend.style.fontSize = lfs + "px";
    }

    tagEl.style.left = Math.round(W * 0.06) + "px";
    tagEl.style.top = Math.round(H * 0.07) + "px";
    tagEl.style.fontSize = Math.round(mn * 0.05) + "px";
    noteEl.style.right = Math.round(W * 0.05) + "px";
    noteEl.style.bottom = Math.round(H * 0.06) + "px";
    noteEl.style.fontSize = Math.round(mn * 0.032) + "px";
    // recompute current digit positions for new height
    setDigits(displayedNum, true);
  }

  // --- digit helpers: show `n` (0..100) across the 2 slots (+ optional 3rd) ---
  function ensureDigitCount(n) {
    const need = String(Math.max(0, Math.round(n))).length;
    if (need !== digitSlots.length) {
      digitSlots = buildDigitSlots(need);
      // re-add pct after rebuild
      numRow.appendChild(pctEl);
      layoutSlotsOnly();
    }
  }
  function layoutSlotsOnly() {
    for (const s of digitSlots) {
      s.slot.style.width = Math.round(numSize * 0.58) + "px";
      s.slot.style.height = digitH + "px";
    }
  }
  // place each digit strip via translateY (no transition = instant; with = settle)
  function setDigits(n, instant) {
    n = Math.max(0, Math.round(n));
    ensureDigitCount(n);
    const str = String(n).padStart(digitSlots.length, "0");
    for (let i = 0; i < digitSlots.length; i++) {
      const d = parseInt(str[i], 10);
      const s = digitSlots[i];
      s.value = d;
      const y = -d * digitH;
      s.strip.style.transition = instant ? "none" : s.strip.style.transition;
      s.strip.style.transform = "translateY(" + y + "px)";
    }
  }

  // slot-machine settle: roll the last digit through a few values with spring
  // overshoot, then snap to the final. Uses transform transitions on the strip.
  let settleTimers = [];
  function clearSettleTimers() {
    for (const t of settleTimers) clearTimeout(t);
    settleTimers = [];
  }
  function slotMachineSettle(finalN) {
    clearSettleTimers();
    ensureDigitCount(finalN);
    const str = String(finalN).padStart(digitSlots.length, "0");
    // For each slot, do a quick spring-y roll to its final digit.
    for (let i = 0; i < digitSlots.length; i++) {
      const s = digitSlots[i];
      const finalD = parseInt(str[i], 10);
      // overshoot one past, then settle (gives the slot a tactile snap)
      const over = (finalD + 2) % 10;
      const overY = -(over) * digitH - digitH; // roll forward a full extra turn
      s.strip.style.transition = "transform .26s cubic-bezier(.34,1.56,.64,1)";
      // first push toward overshoot
      s.strip.style.transform = "translateY(" + overY + "px)";
      const t1 = setTimeout(() => {
        s.strip.style.transition = "transform .22s cubic-bezier(.22,1,.36,1)";
        s.strip.style.transform = "translateY(" + (-finalD * digitH) + "px)";
        s.value = finalD;
      }, 150 + i * 28);
      settleTimers.push(t1);
    }
  }

  // ---------------------------------------------------------------------------
  // STATE machine
  // ---------------------------------------------------------------------------
  let raf = 0, running = false, lastT = 0, elapsed = 0;

  // entrance timeline (seconds)
  const SLICE_STAGGER = 0.13;          // gap between slice extrusions
  const SLICE_GROW = 0.5;              // each slice's grow duration
  const REVEAL_START = 0.25;
  const entranceLen = REVEAL_START + (CHANNELS.length - 1) * SLICE_STAGGER + SLICE_GROW + 0.25;
  let entranceDone = false;
  let landFired = false;               // signature flash latch
  let anticipationFired = false;       // anticipation latch

  // ---- spring-driven flash (vel + stiffness) so the bloom blooms & recoils ----
  // flash value can spike >1 for the one-frame magenta crest, then recoil to lilac.
  let flash = 0;        // current bloom flash energy
  let flashVel = 0;     // spring velocity
  let flashTarget = 0;  // spring target (impulse via flashVel)

  // ---- number scale spring (1.0 -> 1.18 -> 0.98 -> 1.0) ----
  let numScale = 1, numScaleVel = 0, numScaleTarget = 1;

  // ---- spin overshoot spring (1.5deg rotational kick on z) ----
  let spinKick = 0, spinKickVel = 0; // additive radians on spin.rotation.z

  // ---- shockwave one-shot ----
  let shockT = -1; // -1 idle; 0..1 active over SHOCK_DUR
  const SHOCK_DUR = 0.5;

  // ---- anticipation / exposure ----
  let exposure = 1.0, exposureTarget = 1.0;
  let dof = 0.0, dofTarget = 0.0;

  // count-up: from 0 to TOTAL, lands exactly with the final slice
  let displayedNum = 0;

  // legend mini count-up scheduler (set on the landing beat; -1 idle, -2 done)
  let legendCountStart = -1;

  // ---- highlight cycle: after the entrance, one channel is "active" at a time.
  // The big centre %, the centre sublabel (channel name) and the legend all agree
  // with this index. Hover overrides the cycle (and is reflected everywhere).
  let highlightIndex = -1;      // currently highlighted channel (-1 = none yet)
  let cycleEnabled = false;     // true once the entrance settles
  let cycleTimer = elapsed;     // next-advance clock (seconds)
  let appliedHighlightPrev = -1;// tracks active-index changes for the number-pop
  const CYCLE_DWELL = 2.2;      // how long each channel stays highlighted
  // the index actually shown = hover wins over the cycle
  function activeIndex() {
    return hoverIndex >= 0 ? hoverIndex : highlightIndex;
  }

  // idle spin
  const IDLE_SPIN = 0.18;
  let idleSpin = reduced ? 0 : IDLE_SPIN;
  let idleSpinTarget = reduced ? 0 : IDLE_SPIN;
  let spinAngle = 0;

  // cursor magnetic tilt (applied to root) + camera parallax
  const tiltTarget = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  let prevTiltX = 0, prevTiltY = 0; // for velocity -> aberration
  let tiltVel = 0;
  let hoverIndex = -1;

  // camera parallax targets (lerped toward cursor offset)
  const camOffset = { x: 0, y: 0 };
  const camOffsetTarget = { x: 0, y: 0 };

  // raycasting (throttled)
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pendingPick = false;

  let failsafe = 0;

  // ---- per-slice update helpers ------------------------------------------
  function applySlice(mesh, dt) {
    const u = mesh.userData;
    // smooth hover lift
    u.lift += (u.hover - u.lift) * Math.min(1, dt * 12);
    // final z scale = grow * value-driven height, plus a small hover bump
    const targetH = u.heightScale * (1 + u.lift * 0.22);
    const z = Math.max(0.0001, u.grow * targetH);
    mesh.scale.z = z;
    // Highlight pop stays FLUSH with the ring: no outward radial offset (an
    // explode here detaches the wedge and the bloom blows it white). The pop is
    // sold purely by a tiny forward (z) lift + the brighter emissive below, so
    // the highlighted slice never separates from the continuous ring.
    mesh.position.x = 0;
    mesh.position.y = 0;
    mesh.position.z = u.lift * 0.05;

    // colour / emissive response: hover pushes toward lilac + brightens;
    // the global flash spring lifts every slice's emissive on the landing.
    const mat = mesh.material;
    const hl = u.lift;
    const fl = Math.min(flash, 1.3);
    // keep the highlight a bright lilac, not a blown-out white wedge: cap the
    // emissive lift so the bright-pass bloom reads it as "glowing" not "white".
    mat.emissiveIntensity = 1.0 + hl * 0.7 + fl * 1.6;
    mat.color.copy(u.baseColor).lerp(cHaloB, hl * 0.42);
    mat.emissive.copy(u.baseEmissive).lerp(cHaloB, hl * 0.45).multiplyScalar(1 + hl * 0.25);
    // dim non-active slices slightly when a channel is focused (hover OR cycle)
    const focus = hoverIndex >= 0 ? hoverIndex : (cycleEnabled ? highlightIndex : -1);
    if (focus >= 0 && u.index !== focus) {
      mat.opacity = lerp(mat.opacity, 0.7, Math.min(1, dt * 8));
    } else {
      mat.opacity = lerp(mat.opacity, 1.0, Math.min(1, dt * 8));
    }
  }

  function syncFloorFlash() {
    if (floorUniforms) floorUniforms.uFlash.value = flash;
    haloUniforms.uFlash.value = flash;
    if (compUniforms && useComposite) compUniforms.uFlash.value = flash;
  }

  function setStaticFrame() {
    // fully assembled, no autoplay - a composed screenshot frame
    elapsed = entranceLen + 1;
    entranceDone = true;
    landFired = true;
    anticipationFired = true;
    for (const m of slices) {
      m.userData.grow = 1;
      m.userData.hover = 0;
      m.userData.lift = 0;
      m.scale.z = m.userData.heightScale;
      m.position.set(0, 0, 0);
      const mat = m.material;
      mat.emissiveIntensity = 1.0;
      mat.opacity = 1;
      mat.color.copy(m.userData.baseColor);
      mat.emissive.copy(m.userData.baseEmissive);
    }
    hub.material.opacity = 0.5;
    haloUniforms.uReveal.value = 1;
    haloUniforms.uTime.value = 1.0;
    haloUniforms.uFlash.value = 0;
    if (floorUniforms) { floorUniforms.uReveal.value = 1; floorUniforms.uFlash.value = 0; }
    if (contactShadow) contactShadow.material.uniforms.uReveal.value = 1;
    if (shockUniforms) shockUniforms.uShock.value = 0;
    if (compUniforms) {
      if (useComposite) {
        compUniforms.uExposure.value = 1.0;
        compUniforms.uFlash.value = 0;
        compUniforms.uAberr.value = 0;
        compUniforms.uDof.value = 0.0;
      }
      compUniforms.uTime.value = 0;
    }
    spin.rotation.z = 0;
    root.rotation.set(ROOT_TILT, 0, 0);
    camera.position.copy(CAM_BASE);
    camera.lookAt(camLook);
    displayedNum = TOTAL;
    flash = 0; flashVel = 0; flashTarget = 0;
    numScale = 1; numScaleVel = 0; numScaleTarget = 1;
    spinKick = 0; spinKickVel = 0;
    shockT = -1;
    exposure = 1; exposureTarget = 1;
    dof = 0; dofTarget = 0;
    // DOM: assembled. Static frame highlights the top channel (Google) so the
    // centre %, the centre sublabel and the legend all agree (centre == 38 %).
    revealDigits(true);
    numWrap.style.transform = "translate(-50%,-50%) scale(1)";
    capEl.style.opacity = "1";
    noteEl.style.opacity = "1";
    revealLegend(true);
    cycleEnabled = false;          // no auto-advance in the static/reduced frame
    hoverIndex = -1;
    highlightIndex = 0;
    appliedHighlight = -2;         // force a fresh apply
    appliedHighlightPrev = 0;
    applyHighlight(0, false);      // centre -> "38 %", sublabel -> "GOOGLE"
    // brighten the highlighted slice in place for the static frame
    for (const m of slices) { m.userData.lift = m.userData.hover; applySlice(m, 1); }
    renderAll();
  }

  function revealDigits(on) {
    const o = on ? "1" : "0";
    for (const s of digitSlots) s.slot.style.opacity = o;
    numRow.style.opacity = o;
    pctEl.style.opacity = on ? "1" : "0";
  }

  function revealLegend(on) {
    legend.style.opacity = on ? "1" : "0";
    for (let i = 0; i < legendRows.length; i++) {
      const lr = legendRows[i];
      lr.row.style.opacity = on ? "1" : "0";
      lr.row.style.transform = on ? "translateX(0)" : "translateX(8px)";
      lr.line.style.transform = on ? "scaleX(1)" : "scaleX(0)";
      if (on) { lr.displayed = lr.value; lr.val.textContent = lr.value + " %"; }
    }
  }

  // ---- highlight sync: make the centre %, the centre sublabel (channel name),
  // the legend rows AND the 3D slice all agree on the active channel. The big
  // centre number EQUALS the highlighted slice's percentage.
  let appliedHighlight = -2; // last index applied to the DOM/centre (force first run)
  function applyHighlight(idx, settle) {
    // 3D: light up only the active slice (brighten in place; no separation).
    // hover already drives userData.hover; the cycle reuses the same channel.
    for (const m of slices) {
      m.userData.hover = (m.userData.index === idx) ? 1 : 0;
    }
    // legend: emphasise the active row, dim the rest.
    for (let i = 0; i < legendRows.length; i++) {
      const lr = legendRows[i];
      const isOn = i === idx;
      lr.row.style.opacity = isOn ? "1" : "0.5";
      lr.val.style.color = isOn ? C.white : C.haloB;
      lr.line.style.transform = isOn ? "scaleX(1)" : "scaleX(0.001)";
    }
    if (idx === appliedHighlight) return; // centre already in sync
    appliedHighlight = idx;
    if (idx < 0) return;
    const ch = CHANNELS[idx];
    // centre big number = highlighted slice's %
    if (settle) slotMachineSettle(ch.value);
    else setDigits(ch.value, true);
    displayedNum = ch.value;
    // centre sublabel becomes the channel NAME (replaces the static "Discovery sources")
    capEl.textContent = ch.label.toUpperCase();
    // top-left tag mirrors "Google · 38 %"
    tagEl.innerHTML =
      '<span style="color:' + C.haloB + '">' + ch.label + '</span>' +
      '<span style="color:' + C.white + '"> · ' + ch.value + ' %</span>';
    tagEl.style.opacity = "1";
  }

  // ---------------------------------------------------------------------------
  // RENDER - scene to RT, then composite (+ planar reflection samples RT).
  // ---------------------------------------------------------------------------
  function renderAll() {
    if (useComposite && rtWrite) {
      // Pass 1: render scene into rtWrite. The floor (inside scene) samples
      // rtRead = LAST frame's render, so no same-FBO feedback this frame.
      if (floorUniforms) floorUniforms.uScene.value = rtRead.texture;
      renderer.setRenderTarget(rtWrite);
      renderer.clear();
      renderer.render(scene, camera);

      // Pass 2: composite rtWrite (just rendered) to screen.
      if (compUniforms) compUniforms.uScene.value = rtWrite.texture;
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(overlayScene, overlayCam);

      // swap buffers - next frame's floor reads this frame's render.
      const tmp = rtWrite; rtWrite = rtRead; rtRead = tmp;
    } else {
      // small/coarse: direct render + cheap grain overlay
      renderer.setRenderTarget(null);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.autoClear = false;
      renderer.render(overlayScene, overlayCam);
      renderer.autoClear = true;
    }
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
    if (dt > 0.05) dt = 0.05;
    elapsed += dt;

    haloUniforms.uTime.value = elapsed;
    if (compUniforms) compUniforms.uTime.value = elapsed;

    // ---- entrance: slices extrude in sequence ----
    if (!entranceDone) {
      for (let i = 0; i < slices.length; i++) {
        const startT = REVEAL_START + i * SLICE_STAGGER;
        const p = clamp01((elapsed - startT) / SLICE_GROW);
        // backOut so each slice "clicks" in with a tiny overshoot
        slices[i].userData.grow = p <= 0 ? 0 : easeBackOut(p, i === lastIdx ? 2.4 : 1.5);
      }
      // halo + hub + floor + caption reveal under the growth
      const rev = easePow4Out(clamp01((elapsed - REVEAL_START) / 0.7));
      haloUniforms.uReveal.value = rev;
      hub.material.opacity = lerp(0, 0.5, rev);
      if (floorUniforms) floorUniforms.uReveal.value = rev;
      if (contactShadow) contactShadow.material.uniforms.uReveal.value = rev;

      // count-up tracks the slices that have landed (lands with the last slice)
      const finalStart = REVEAL_START + lastIdx * SLICE_STAGGER;
      const countP = easeExpoOut(clamp01((elapsed - REVEAL_START) / (finalStart + SLICE_GROW * 0.72 - REVEAL_START)));
      displayedNum = Math.round(countP * TOTAL);
      setDigits(displayedNum, false);
      revealDigits(clamp01((elapsed - REVEAL_START) / 0.3) > 0.05);

      // SIGNATURE - final slice timeline
      const finalP = clamp01((elapsed - finalStart) / SLICE_GROW);

      // (1) ANTICIPATION: ~120ms before the final slice seats, dip exposure ~8%
      //     and pull idle spin to near-zero - the donut holds its breath.
      if (!anticipationFired && finalP >= 0.58) {
        anticipationFired = true;
        exposureTarget = 0.92;     // ~8% dip
        idleSpinTarget = 0.015;    // near-zero
        dofTarget = 0.5;           // soften the world a touch before payoff
      }

      // (2) PAYOFF: on landFired fire the shockwave + spring the flash toward the
      //     magenta crest, then settle the number with the slot-machine roll.
      if (finalP >= 0.82 && !landFired) {
        landFired = true;
        displayedNum = TOTAL;
        // spring impulse: kick flash velocity hard so it overshoots past 1
        flashVel += 14.0;     // big impulse -> bloom blooms
        flashTarget = 0.0;    // spring pulls back toward 0 (recoil)
        // number scale spring impulse (1 -> ~1.18 overshoot)
        numScaleVel += 7.5;
        // spin overshoot kick (~1.5deg)
        spinKickVel += 0.62;
        // one-shot shockwave
        shockT = 0;
        // restore exposure + spin after the breath
        exposureTarget = 1.0;
        idleSpinTarget = reduced ? 0 : IDLE_SPIN;
        dofTarget = 0.0;
        // slot-machine settle on the digits, ending at TOTAL
        slotMachineSettle(TOTAL);
        // reveal the legend with mini count-ups + hairlines after the beat
        legendCountStart = elapsed + 0.12;
        legend.style.opacity = "1";
      }

      if (elapsed >= REVEAL_START + entranceLen) {
        entranceDone = true;
      }
    }

    // ---- spring: flash (drives bloom; vel + stiffness; can spike >1) ----
    {
      const k = 120;   // stiffness
      const damp = 14; // damping
      const acc = (flashTarget - flash) * k - flashVel * damp;
      flashVel += acc * dt;
      flash += flashVel * dt;
      if (flash < 0) { flash = 0; if (flashVel < 0) flashVel = 0; }
    }
    // ---- spring: number scale (1 -> 1.18 -> 0.98 -> 1) ----
    {
      const k = 150, damp = 13;
      const acc = (numScaleTarget - numScale) * k - numScaleVel * damp;
      numScaleVel += acc * dt;
      numScale += numScaleVel * dt;
    }
    // ---- spring: spin overshoot kick (settles to 0) ----
    {
      const k = 90, damp = 10;
      const acc = (0 - spinKick) * k - spinKickVel * damp;
      spinKickVel += acc * dt;
      spinKick += spinKickVel * dt;
    }

    // exposure + dof eased toward targets
    exposure += (exposureTarget - exposure) * Math.min(1, dt * 6);
    dof += (dofTarget - dof) * Math.min(1, dt * 5);

    // ---- one-shot shockwave advance ----
    if (shockT >= 0) {
      shockT += dt / SHOCK_DUR;
      if (shockUniforms) shockUniforms.uShock.value = clamp01(shockT);
      if (shockT >= 1) { shockT = -1; if (shockUniforms) shockUniforms.uShock.value = 0; }
    }

    // legend mini count-ups (fire after the landing beat)
    if (legendCountStart >= 0 && elapsed >= legendCountStart) {
      const lp = clamp01((elapsed - legendCountStart) / 0.7);
      const e = easeExpoOut(lp);
      for (let i = 0; i < legendRows.length; i++) {
        const lr = legendRows[i];
        const target = Math.round(lr.value * e);
        if (target !== lr.displayed) {
          lr.displayed = target;
          lr.val.textContent = target + " %";
        }
        // stagger the row reveal + hairline draw
        const rowP = clamp01((elapsed - legendCountStart - i * 0.05) / 0.4);
        lr.row.style.opacity = String(rowP);
        lr.row.style.transform = "translateX(" + (8 * (1 - rowP)) + "px)";
        if (rowP > 0.1) lr.line.style.transform = "scaleX(1)";
      }
      if (lp >= 1) {
        for (const lr of legendRows) { lr.displayed = lr.value; lr.val.textContent = lr.value + " %"; }
        legendCountStart = -2; // done
        // legend has fully tallied - hand off to the highlight cycle.
        if (!cycleEnabled) {
          cycleEnabled = true;
          highlightIndex = 0;          // start on Google
          cycleTimer = elapsed + CYCLE_DWELL;
          applyHighlight(0, true);     // centre slot-machines from 100 -> 38
        }
      }
    }

    // ---- highlight cycle + centre/legend sync (after entrance) --------------
    if (cycleEnabled) {
      // advance the auto-cycle unless the user is hovering a slice.
      if (hoverIndex < 0 && !reduced && elapsed >= cycleTimer) {
        highlightIndex = (highlightIndex + 1) % CHANNELS.length;
        cycleTimer = elapsed + CYCLE_DWELL;
      }
      // hover wins over the cycle; the centre + legend always reflect activeIndex().
      const ai = activeIndex();
      // settle (slot-machine roll) when the value changes; cheap when unchanged.
      applyHighlight(ai, ai !== appliedHighlight);
      // a tiny number-pop each time the active channel changes
      if (ai !== appliedHighlightPrev) {
        appliedHighlightPrev = ai;
        if (ai >= 0) numScaleVel += 3.0;
      }
    }

    syncFloorFlash();

    // ---- DOM: number scale spring -> transform ----
    numWrap.style.transform =
      "translate(-50%,-50%) scale(" + numScale.toFixed(4) + ")";

    // ---- idle ambient life ----
    idleSpin += (idleSpinTarget - idleSpin) * Math.min(1, dt * 4);
    if (!reduced) {
      spinAngle += dt * idleSpin;
      spin.rotation.z = spinAngle + spinKick;
      // gentle breathing tilt so the depth catches the light
      root.rotation.x = ROOT_TILT + Math.sin(elapsed * 0.5) * 0.03 + tilt.x;
      root.rotation.y = tilt.y;
      // halo subtle pulse-scale
      const hp = 1 + Math.sin(elapsed * 1.1) * 0.02;
      halo.scale.set(hp, hp, 1);
    } else {
      spin.rotation.z = spinKick;
    }

    // cursor magnetic tilt smoothing + velocity (for chromatic aberration)
    prevTiltX = tilt.x; prevTiltY = tilt.y;
    tilt.x += (tiltTarget.x - tilt.x) * Math.min(1, dt * 5);
    tilt.y += (tiltTarget.y - tilt.y) * Math.min(1, dt * 5);
    const dTilt = Math.hypot(tilt.x - prevTiltX, tilt.y - prevTiltY) / Math.max(dt, 1e-3);
    tiltVel = lerp(tiltVel, dTilt, Math.min(1, dt * 8));

    // camera micro-parallax: lerp position by a few % of cursor offset, look-at centre
    camOffset.x += (camOffsetTarget.x - camOffset.x) * Math.min(1, dt * 4);
    camOffset.y += (camOffsetTarget.y - camOffset.y) * Math.min(1, dt * 4);
    camera.position.set(
      CAM_BASE.x + camOffset.x,
      CAM_BASE.y + camOffset.y,
      CAM_BASE.z
    );
    camera.lookAt(camLook);

    // composite uniforms: exposure dip + dof + aberration ∝ (tilt velocity + spin + flash)
    if (useComposite && compUniforms) {
      compUniforms.uExposure.value = exposure;
      compUniforms.uDof.value = dof;
      const spinVel = Math.abs(idleSpin) + Math.abs(spinKickVel) * 0.5;
      compUniforms.uAberr.value =
        Math.min(1.4, tiltVel * 0.8 + spinVel * 0.3 + Math.min(flash, 1.3) * 0.9);
    }

    // per-slice transforms / colours
    for (const m of slices) applySlice(m, dt);

    renderAll();
  }

  // ---------------------------------------------------------------------------
  // interaction
  // ---------------------------------------------------------------------------
  function pick(clientX, clientY) {
    const r = container.getBoundingClientRect();
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(slices, false);
    const idx = hits.length ? hits[0].object.userData.index : -1;
    if (idx !== hoverIndex) {
      hoverIndex = idx;
      container.style.cursor = idx >= 0 ? "pointer" : "";
      // When hovering ends, snap the cycle clock forward so it doesn't instantly
      // jump; the frame loop's highlight block re-syncs centre + legend + tag.
      if (idx < 0 && cycleEnabled) {
        cycleTimer = elapsed + CYCLE_DWELL;
        // keep the tag visible on the cycle's current channel
      }
      // If the cycle hasn't started yet (rare), still reflect the hover directly.
      if (!cycleEnabled) {
        for (const m of slices) m.userData.hover = m.userData.index === idx ? 1 : 0;
        if (idx >= 0) {
          const ch = CHANNELS[idx];
          tagEl.innerHTML =
            '<span style="color:' + C.haloB + '">' + ch.label + '</span>' +
            '<span style="color:' + C.white + '"> · ' + ch.value + ' %</span>';
          tagEl.style.opacity = "1";
        } else {
          tagEl.style.opacity = "0";
        }
      }
    }
  }

  function onMove(e) {
    if (reduced) return;
    const r = container.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    tiltTarget.y = (px - 0.5) * 0.5;
    tiltTarget.x = (py - 0.5) * 0.35; // additive over base in frame()
    // camera parallax - a few percent of the cursor offset
    camOffsetTarget.x = (px - 0.5) * 0.9;
    camOffsetTarget.y = -(py - 0.5) * 0.6;
    // throttle raycast to one per frame
    if (!pendingPick) {
      pendingPick = true;
      const cx = e.clientX, cy = e.clientY;
      requestAnimationFrame(() => { pendingPick = false; pick(cx, cy); });
    }
  }
  function onEnter() { /* hover handled via move */ }
  function onLeave() {
    tiltTarget.x = 0; tiltTarget.y = 0;
    camOffsetTarget.x = 0; camOffsetTarget.y = 0;
    hoverIndex = -1;
    container.style.cursor = "";
    if (cycleEnabled) {
      // resume the auto-cycle from the current channel; the frame loop re-syncs
      // centre + legend + tag to highlightIndex. Force a re-apply next frame.
      appliedHighlight = -2;
      cycleTimer = elapsed + CYCLE_DWELL;
    } else {
      for (const m of slices) m.userData.hover = 0;
      tagEl.style.opacity = "0";
    }
  }
  function onClick() {
    if (reduced) return;
    // a click replays a brief lilac pulse + a number bump (spring impulses)
    flashVel += 7.0;
    numScaleVel += 4.5;
    if (shockT < 0) shockT = 0;
  }

  if (!coarse) {
    container.addEventListener("pointerenter", onEnter);
    container.addEventListener("pointerleave", onLeave);
    container.addEventListener("pointermove", onMove);
  } else {
    // coarse pointer: tap a slice to highlight it; no continuous tilt
    container.addEventListener("pointerdown", (e) => { if (!reduced) pick(e.clientX, e.clientY); });
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
    small = Math.min(W, H) < 360 || coarse;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    if (compUniforms) {
      if (compUniforms.uRes) compUniforms.uRes.value.set(W, H);
    }
    if (useComposite) makeRT();
    layoutOverlay();
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
    clearSettleTimers();
    entranceDone = false;
    landFired = false;
    anticipationFired = false;
    flash = 0; flashVel = 0; flashTarget = 0;
    numScale = 1; numScaleVel = 0; numScaleTarget = 1;
    spinKick = 0; spinKickVel = 0;
    shockT = -1;
    if (shockUniforms) shockUniforms.uShock.value = 0;
    exposure = 1; exposureTarget = 1;
    dof = 0; dofTarget = 0;
    elapsed = 0;
    displayedNum = 0;
    spinAngle = 0;
    spin.rotation.z = 0;
    idleSpin = reduced ? 0 : 0.02; // ease up from near-still
    idleSpinTarget = reduced ? 0 : IDLE_SPIN;
    tilt.x = 0; tilt.y = 0; tiltTarget.x = 0; tiltTarget.y = 0;
    camOffset.x = 0; camOffset.y = 0; camOffsetTarget.x = 0; camOffsetTarget.y = 0;
    camera.position.copy(CAM_BASE); camera.lookAt(camLook);
    legendCountStart = -1;
    // reset highlight cycle (re-arms after the entrance settles)
    cycleEnabled = false;
    hoverIndex = -1;
    highlightIndex = -1;
    appliedHighlight = -2;
    appliedHighlightPrev = -1;
    cycleTimer = 0;
    capEl.textContent = "Discovery sources";
    for (const m of slices) {
      m.userData.grow = 0;
      m.userData.hover = 0;
      m.userData.lift = 0;
      m.scale.z = 0.0001;
      m.position.set(0, 0, 0);
      m.material.opacity = 1;
    }
    hub.material.opacity = 0;
    haloUniforms.uReveal.value = 0;
    haloUniforms.uFlash.value = 0;
    if (floorUniforms) { floorUniforms.uReveal.value = 0; floorUniforms.uFlash.value = 0; }
    if (contactShadow) contactShadow.material.uniforms.uReveal.value = 0;
    // DOM reset
    setDigits(0, true);
    revealDigits(false);
    numWrap.style.transform = "translate(-50%,-50%) scale(0.9)";
    capEl.style.opacity = "0";
    noteEl.style.opacity = "0";
    // legend hidden until the beat
    legend.style.opacity = "0";
    for (const lr of legendRows) {
      lr.displayed = 0;
      lr.val.textContent = "0 %";
      lr.row.style.opacity = "0";
      lr.row.style.transform = "translateX(8px)";
      lr.line.style.transform = "scaleX(0)";
    }
    // caption + note ride in shortly after reveal
    setTimeout(() => { if (!reduced) { capEl.style.opacity = "1"; noteEl.style.opacity = "1"; } }, 600);
  }

  // ---- boot ----
  layoutOverlay();
  if (reduced) {
    setStaticFrame();
  } else {
    beginEntrance();
    start();
    // reveal failsafe: never leave it stuck invisible
    failsafe = window.setTimeout(() => {
      if (!entranceDone) {
        for (const m of slices) m.userData.grow = 1;
        haloUniforms.uReveal.value = 1;
        hub.material.opacity = 0.5;
        if (floorUniforms) floorUniforms.uReveal.value = 1;
        if (contactShadow) contactShadow.material.uniforms.uReveal.value = 1;
        revealDigits(true);
        capEl.style.opacity = "1";
        noteEl.style.opacity = "1";
        revealLegend(true);
        entranceDone = true;
        landFired = true;
        anticipationFired = true;
        legendCountStart = -2;
        // arm the highlight cycle so the centre shows a channel %, not a stuck 100
        cycleEnabled = true;
        highlightIndex = 0;
        appliedHighlight = -2;
        appliedHighlightPrev = 0;
        cycleTimer = elapsed + CYCLE_DWELL;
        applyHighlight(0, false);
        if (!running && !reduced) start();
      }
    }, 4000);
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
    pause() { stop(); },
    resume() {
      if (reduced) return;
      if (!running) start();
    },
    setReducedMotion(b) {
      reduced = !!b;
      idleSpinTarget = reduced ? 0 : IDLE_SPIN;
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
      clearSettleTimers();
      if (!coarse) {
        container.removeEventListener("pointerenter", onEnter);
        container.removeEventListener("pointerleave", onLeave);
        container.removeEventListener("pointermove", onMove);
      }
      container.removeEventListener("click", onClick);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", applySize);
      for (const d of disposables) {
        try { d.dispose && d.dispose(); } catch (e) {}
      }
      try { if (rtA) rtA.dispose(); } catch (e) {}
      try { if (rtB) rtB.dispose(); } catch (e) {}
      try {
        renderer.dispose();
        renderer.forceContextLoss && renderer.forceContextLoss();
      } catch (e) {}
      try {
        if (renderer.domElement && renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      } catch (e) {}
      try {
        if (overlay.parentNode === container) container.removeChild(overlay);
      } catch (e) {}
      renderer = null; scene = null; camera = null; rtA = null; rtB = null; rtWrite = null; rtRead = null;
    },
  };
}
