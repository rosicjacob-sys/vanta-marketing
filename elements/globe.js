// 07 · Sovereign Globe — V2 — lineage: The Orb
// A near-black sphere wrapped in a royal gradient-hairline cage with a thick lilac fresnel rim;
// lilac-violet markers fire violet arcs across the surface, and each LANDING arc fires a
// shader-driven SURFACE WAVE: the dark sphere itself visibly bulges along its normals as a
// geodesic ripple crosses each vertex, trailed by a second concentric wake-ring 80ms behind.
// The whole frame passes through a hand-rolled composite (bright-pass bloom + barrel + velocity-
// coupled chromatic aberration) so the moment glows from within against a ~90% near-black frame.
// Once per session, a single earned hot-magenta arc lands and drives every stage to its peak.
//
// V2 over V1 — the elevations:
//   1. Hand-rolled composite post pass (FBO -> fullscreen-triangle frag): bright-pass threshold
//      bloom (5-tap separable), subtle barrel warp, velocity-coupled chromatic aberration, and a
//      global exposure that DIPS ~12% on landing-anticipation then settles.
//   2. The ripple is no longer a flat decal: a shader surface-wave displaces the CORE sphere via
//      onBeforeCompile (geodesic distance from the landing point), and the ring alpha is a thin
//      animated annulus band in the frag. Two staggered concentric rings -> a layered wake.
//   3. Anticipation -> payoff -> settle timing: arc head eases expoOut; on landing the world
//      inhales (exposure + fresnel dim ~90ms), THEN fresnel spikes to ~1.4 + marker pops to 1.6x
//      to true white, THEN the ring overshoots its rest radius via easeBackOut and springs back.
//   4. Depth: camera micro-parallax to cursor (lookAt every frame), 2 parallax star z-layers
//      fading to atmosphere, white reserved for marker cores / sparks only (resting markers lilac).
//   5. Gradient hairline cage: latitude/longitude lines whose per-fragment alpha follows the
//      fresnel dot(N,V) — crisp on the silhouette, fading to near-nothing face-on.
//   6. The single earned magenta is deterministic (scheduled hero arc, or first deliberate click),
//      and drives the full composite to its peak: brightest bloom, max fresnel, wider double
//      ripple, a 1-frame haptic overshoot tick on the marker.
//
// Deps: three@0.160.0 (WebGL). No assets, no network beyond the pinned import. Everything procedural.
// Perf: single WebGL context, instanced markers/halos, fixed arc/ring pools (zero per-frame alloc),
//       DPR capped to [1,2], offscreen pause, full leak-free dispose. Coarse-pointer / small ->
//       lighter geometry + fewer arcs + bloom downscale. Reduced motion -> static composed frame
//       (no rAF). WebGL-failure -> CSS radial-gradient fallback (never blank).

import * as THREE from "https://esm.sh/three@0.160.0";

export const meta = {
  id: 7,
  slug: "sovereign-globe",
  title: "Sovereign Globe",
  lineage: "The Orb",
  version: "V2",
  signature:
    "An arc lands; the world inhales, then the dark sphere itself ripples a glowing geodesic wave from the point of impact.",
  interaction: "Drag or move the cursor to tilt the globe with weighted inertia; flinging smears the rim.",
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
  const lite = () => small() || coarse; // lighter quality budget

  const c3 = (hex) => new THREE.Color(hex);

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
  //  STATIC GRADIENT FALLBACK (no WebGL) — never blank
  // ---------------------------------------------------------------------------
  if (!webglOK()) {
    const fb = document.createElement("div");
    fb.style.cssText = `position:absolute;inset:0;background:
      radial-gradient(120% 120% at 50% 44%, ${C.deep}66 0%, ${C.void} 60%),
      radial-gradient(circle at 50% 50%, ${C.royal}22 0%, transparent 46%),
      ${C.void};`;
    const orb = document.createElement("div");
    orb.style.cssText = `position:absolute;left:50%;top:50%;width:54%;padding-bottom:54%;
      transform:translate(-50%,-50%);border-radius:50%;
      background:radial-gradient(circle at 38% 32%, ${C.ink} 0%, ${C.void} 70%);
      box-shadow:0 0 0 2px ${C.royal}55, 0 0 60px ${C.lilacA}44, inset 0 0 60px ${C.deep}aa;`;
    fb.appendChild(orb);
    container.appendChild(fb);
    return {
      replay() {},
      pause() {},
      resume() {},
      setReducedMotion() {},
      destroy() {
        fb.remove();
      },
    };
  }

  // ---------------------------------------------------------------------------
  //  THREE setup
  // ---------------------------------------------------------------------------
  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 100);
  const CAM_Z = 7.2;
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, 0);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      // internal QA hook only: lets a headless probe read the backbuffer.
      preserveDrawingBuffer: !!opts.__preserveBuffer,
    });
  } catch (e) {
    const fb = document.createElement("div");
    fb.style.cssText = `position:absolute;inset:0;background:radial-gradient(120% 120% at 50% 44%, ${C.deep}66 0%, ${C.void} 60%), ${C.void};`;
    container.appendChild(fb);
    return {
      replay() {}, pause() {}, resume() {}, setReducedMotion() {},
      destroy() { fb.remove(); },
    };
  }

  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  renderer.setPixelRatio(DPR);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  const canvas = renderer.domElement;
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;";

  // void backdrop with violet undertone + vignette (behind canvas)
  const backdrop = document.createElement("div");
  backdrop.style.cssText = `position:absolute;inset:0;background:
    radial-gradient(130% 130% at 50% 46%, ${C.deep}40 0%, ${C.void} 58%),
    radial-gradient(70% 70% at 50% 50%, ${C.royal}1f 0%, transparent 60%),
    ${C.void};`;
  container.appendChild(backdrop);
  container.appendChild(canvas);

  // grain + vignette overlay (procedural, on top)
  const overlay = document.createElement("canvas");
  overlay.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:soft-light;opacity:.5;";
  container.appendChild(overlay);

  // film-grain tile (small, generated once)
  const grain = document.createElement("canvas");
  grain.width = grain.height = 128;
  {
    const g = grain.getContext("2d");
    const id = g.createImageData(128, 128);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = 110 + Math.random() * 90;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
  }

  function paintOverlay() {
    overlay.width = Math.round(W * DPR);
    overlay.height = Math.round(H * DPR);
    const o = overlay.getContext("2d");
    o.clearRect(0, 0, overlay.width, overlay.height);
    const pat = o.createPattern(grain, "repeat");
    o.globalAlpha = 0.06;
    o.fillStyle = pat;
    o.fillRect(0, 0, overlay.width, overlay.height);
    o.globalAlpha = 1;
    const r = Math.max(overlay.width, overlay.height) * 0.72;
    const vg = o.createRadialGradient(
      overlay.width / 2, overlay.height * 0.48, r * 0.28,
      overlay.width / 2, overlay.height * 0.48, r
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(3,2,8,0.92)");
    o.fillStyle = vg;
    o.fillRect(0, 0, overlay.width, overlay.height);
  }
  paintOverlay();

  // ---------------------------------------------------------------------------
  //  RENDER TARGET + COMPOSITE POST PASS (toolkit item #1)
  //  Scene renders into an FBO; a fullscreen triangle does bright-pass bloom +
  //  barrel + velocity-coupled chromatic aberration + exposure dip.
  // ---------------------------------------------------------------------------
  function rtSize() {
    return {
      w: Math.max(2, Math.round(W * DPR)),
      h: Math.max(2, Math.round(H * DPR)),
    };
  }
  let { w: RTW, h: RTH } = rtSize();
  const sceneRT = new THREE.WebGLRenderTarget(RTW, RTH, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  });

  // post scene: a single oversized triangle covering the screen (no quad seams)
  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
  );
  triGeo.setAttribute(
    "uv",
    new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2)
  );

  const postMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    transparent: true,
    uniforms: {
      uTex: { value: sceneRT.texture },
      uTexel: { value: new THREE.Vector2(1 / RTW, 1 / RTH) },
      uAberr: { value: 0.0 },      // velocity-coupled chromatic aberration
      uExposure: { value: 1.0 },   // dips on landing anticipation
      uBloom: { value: 1.0 },      // bloom gain (peaks on the magenta climax)
      uThresh: { value: 0.72 },    // bright-pass luma threshold
      uBarrel: { value: 0.06 },    // subtle barrel warp
      uVignette: { value: 0.0 },   // shadow crush around the climax point (screen-space)
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTex;
      uniform vec2 uTexel;
      uniform float uAberr;
      uniform float uExposure;
      uniform float uBloom;
      uniform float uThresh;
      uniform float uBarrel;
      uniform float uVignette;

      float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

      // bright-pass: keep only highlights above threshold, soft knee
      vec3 bright(vec3 c){
        float l = luma(c);
        float k = smoothstep(uThresh, uThresh + 0.22, l);
        return c * k;
      }

      void main(){
        // subtle barrel warp toward center (premium lens curvature)
        vec2 cc = vUv - 0.5;
        float r2 = dot(cc, cc);
        vec2 uv = vUv + cc * r2 * uBarrel;

        // velocity-coupled chromatic aberration — strongest at the rim
        vec2 dir = uv - 0.5;
        float rimAmt = smoothstep(0.05, 0.6, length(dir));
        vec2 ab = normalize(dir + 1e-5) * uAberr * (0.35 + rimAmt);
        // sample the SCENE FBO as a full vec4 so coverage alpha is available
        vec4  scene = texture2D(uTex, uv);
        float cr = texture2D(uTex, uv + ab).r;
        float cb = texture2D(uTex, uv - ab).b;
        vec3 base = vec3(cr, scene.g, cb);

        // cheap 5-tap separable gaussian on the bright-pass (true selective bloom)
        vec3 bl = vec3(0.0);
        // horizontal
        bl += bright(texture2D(uTex, uv + vec2(-2.0,0.0)*uTexel*2.0).rgb) * 0.12;
        bl += bright(texture2D(uTex, uv + vec2(-1.0,0.0)*uTexel*2.0).rgb) * 0.20;
        bl += bright(texture2D(uTex, uv).rgb)                              * 0.36;
        bl += bright(texture2D(uTex, uv + vec2( 1.0,0.0)*uTexel*2.0).rgb) * 0.20;
        bl += bright(texture2D(uTex, uv + vec2( 2.0,0.0)*uTexel*2.0).rgb) * 0.12;
        // vertical
        vec3 bv = vec3(0.0);
        bv += bright(texture2D(uTex, uv + vec2(0.0,-2.0)*uTexel*2.0).rgb) * 0.12;
        bv += bright(texture2D(uTex, uv + vec2(0.0,-1.0)*uTexel*2.0).rgb) * 0.20;
        bv += bright(texture2D(uTex, uv).rgb)                              * 0.36;
        bv += bright(texture2D(uTex, uv + vec2(0.0, 1.0)*uTexel*2.0).rgb) * 0.20;
        bv += bright(texture2D(uTex, uv + vec2(0.0, 2.0)*uTexel*2.0).rgb) * 0.12;
        vec3 bloom = (bl + bv) * 0.5;

        vec3 col = base + bloom * (0.9 * uBloom);

        // exposure (the world inhale on anticipation) then a soft filmic shoulder
        col *= uExposure;
        col = col / (1.0 + col * 0.22);

        // climax shadow-crush vignette (screen space, deepens near edges)
        float vig = 1.0 - uVignette * smoothstep(0.18, 0.95, r2 * 2.0);
        col *= vig;

        // Alpha: keep the geometry's true coverage (so the dark orb stays opaque
        // over the void backdrop) and let bloom add extra glow alpha at the rim
        // so the additive halo isn't clipped flat against transparent pixels.
        float bloomA = clamp(luma(bloom) * 4.0, 0.0, 1.0);
        float a = clamp(max(scene.a, bloomA), 0.0, 1.0);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const postTri = new THREE.Mesh(triGeo, postMat);
  postTri.frustumCulled = false;
  postScene.add(postTri);

  function resizeRT() {
    const s = rtSize();
    RTW = s.w; RTH = s.h;
    sceneRT.setSize(RTW, RTH);
    postMat.uniforms.uTexel.value.set(1 / RTW, 1 / RTH);
  }

  // ---------------------------------------------------------------------------
  //  GLOBE GROUP (everything that tilts lives here)
  // ---------------------------------------------------------------------------
  const RADIUS = 2.0;
  const globe = new THREE.Group();
  scene.add(globe);

  const segLat = lite() ? 40 : 64; // denser so the surface wave displaces smoothly
  const segLon = lite() ? 56 : 96;

  // --- surface-wave uniforms shared into the core via onBeforeCompile --------
  // up to 2 simultaneous ripple centers (the staggered wake)
  const MAX_RIPPLE = 2;
  const rippleCenters = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)];
  const rippleRadius = new Float32Array(MAX_RIPPLE);   // current geodesic radius (0..PI)
  const rippleStrength = new Float32Array(MAX_RIPPLE); // current displacement strength
  const uRippleCenters = { value: rippleCenters };
  const uRippleRadius = { value: rippleRadius };
  const uRippleStrength = { value: rippleStrength };

  // --- 1. solid dark sphere with shader surface-wave displacement ------------
  const coreGeo = new THREE.SphereGeometry(RADIUS * 0.985, segLon, segLat);
  const coreMat = new THREE.MeshStandardMaterial({
    color: c3(C.ink),
    roughness: 0.6,
    metalness: 0.2,
    emissive: c3(C.deep),
    emissiveIntensity: 0.16,
  });
  coreMat.onBeforeCompile = (sh) => {
    sh.uniforms.uRippleCenters = uRippleCenters;
    sh.uniforms.uRippleRadius = uRippleRadius;
    sh.uniforms.uRippleStrength = uRippleStrength;
    sh.uniforms.uCoreR = { value: RADIUS * 0.985 };
    sh.vertexShader =
      `
      uniform vec3  uRippleCenters[${MAX_RIPPLE}];
      uniform float uRippleRadius[${MAX_RIPPLE}];
      uniform float uRippleStrength[${MAX_RIPPLE}];
      uniform float uCoreR;
      varying float vBulge;
      ` +
      sh.vertexShader.replace(
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        vec3 dirN = normalize(position);
        float bulge = 0.0;
        for (int i = 0; i < ${MAX_RIPPLE}; i++){
          float str = uRippleStrength[i];
          if (str <= 0.0001) continue;
          // geodesic distance on the unit sphere from the landing center
          float gd = acos(clamp(dot(dirN, normalize(uRippleCenters[i])), -1.0, 1.0));
          float band = gd - uRippleRadius[i];
          // a travelling crest: a narrow gaussian wake at the wave radius
          float w = exp(-band * band * 42.0);
          bulge += w * str;
        }
        // the dark sphere itself bulges ~0.02R along its normal as the wave crosses
        transformed += dirN * bulge * (uCoreR * 0.10);
        vBulge = bulge;
      `
      );
    // a faint royal lift on the crest so the bulge reads (and the bloom can catch it)
    sh.fragmentShader =
      `varying float vBulge;\n` +
      sh.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         totalEmissiveRadiance += vec3(0.36, 0.20, 0.62) * clamp(vBulge, 0.0, 1.0) * 1.4;`
      );
    coreMat.userData.shader = sh;
  };
  const core = new THREE.Mesh(coreGeo, coreMat);
  globe.add(core);

  // --- 2. gradient-hairline cage (latitude/longitude lines, fresnel-lit) -----
  // Built as additive line segments; per-fragment alpha follows dot(N,V) so the
  // cage is crisp on the silhouette and fades to near-nothing face-on.
  const cageGeo = buildCageGeometry(RADIUS * 1.002, lite() ? 9 : 13, lite() ? 14 : 20);
  const cageMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
      uColorA: { value: c3(C.royal) },
      uColorB: { value: c3(C.lilacA) },
      uOpacity: { value: 0.0 },
      uPower: { value: 1.6 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vView;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN; varying vec3 vView;
      uniform vec3 uColorA; uniform vec3 uColorB;
      uniform float uOpacity; uniform float uPower;
      void main(){
        // fresnel: ~0 face-on, ~1 at silhouette
        float fres = pow(1.0 - abs(dot(vN, vView)), uPower);
        // gradient hairline: royal core lifting to lilac on the rim
        vec3 col = mix(uColorA, uColorB, fres);
        float a = (0.10 + 0.90 * fres) * uOpacity;
        gl_FragColor = vec4(col, a);
      }`,
  });
  // normals point radially outward so dot(N,V) is a clean fresnel for the cage
  const cage = new THREE.LineSegments(cageGeo, cageMat);
  cage.frustumCulled = false;
  globe.add(cage);

  // --- 3. thick lilac fresnel rim (back-side shell, additive) ---------------
  const fresnelMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      uInner: { value: c3(C.lilacA) },
      uOuter: { value: c3(C.lilacC) },
      uPower: { value: 3.0 },
      uIntensity: { value: 0.0 }, // animated in on entrance, spikes on landing
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vView;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN; varying vec3 vView;
      uniform vec3 uInner; uniform vec3 uOuter;
      uniform float uPower; uniform float uIntensity;
      void main(){
        float f = pow(1.0 - abs(dot(vN, vView)), uPower);
        vec3 col = mix(uInner, uOuter, f);
        gl_FragColor = vec4(col, f * uIntensity);
      }`,
  });
  const fresnelGeo = new THREE.SphereGeometry(RADIUS * 1.13, lite() ? 36 : 48, lite() ? 28 : 36);
  const fresnel = new THREE.Mesh(fresnelGeo, fresnelMat);
  globe.add(fresnel);

  // --- 4. equator hairline (subtle structure) -------------------------------
  const ringGeo = new THREE.RingGeometry(RADIUS * 1.004, RADIUS * 1.012, 128);
  const equatorMat = new THREE.MeshBasicMaterial({
    color: c3(C.lilacA),
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const equator = new THREE.Mesh(ringGeo, equatorMat);
  equator.rotation.x = Math.PI / 2;
  globe.add(equator);

  // ---------------------------------------------------------------------------
  //  CITY MARKERS (instanced)
  // ---------------------------------------------------------------------------
  const nodeCount = lite() ? 9 : 14;
  const nodes = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < nodeCount; i++) {
    const yy = Math.max(-0.78, Math.min(0.82, 1 - (i + 0.5) / nodeCount * 1.6));
    const rad = Math.sqrt(Math.max(0, 1 - yy * yy));
    const theta = ga * i;
    const p = new THREE.Vector3(
      Math.cos(theta) * rad,
      yy,
      Math.sin(theta) * rad
    ).normalize().multiplyScalar(RADIUS * 1.005);
    nodes.push(p);
  }
  // unit normals at each node (reused for ripple centers / tangent placement)
  const nodeN = nodes.map((p) => p.clone().normalize());

  const markerGeo = new THREE.SphereGeometry(small() ? 0.045 : 0.052, 12, 12);
  // V2: resting marker color is lilac (white is reserved for the landing flash).
  const markerMat = new THREE.MeshBasicMaterial({
    color: c3(C.lilacC),
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const markers = new THREE.InstancedMesh(markerGeo, markerMat, nodeCount);
  markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // per-instance color so a landing marker can flash to true white individually
  markers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nodeCount * 3), 3);
  const _restCol = c3(C.lilacC);
  const tmpObj = new THREE.Object3D();
  const markerPulse = new Float32Array(nodeCount); // 0..1 flare on landing
  for (let i = 0; i < nodeCount; i++) {
    tmpObj.position.copy(nodes[i]);
    tmpObj.scale.setScalar(1);
    tmpObj.updateMatrix();
    markers.setMatrixAt(i, tmpObj.matrix);
    markers.setColorAt(i, _restCol);
  }
  markers.instanceMatrix.needsUpdate = true;
  markers.instanceColor.needsUpdate = true;
  globe.add(markers);

  // soft halo behind each marker (instanced, additive)
  const haloGeo = new THREE.SphereGeometry(small() ? 0.11 : 0.13, 10, 10);
  const haloMat = new THREE.MeshBasicMaterial({
    color: c3(C.lilacA),
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halos = new THREE.InstancedMesh(haloGeo, haloMat, nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    tmpObj.position.copy(nodes[i]);
    tmpObj.scale.setScalar(1);
    tmpObj.updateMatrix();
    halos.setMatrixAt(i, tmpObj.matrix);
  }
  globe.add(halos);

  // ---------------------------------------------------------------------------
  //  ARC POOL — great-circle bezier curves that fire between nodes
  // ---------------------------------------------------------------------------
  const ARC_POOL = lite() ? 4 : 6;
  const ARC_SEG = 48;
  const arcs = [];

  function arcColor(hot) {
    return hot ? c3(C.flare) : c3(C.lilacA);
  }

  for (let i = 0; i < ARC_POOL; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array((ARC_SEG + 1) * 3), 3)
    );
    const mat = new THREE.LineBasicMaterial({
      color: c3(C.lilacA),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    globe.add(line);
    arcs.push({
      line, geo, mat,
      active: false,
      t: 0, from: 0, to: 0,
      ctrl: new THREE.Vector3(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      hot: false, speed: 1,
      landed: false,
    });
  }

  const _v0 = new THREE.Vector3();
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const tmpCol = new THREE.Color(); // scratch for per-instance marker color

  function spawnArc(hot, fromIdx, toIdx) {
    const slot = arcs.find((a) => !a.active);
    if (!slot) return null;
    let from = fromIdx != null ? fromIdx : (Math.random() * nodeCount) | 0;
    let to = toIdx != null ? toIdx : (Math.random() * nodeCount) | 0;
    let guard = 0;
    while (to === from && guard++ < 8) to = (Math.random() * nodeCount) | 0;
    slot.a.copy(nodes[from]);
    slot.b.copy(nodes[to]);
    const mid = _v0.copy(slot.a).add(slot.b).multiplyScalar(0.5);
    const lift = 1.0 + slot.a.distanceTo(slot.b) * 0.22;
    slot.ctrl.copy(mid).normalize().multiplyScalar(RADIUS * lift);
    slot.from = from;
    slot.to = to;
    slot.active = true;
    slot.landed = false;
    slot.t = 0;
    slot.hot = !!hot;
    slot.speed = 0.55 + Math.random() * 0.35;
    slot.mat.color.copy(arcColor(hot));
    slot.mat.opacity = 0;
    return slot;
  }

  // quadratic bezier comet: fills positions up to head fraction `t` with a tail
  function updateArcGeometry(slot) {
    const pos = slot.geo.attributes.position.array;
    const head = slot.t;
    const tailLen = 0.42;
    const start = Math.max(0, head - tailLen);
    for (let i = 0; i <= ARC_SEG; i++) {
      const f = start + (head - start) * (i / ARC_SEG);
      const u = 1 - f;
      _v1
        .copy(slot.a).multiplyScalar(u * u)
        .add(_v2.copy(slot.ctrl).multiplyScalar(2 * u * f))
        .add(_v0.copy(slot.b).multiplyScalar(f * f));
      pos[i * 3] = _v1.x;
      pos[i * 3 + 1] = _v1.y;
      pos[i * 3 + 2] = _v1.z;
    }
    slot.geo.attributes.position.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  //  RIPPLE RING POOL — shader-driven annulus band, geodesically anchored.
  //  Each ring's alpha is a thin animated band in the frag (not a flat decal),
  //  and EACH active ring also writes a surface-wave displacement into the core.
  // ---------------------------------------------------------------------------
  const RING_POOL = lite() ? 4 : 6;
  const rings = [];
  for (let i = 0; i < RING_POOL; i++) {
    // a large flat disc sitting tangent to the surface; the shader carves a band
    const geo = new THREE.CircleGeometry(1.0, 96);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: c3(C.lilacC) },
        uRadius: { value: 0.0 },   // band center (0..1 of disc radius)
        uWidth: { value: 0.08 },   // band thickness
        uOpacity: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main(){
          vP = position.xy; // disc local coords, radius 1
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vP;
        uniform vec3 uColor;
        uniform float uRadius; uniform float uWidth; uniform float uOpacity;
        void main(){
          float d = length(vP);
          // thin annulus band centered on uRadius
          float band = smoothstep(uWidth, 0.0, abs(d - uRadius));
          // a faint inner fill trailing behind the crest for a wake glow
          float fill = smoothstep(uRadius, uRadius - 0.5, d) * 0.12;
          float a = (band + fill) * uOpacity;
          // fade the outermost edge so the disc boundary never shows
          a *= smoothstep(1.0, 0.86, d);
          gl_FragColor = vec4(uColor * (0.6 + band), a);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    globe.add(mesh);
    rings.push({
      mesh, mat, geo,
      active: false, t: 0, hot: false,
      idx: 0, maxScale: 1, dur: 1, slotRipple: -1,
    });
  }

  const _q = new THREE.Quaternion();
  const _up = new THREE.Vector3(0, 0, 1);

  // spawn a single ring anchored to node `idx`, optionally writing into ripple slot
  function spawnRing(idx, hot, opts2) {
    const slot = rings.find((r) => !r.active);
    if (!slot) return null;
    const o = opts2 || {};
    slot.active = true;
    slot.t = 0;
    slot.hot = !!hot;
    slot.idx = idx;
    slot.maxScale = o.maxScale != null ? o.maxScale : (lite() ? 2.2 : 2.9);
    slot.dur = o.dur != null ? o.dur : 1.0;
    slot.mat.uniforms.uColor.value.copy(hot ? c3(C.flare) : c3(C.lilacC));
    slot.mat.uniforms.uWidth.value = o.width != null ? o.width : 0.085;
    // geodesically anchor: tangent to sphere at the node normal, lifted just above
    const n = nodeN[idx];
    slot.mesh.position.copy(n).multiplyScalar(RADIUS * 1.012);
    _q.setFromUnitVectors(_up, n);
    slot.mesh.quaternion.copy(_q);
    slot.mesh.visible = true;
    // assign a free ripple slot for the surface displacement (if requested)
    slot.slotRipple = -1;
    if (o.ripple) {
      for (let s = 0; s < MAX_RIPPLE; s++) {
        if (rippleStrength[s] <= 0.0001) { slot.slotRipple = s; break; }
      }
      if (slot.slotRipple >= 0) {
        rippleCenters[slot.slotRipple].copy(n);
        rippleRadius[slot.slotRipple] = 0;
        rippleStrength[slot.slotRipple] = o.rippleStrength != null ? o.rippleStrength : 1.0;
      }
    }
    return slot;
  }

  // The SIGNATURE landing: anticipation has already started in the arc loop.
  // Fire the primary ring (with surface displacement) + a wake ring 80ms behind,
  // pop the marker to white, and spike the fresnel. Magenta drives all to peak.
  function fireLanding(idx, hot) {
    const peak = hot ? 1.0 : 0.0;
    // primary ripple ring with surface displacement
    spawnRing(idx, hot, {
      ripple: true,
      rippleStrength: hot ? 1.0 : 0.62,
      maxScale: hot ? (lite() ? 2.7 : 3.5) : (lite() ? 2.2 : 2.9),
      width: hot ? 0.10 : 0.085,
      dur: hot ? 1.25 : 1.0,
    });
    // staggered wake ring 80ms behind (queued)
    landingQueue.push({
      at: clock + 0.08,
      idx,
      hot,
      opts: {
        ripple: true,
        rippleStrength: hot ? 0.7 : 0.4,
        maxScale: hot ? (lite() ? 2.4 : 3.1) : (lite() ? 1.9 : 2.5),
        width: 0.06,
        dur: hot ? 1.15 : 0.92,
      },
    });
    // marker pulse (1-frame haptic overshoot is applied where pulse drives scale)
    markerPulse[idx] = hot ? 1.25 : 1.0;
    // payoff: spike the fresnel rim
    fresnelSpike = hot ? 1.4 : 1.05;
    // payoff: bloom + (for magenta) climax exposure & shadow crush
    bloomSpike = hot ? 2.0 : 1.0;
    if (hot) {
      climaxT = 1.0; // drives composite peak (exposure bump, vignette crush)
    }
  }

  // a tiny scheduler so the wake ring can land 80ms after the primary
  const landingQueue = [];

  // ---------------------------------------------------------------------------
  //  LIGHTS
  // ---------------------------------------------------------------------------
  const key = new THREE.DirectionalLight(c3(C.lilacC), 1.1);
  key.position.set(-3, 2.5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(c3(C.royal), 0.9);
  rim.position.set(4, -1, -2);
  scene.add(rim);
  const ambient = new THREE.AmbientLight(c3(C.deep), 0.55);
  scene.add(ambient);

  // ---------------------------------------------------------------------------
  //  STARFIELD — 2 parallax z-layers fading to atmosphere (depth)
  // ---------------------------------------------------------------------------
  function makeStarLayer(count, rMin, rMax, size, opacity, color) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const rr = rMin + Math.random() * (rMax - rMin);
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = rr * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = rr * Math.sin(ph) * Math.sin(th);
      pos[i * 3 + 2] = rr * Math.cos(ph) - 4;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: c3(color),
      size,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    return { pts, geo, mat, opacity };
  }
  // near layer: bigger, brighter, more parallax; far layer: tiny, dim, atmospheric
  const starNear = makeStarLayer(lite() ? 36 : 70, 7.5, 10.5, 0.06, 0.55, C.lilacC);
  const starFar = makeStarLayer(lite() ? 50 : 100, 11, 16, 0.03, 0.28, C.deep);

  // ---------------------------------------------------------------------------
  //  INTERACTION — tilt with inertia (drag + hover) + camera micro-parallax
  // ---------------------------------------------------------------------------
  let targetRX = 0.18, targetRY = 0;
  let curRX = 0.18, curRY = 0;
  let velRX = 0, velRY = 0;
  let dragging = false;
  let lastPX = 0, lastPY = 0;
  let pointerInside = false;
  let userClicked = false; // first deliberate click guarantees the magenta if unspent

  function setTargetsFromPointer(clientX, clientY) {
    const r = container.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = ((clientY - r.top) / r.height) * 2 - 1;
    targetRY = nx * 0.9;
    targetRX = 0.18 + ny * 0.6;
  }

  function onPointerMove(e) {
    if (reducedMotion) return;
    pointerInside = true;
    if (dragging) {
      const dx = e.clientX - lastPX;
      const dy = e.clientY - lastPY;
      targetRY += dx * 0.006;
      targetRX += dy * 0.006;
      targetRX = Math.max(-1.2, Math.min(1.2, targetRX));
      velRY = dx * 0.0009;
      velRX = dy * 0.0009;
      lastPX = e.clientX;
      lastPY = e.clientY;
    } else {
      setTargetsFromPointer(e.clientX, e.clientY);
    }
  }
  function onPointerDown(e) {
    if (reducedMotion) return;
    dragging = true;
    lastPX = e.clientX;
    lastPY = e.clientY;
    canvas.style.cursor = "grabbing";
    try { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onPointerUp() {
    dragging = false;
    canvas.style.cursor = "grab";
  }
  function onPointerLeave() {
    pointerInside = false;
    dragging = false;
    canvas.style.cursor = "grab";
    targetRX = 0.18;
    targetRY = curRY;
  }

  // ---- the single earned magenta is DETERMINISTIC -------------------------
  let flareUsed = false;
  function fireMagentaArc(fromIdx, toIdx) {
    if (flareUsed) return false;
    const slot = spawnArc(true, fromIdx, toIdx);
    if (!slot) return false;
    flareUsed = true;
    return true;
  }

  // click -> a guaranteed arc. First deliberate click spends the magenta (if unspent).
  function onClick(e) {
    if (reducedMotion) return;
    // pick the node nearest the click so the arc feels caused by the cursor
    const nearestTo = pickNearestNode(e.clientX, e.clientY);
    if (!userClicked && !flareUsed) {
      userClicked = true;
      if (!fireMagentaArc(null, nearestTo)) spawnArc(false, null, nearestTo);
    } else {
      spawnArc(false, null, nearestTo);
    }
  }

  // project nodes to screen and find the closest to the pointer
  const _proj = new THREE.Vector3();
  function pickNearestNode(clientX, clientY) {
    const r = container.getBoundingClientRect();
    const px = clientX - r.left;
    const py = clientY - r.top;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < nodeCount; i++) {
      _proj.copy(nodes[i]).applyMatrix4(globe.matrixWorld).project(camera);
      const sx = (_proj.x * 0.5 + 0.5) * W;
      const sy = (-_proj.y * 0.5 + 0.5) * H;
      const d = (sx - px) * (sx - px) + (sy - py) * (sy - py);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best < 0 ? 0 : best;
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("click", onClick);

  // ---------------------------------------------------------------------------
  //  CUSTOM EASINGS
  // ---------------------------------------------------------------------------
  const easeExpoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const easePow4Out = (t) => 1 - Math.pow(1 - t, 4);
  const easeBackOut = (t) => {
    const s = 1.70158;
    const p = t - 1;
    return p * p * ((s + 1) * p + s) + 1;
  };

  // ---------------------------------------------------------------------------
  //  STATE: entrance / anticipation / payoff
  // ---------------------------------------------------------------------------
  let entranceT = 0;
  const ENTRANCE_DUR = 1.05;
  let entranceDone = false;

  // payoff/anticipation accumulators (smoothed toward rest each frame)
  let fresnelSpike = 0;   // extra fresnel intensity added on landing payoff
  let bloomSpike = 0;     // extra bloom gain on landing
  let climaxT = 0;        // 1 -> 0 envelope for the magenta climax
  let inhale = 0;         // 0..1 anticipation dim envelope (per pending landing)

  // anticipation scheduler: when an arc nears landing we begin the inhale
  // (tracked per active arc via a.t crossing a threshold)

  function applyEntrance(p) {
    const s = 0.6 + easeBackOut(Math.min(1, p / 0.85)) * 0.4;
    globe.scale.setScalar(s);
    const fade = easeExpoOut(Math.min(1, p / 0.7));
    cageMat.uniforms.uOpacity.value = 0.85 * fade;
    fresnelMat.uniforms.uIntensity.value = 0.9 * fade;
    coreMat.emissiveIntensity = 0.16 * fade;
    equatorMat.opacity = 0.12 * fade;
    const mFade = easePow4Out(Math.min(1, Math.max(0, (p - 0.4) / 0.6)));
    markerMat.opacity = 0.9 * mFade;
    haloMat.opacity = 0.16 * mFade;
    starNear.mat.opacity = starNear.opacity * fade;
    starFar.mat.opacity = starFar.opacity * fade;
  }

  function snapStaticFrame() {
    entranceT = 1;
    entranceDone = true;
    applyEntrance(1);
    globe.scale.setScalar(1);
    curRX = targetRX = 0.2;
    curRY = targetRY = -0.5;
    globe.rotation.x = curRX;
    globe.rotation.y = curRY;
    globe.updateMatrixWorld(true);

    if (reducedMotion) {
      // one elegant static arc + a settled ring + a single white-flashed marker
      const fromI = 2 % nodeCount, toI = 7 % nodeCount;
      const slot = arcs[0];
      if (slot) {
        slot.a.copy(nodes[fromI]);
        slot.b.copy(nodes[toI]);
        const mid = _v0.copy(slot.a).add(slot.b).multiplyScalar(0.5);
        const lift = 1.0 + slot.a.distanceTo(slot.b) * 0.22;
        slot.ctrl.copy(mid).normalize().multiplyScalar(RADIUS * lift);
        slot.active = false;
        slot.t = 1;
        const pos = slot.geo.attributes.position.array;
        for (let i = 0; i <= ARC_SEG; i++) {
          const f = i / ARC_SEG;
          const u = 1 - f;
          _v1.copy(slot.a).multiplyScalar(u * u)
            .add(_v2.copy(slot.ctrl).multiplyScalar(2 * u * f))
            .add(_v0.copy(slot.b).multiplyScalar(f * f));
          pos[i * 3] = _v1.x; pos[i * 3 + 1] = _v1.y; pos[i * 3 + 2] = _v1.z;
        }
        slot.geo.attributes.position.needsUpdate = true;
        slot.mat.opacity = 0.85;
        slot.mat.color.copy(c3(C.lilacA));
      }
      // a soft settled ring at the destination
      const rslot = rings[0];
      if (rslot) {
        const n = nodeN[toI];
        rslot.mesh.position.copy(n).multiplyScalar(RADIUS * 1.012);
        _q.setFromUnitVectors(_up, n);
        rslot.mesh.quaternion.copy(_q);
        rslot.mesh.scale.setScalar(lite() ? 1.6 : 2.0);
        rslot.mat.uniforms.uRadius.value = 0.55;
        rslot.mat.uniforms.uWidth.value = 0.09;
        rslot.mat.uniforms.uOpacity.value = 0.6;
        rslot.mat.uniforms.uColor.value.copy(c3(C.lilacC));
        rslot.mesh.visible = true;
        rslot.active = false;
      }
      // flash the destination marker to white in the static composition
      markerPulse[toI] = 0.7;
      markers.setColorAt(toI, c3(C.white));
      markers.instanceColor.needsUpdate = true;
      // a gentle resting surface bulge at the landing point
      rippleCenters[0].copy(nodeN[toI]);
      rippleRadius[0] = 0.32;
      rippleStrength[0] = 0.4;
      // update marker scale for the static pulse
      tmpObj.position.copy(nodes[toI]);
      tmpObj.scale.setScalar(1 + markerPulse[toI] * 1.6);
      tmpObj.updateMatrix();
      markers.setMatrixAt(toI, tmpObj.matrix);
      tmpObj.scale.setScalar(1 + markerPulse[toI] * 2.4);
      tmpObj.updateMatrix();
      halos.setMatrixAt(toI, tmpObj.matrix);
      markers.instanceMatrix.needsUpdate = true;
      halos.instanceMatrix.needsUpdate = true;
      fresnelMat.uniforms.uIntensity.value = 1.05;
    }
    renderToScreen();
  }

  // ---------------------------------------------------------------------------
  //  RENDER (two-pass: scene -> FBO, composite -> screen)
  // ---------------------------------------------------------------------------
  function renderToScreen() {
    // pass 1: full scene into the half-float FBO
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene, camera);
    // pass 2: hand-rolled composite (bright-pass bloom + barrel + aberration) to screen
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(postScene, postCam);
  }

  // ---------------------------------------------------------------------------
  //  MAIN LOOP
  // ---------------------------------------------------------------------------
  let raf = 0;
  let running = false;
  let last = 0;
  let nextArcAt = 0;
  let clock = 0;
  let heroMagentaAt = 0; // scheduled deterministic magenta hero arc

  let revealTimer = setTimeout(() => {
    if (!entranceDone && !running) {
      try { snapStaticFrame(); } catch (_) {}
    }
  }, 3200);

  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (!last) last = now;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    step(dt);
  }

  // The full per-frame advance, parameterised by dt so it can be driven either
  // by rAF (tick) or, in headless QA, by an explicit synthetic dt (__step).
  function step(dt) {
    clock += dt;

    // --- entrance ---
    if (!entranceDone) {
      entranceT += dt / ENTRANCE_DUR;
      if (entranceT >= 1) {
        entranceT = 1;
        entranceDone = true;
        applyEntrance(1);
        globe.scale.setScalar(1);
        nextArcAt = clock + 0.3;
        // schedule the one earned magenta a few seconds after entrance settles
        heroMagentaAt = clock + 3.2 + Math.random() * 1.6;
      } else {
        applyEntrance(entranceT);
      }
    }

    // --- tilt inertia ---
    if (!dragging) {
      if (!pointerInside) targetRY += dt * 0.12;
      targetRY += velRY;
      targetRX += velRX;
      velRY *= 0.92;
      velRX *= 0.92;
      targetRX = Math.max(-1.1, Math.min(1.1, targetRX));
    }
    const k = 1 - Math.pow(0.0016, dt);
    curRX += (targetRX - curRX) * k;
    curRY += (targetRY - curRY) * k;
    globe.rotation.x = curRX;
    globe.rotation.y = curRY;

    // --- camera micro-parallax (volume, not just spin) ---
    camera.position.x += (curRY * 0.5 - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += (-curRX * 0.4 - camera.position.y) * Math.min(1, dt * 6);
    camera.lookAt(0, 0, 0);

    // --- starfield parallax: two layers, differing factors, atmospheric ---
    starNear.pts.rotation.y = curRY * 0.16;
    starNear.pts.rotation.x = curRX * 0.16;
    starFar.pts.rotation.y = curRY * 0.06;
    starFar.pts.rotation.x = curRX * 0.06;

    // --- ambient arc scheduler ---
    if (entranceDone && clock > nextArcAt) {
      spawnArc(false);
      nextArcAt = clock + 1.1 + Math.random() * 1.6;
    }
    // --- deterministic magenta hero arc (fires once) ---
    if (entranceDone && !flareUsed && heroMagentaAt > 0 && clock > heroMagentaAt) {
      fireMagentaArc();
      heroMagentaAt = 0;
    }

    // --- anticipation: detect arcs nearing landing -> begin world inhale ---
    let wantInhale = 0;
    for (let i = 0; i < arcs.length; i++) {
      const a = arcs[i];
      if (!a.active || a.landed) continue;
      // last ~12% of the flight = the ~90ms inhale window
      if (a.t > 0.88) {
        const w = (a.t - 0.88) / 0.12; // 0..1
        wantInhale = Math.max(wantInhale, w * (a.hot ? 1.0 : 0.85));
      }
    }
    inhale += (wantInhale - inhale) * Math.min(1, dt * 18);

    // --- process the wake-ring queue (80ms staggered) ---
    for (let i = landingQueue.length - 1; i >= 0; i--) {
      if (clock >= landingQueue[i].at) {
        const q = landingQueue[i];
        spawnRing(q.idx, q.hot, q.opts);
        landingQueue.splice(i, 1);
      }
    }

    // --- arcs ---
    for (let i = 0; i < arcs.length; i++) {
      const a = arcs[i];
      if (!a.active) continue;
      a.t += dt * a.speed;
      if (a.t >= 1) {
        a.t = 1;
        a.landed = true;
        // SIGNATURE landing — fire the surface-wave ripple + wake + marker pop
        fireLanding(a.to, a.hot);
        a.active = false;
        a.mat.opacity = 0;
        continue;
      }
      updateArcGeometry(a);
      // opacity rises fast, the comet head keeps it bright; departure feels snappy
      // and the head decelerates into the node via the expo-eased fade tail.
      const op = Math.min(1, a.t * 4) * (1 - a.t * 0.25) * (0.4 + 0.6 * easeExpoOut(a.t));
      a.mat.opacity = (a.hot ? 0.98 : 0.8) * op;
    }

    // --- rings (signature ripple, shader band + back-ease overshoot) ---
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      if (!r.active) continue;
      r.t += dt * (1.35 / r.dur);
      if (r.t >= 1) {
        r.t = 0;
        r.active = false;
        r.mesh.visible = false;
        r.mat.uniforms.uOpacity.value = 0;
        if (r.slotRipple >= 0) {
          rippleStrength[r.slotRipple] = 0;
          r.slotRipple = -1;
        }
        continue;
      }
      // scale of the disc grows with a back-ease so the band OVERSHOOTS then settles
      const eb = easeBackOut(Math.min(1, r.t * 1.05));
      const scl = 0.25 + eb * r.maxScale;
      r.mesh.scale.setScalar(scl);
      // the band travels outward across the disc with easePow4Out
      const e = easePow4Out(r.t);
      r.mat.uniforms.uRadius.value = 0.08 + e * 0.82;
      r.mat.uniforms.uOpacity.value = (r.hot ? 1.0 : 0.72) * (1 - r.t) * (1 - r.t);
      // drive the surface-wave displacement radius if this ring owns a ripple slot
      if (r.slotRipple >= 0) {
        // geodesic radius travels 0 -> ~1.5 rad; strength decays as it spreads
        rippleRadius[r.slotRipple] = e * 1.5;
        const baseStr = r.hot ? 1.0 : 0.62;
        rippleStrength[r.slotRipple] = baseStr * (1 - r.t) * (1 - r.t);
      }
    }

    // --- marker pulses (flare on landing; resting lilac, flash to white) ---
    let anyPulse = false;
    let colorDirty = false;
    for (let i = 0; i < nodeCount; i++) {
      if (markerPulse[i] > 0.001) {
        markerPulse[i] *= Math.pow(0.02, dt);
        anyPulse = true;
      } else if (markerPulse[i] !== 0) {
        markerPulse[i] = 0;
        // restore resting lilac as the pulse fully fades
        markers.setColorAt(i, _restCol);
        colorDirty = true;
      }
      const breathe = 1 + Math.sin(clock * 2 + i) * 0.05;
      // 1-frame haptic tick: an extra punch in the first instant of the pulse
      const haptic = markerPulse[i] > 0.92 ? 0.35 : 0;
      const sc = breathe + markerPulse[i] * 1.6 + haptic;
      tmpObj.position.copy(nodes[i]);
      tmpObj.scale.setScalar(sc);
      tmpObj.updateMatrix();
      markers.setMatrixAt(i, tmpObj.matrix);
      tmpObj.scale.setScalar(1 + markerPulse[i] * 2.4);
      tmpObj.updateMatrix();
      halos.setMatrixAt(i, tmpObj.matrix);
      // white is EARNED: lift the marker color toward white only while pulsing
      if (markerPulse[i] > 0.05) {
        _v0.set(_restCol.r, _restCol.g, _restCol.b);
        const w = Math.min(1, markerPulse[i]);
        const cr = _restCol.r + (1 - _restCol.r) * w;
        const cg = _restCol.g + (1 - _restCol.g) * w;
        const cb = _restCol.b + (1 - _restCol.b) * w;
        tmpCol.setRGB(cr, cg, cb);
        markers.setColorAt(i, tmpCol);
        colorDirty = true;
      }
    }
    markers.instanceMatrix.needsUpdate = true;
    halos.instanceMatrix.needsUpdate = true;
    if (colorDirty && markers.instanceColor) markers.instanceColor.needsUpdate = true;
    haloMat.opacity = 0.16 + (anyPulse ? 0.14 : 0);

    // --- fresnel: breathing rest + payoff spike + anticipation dim ---
    fresnelSpike += (0 - fresnelSpike) * Math.min(1, dt * 5.5); // settle the spike
    const breathing = entranceDone ? 0.9 + Math.sin(clock * 0.8) * 0.12 : fresnelMat.uniforms.uIntensity.value;
    const dim = 1 - inhale * 0.12; // ~12% dim during anticipation
    fresnelMat.uniforms.uIntensity.value = (breathing * dim) + fresnelSpike;

    // --- composite uniforms: exposure inhale, bloom spike, aberration, climax ---
    bloomSpike += (0 - bloomSpike) * Math.min(1, dt * 4.0);
    climaxT += (0 - climaxT) * Math.min(1, dt * 2.2);
    // exposure dips on anticipation, bumps on the magenta climax payoff
    const exposure = (1 - inhale * 0.12) * (1 + climaxT * 0.18);
    postMat.uniforms.uExposure.value += (exposure - postMat.uniforms.uExposure.value) * Math.min(1, dt * 10);
    postMat.uniforms.uBloom.value = 1.0 + bloomSpike + climaxT * 0.6;
    postMat.uniforms.uVignette.value += (climaxT * 0.5 - postMat.uniforms.uVignette.value) * Math.min(1, dt * 6);
    // velocity-coupled chromatic aberration: fling smears the rim, settles clean
    const targAberr = Math.min(1, (Math.abs(velRX) + Math.abs(velRY)) * 18) * 0.004;
    postMat.uniforms.uAberr.value += (targAberr - postMat.uniforms.uAberr.value) * Math.min(1, dt * 8);

    renderToScreen();
  }

  function start() {
    if (running) return;
    if (reducedMotion) { snapStaticFrame(); return; }
    running = true;
    last = 0;
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  // kick off
  if (reducedMotion) snapStaticFrame();
  else start();

  // ---------------------------------------------------------------------------
  //  RESIZE
  // ---------------------------------------------------------------------------
  let resizeRAF = 0;
  const ro = new ResizeObserver(() => {
    if (resizeRAF) return;
    resizeRAF = requestAnimationFrame(() => {
      resizeRAF = 0;
      rect = container.getBoundingClientRect();
      W = Math.max(1, rect.width || W);
      H = Math.max(1, rect.height || H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H, false);
      resizeRT();
      paintOverlay();
      if (reducedMotion || !running) renderToScreen();
    });
  });
  ro.observe(container);

  function onVisibility() {
    if (document.hidden) stop();
    else if (!reducedMotion) start();
  }
  document.addEventListener("visibilitychange", onVisibility);

  // ---------------------------------------------------------------------------
  //  HANDLE
  // ---------------------------------------------------------------------------
  function resetTransients() {
    for (const a of arcs) { a.active = false; a.mat.opacity = 0; a.t = 0; a.landed = false; }
    for (const r of rings) {
      r.active = false; r.mesh.visible = false; r.mat.uniforms.uOpacity.value = 0; r.t = 0;
      r.slotRipple = -1;
    }
    landingQueue.length = 0;
    for (let i = 0; i < nodeCount; i++) { markerPulse[i] = 0; markers.setColorAt(i, _restCol); }
    if (markers.instanceColor) markers.instanceColor.needsUpdate = true;
    for (let s = 0; s < MAX_RIPPLE; s++) { rippleStrength[s] = 0; rippleRadius[s] = 0; }
    fresnelSpike = 0; bloomSpike = 0; climaxT = 0; inhale = 0;
    postMat.uniforms.uExposure.value = 1;
    postMat.uniforms.uBloom.value = 1;
    postMat.uniforms.uVignette.value = 0;
    postMat.uniforms.uAberr.value = 0;
  }

  function replay() {
    if (reducedMotion) { snapStaticFrame(); return; }
    entranceT = 0;
    entranceDone = false;
    clock = 0;
    nextArcAt = 0;
    heroMagentaAt = 0;
    flareUsed = false;
    userClicked = false;
    curRX = targetRX = 0.18;
    curRY = targetRY = 0;
    velRX = velRY = 0;
    camera.position.set(0, 0, CAM_Z);
    camera.lookAt(0, 0, 0);
    resetTransients();
    applyEntrance(0);
    if (!running) start();
  }

  function pause() { stop(); }
  function resume() { if (!reducedMotion) start(); }

  function setReducedMotion(on) {
    reducedMotion = !!on;
    if (reducedMotion) {
      stop();
      snapStaticFrame();
    } else {
      entranceDone = true;
      applyEntrance(1);
      globe.scale.setScalar(1);
      resetTransients();
      nextArcAt = clock + 0.2;
      heroMagentaAt = flareUsed ? 0 : clock + 2.5;
      start();
    }
  }

  function destroy() {
    stop();
    clearTimeout(revealTimer);
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    try { ro.disconnect(); } catch (_) {}
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("click", onClick);

    const geos = [
      coreGeo, cageGeo, fresnelGeo, ringGeo, markerGeo, haloGeo,
      starNear.geo, starFar.geo, triGeo,
    ];
    for (const a of arcs) geos.push(a.geo);
    for (const r of rings) geos.push(r.geo);
    for (const g of geos) { try { g && g.dispose(); } catch (_) {} }

    const mats = [
      coreMat, cageMat, fresnelMat, equatorMat, markerMat, haloMat,
      starNear.mat, starFar.mat, postMat,
    ];
    for (const a of arcs) mats.push(a.mat);
    for (const r of rings) mats.push(r.mat);
    for (const m of mats) { try { m && m.dispose(); } catch (_) {} }

    try { markers.dispose && markers.dispose(); } catch (_) {}
    try { halos.dispose && halos.dispose(); } catch (_) {}
    try { sceneRT.dispose && sceneRT.dispose(); } catch (_) {}

    try { scene.clear(); } catch (_) {}
    try { postScene.clear(); } catch (_) {}
    try {
      renderer.setRenderTarget(null);
      renderer.dispose();
      renderer.forceContextLoss && renderer.forceContextLoss();
    } catch (_) {}

    try { canvas.remove(); } catch (_) {}
    try { overlay.remove(); } catch (_) {}
    try { backdrop.remove(); } catch (_) {}

    renderer = null;
  }

  const handle = { replay, pause, resume, setReducedMotion, destroy };
  // QA-only hooks (present only in headless probe mode; not part of the contract).
  if (opts.__preserveBuffer) {
    handle.__renderOnce = () => { try { renderToScreen(); } catch (_) {} };
    handle.__step = (dt) => { try { step(dt || 0.016); } catch (e) { return String(e); } };
    handle.__debug = () => ({
      flareUsed,
      clock,
      running,
      entranceDone,
      arc0t: arcs[0] ? arcs[0].t : -1,
      activeArcs: arcs.filter((a) => a.active).length,
      activeRings: rings.filter((r) => r.active).length,
      maxRipple: Math.max(rippleStrength[0], rippleStrength[1]),
      maxPulse: Math.max.apply(null, Array.from(markerPulse)),
      fresnel: fresnelMat.uniforms.uIntensity.value,
      bloom: postMat.uniforms.uBloom.value,
      exposure: postMat.uniforms.uExposure.value,
      vignette: postMat.uniforms.uVignette.value,
      aberr: postMat.uniforms.uAberr.value,
      climax: climaxT,
      inhale,
      queued: landingQueue.length,
    });
    handle.__forceMagenta = () => { fireMagentaArc(); };
  }
  return handle;

  // ===========================================================================
  //  HELPERS
  // ===========================================================================
  // latitude/longitude wireframe as line segments (radial normals for fresnel)
  function buildCageGeometry(R, latLines, lonLines) {
    const positions = [];
    const normals = [];
    const SEG = 64; // samples per circle
    // latitude rings (constant phi)
    for (let i = 1; i < latLines; i++) {
      const phi = (i / latLines) * Math.PI; // 0..PI
      const y = Math.cos(phi);
      const rr = Math.sin(phi);
      for (let j = 0; j < SEG; j++) {
        const t0 = (j / SEG) * Math.PI * 2;
        const t1 = ((j + 1) / SEG) * Math.PI * 2;
        const x0 = Math.cos(t0) * rr, z0 = Math.sin(t0) * rr;
        const x1 = Math.cos(t1) * rr, z1 = Math.sin(t1) * rr;
        positions.push(x0 * R, y * R, z0 * R, x1 * R, y * R, z1 * R);
        normals.push(x0, y, z0, x1, y, z1);
      }
    }
    // longitude meridians (constant theta)
    for (let i = 0; i < lonLines; i++) {
      const theta = (i / lonLines) * Math.PI * 2;
      const ct = Math.cos(theta), st = Math.sin(theta);
      for (let j = 0; j < SEG; j++) {
        const p0 = (j / SEG) * Math.PI;
        const p1 = ((j + 1) / SEG) * Math.PI;
        const y0 = Math.cos(p0), r0 = Math.sin(p0);
        const y1 = Math.cos(p1), r1 = Math.sin(p1);
        const x0 = ct * r0, z0 = st * r0;
        const x1 = ct * r1, z1 = st * r1;
        positions.push(x0 * R, y0 * R, z0 * R, x1 * R, y1 * R, z1 * R);
        normals.push(x0, y0, z0, x1, y1, z1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    return g;
  }
}
