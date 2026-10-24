/* Heresay hero: a jelly character you can talk to.
   Two independent halves:
   1. the "try it" form (bubble, glyphs, storage, events) works with or without WebGL;
   2. the Three.js face (points converge -> jelly pops in -> springs, eyes, lean, squish).
   Three is imported lazily after first paint; if it fails the stage shows the flat mark. */

const stage = document.getElementById('hero-stage');
const bubble = document.getElementById('bubble');
const form = document.getElementById('try');
const input = document.getElementById('try-in');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(hover: none)').matches;
const small = innerWidth < 700;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

let face = null; // set once the 3D face is ready
let diveT = 0;   // 0..1, the scroll-driven dive into the face (desktop only), set by home.js
/* window.heresayHero.setDive(p): p 0..1. Camera pushes in, the face grows until its surface fills the
   screen, the eyes slide out to the sides. Safe to call before the face has loaded. */
window.heresayHero = { setDive(p) { diveT = clamp(+p || 0, 0, 1); if (face && face.wake) face.wake(); }, get dive() { return diveT; } };
let formed = false;
function fireFormed() { if (formed) return; formed = true; window.dispatchEvent(new Event('heresay:hero-formed')); }

/* ------------------------------------------------------------------ bubble */
let bubbleTimer = 0;
function say(text, ms = 2300) {
  if (!bubble) return;
  clearTimeout(bubbleTimer);
  bubble.classList.remove('on', 'off');
  void bubble.offsetWidth;
  bubble.textContent = text;
  bubble.classList.add('on');
  bubbleTimer = setTimeout(() => {
    bubble.classList.remove('on'); bubble.classList.add('off');
    bubbleTimer = setTimeout(() => { bubble.textContent = ''; bubble.classList.remove('off'); }, 400);
  }, ms);
}

/* ------------------------------------------------------------------ glyphs */
const layer = document.createElement('div');
layer.className = 'glyph-layer'; layer.setAttribute('aria-hidden', 'true');
document.body.appendChild(layer);
const glyphs = [];
let glyphRaf = 0, lastGulp = 0, lastAttend = 0;
const mctx = document.createElement('canvas').getContext('2d');

function caretPoint() {
  const r = input.getBoundingClientRect(), cs = getComputedStyle(input);
  mctx.font = cs.font || `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const pos = input.selectionStart == null ? input.value.length : input.selectionStart;
  const w = mctx.measureText(input.value.slice(0, pos)).width;
  const x = r.left + parseFloat(cs.paddingLeft) + w - input.scrollLeft;
  return { x: clamp(x, r.left + 14, r.right - 14), y: r.top + r.height / 2 };
}
function mouthPoint() {
  if (face) return face.mouth();
  const r = stage.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 };
}
function spawnGlyph(ch) {
  if (glyphs.length > 28) return;
  const el = document.createElement('span');
  el.className = 'glyph'; el.textContent = ch;
  layer.appendChild(el);
  const s = caretPoint();
  glyphs.push({ el, s, t0: performance.now(), dur: 620 + Math.random() * 220, bend: (Math.random() - 0.5) * 140, lift: 60 + Math.random() * 90 });
  if (!glyphRaf) glyphRaf = requestAnimationFrame(glyphTick);
}
function glyphTick(now) {
  glyphRaf = 0;
  const m = mouthPoint();
  for (let i = glyphs.length - 1; i >= 0; i--) {
    const g = glyphs[i];
    const u = clamp((now - g.t0) / g.dur, 0, 1), e = u * u * (3 - 2 * u);
    // quadratic bezier: caret -> arc above/aside -> mouth
    const cx = (g.s.x + m.x) / 2 + g.bend, cy = Math.min(g.s.y, m.y) - g.lift;
    const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
    const x = a * g.s.x + b * cx + c * m.x, y = a * g.s.y + b * cy + c * m.y;
    const sc = 1 - 0.65 * smooth(0.6, 1, u);
    g.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) rotate(${((1 - e) * g.bend * 0.3).toFixed(1)}deg) scale(${sc.toFixed(3)})`;
    g.el.style.opacity = String(1 - smooth(0.85, 1, u));
    if (u >= 1) {
      g.el.remove(); glyphs.splice(i, 1);
      const t = performance.now();
      if (face && t - lastGulp > 90) { lastGulp = t; face.gulp(); }
    }
  }
  if (glyphs.length) glyphRaf = requestAnimationFrame(glyphTick);
}

/* -------------------------------------------------------------------- form */
if (input && form) {
  input.addEventListener('input', (e) => {
    const typed = e.inputType && e.inputType.startsWith('insert') && e.data;
    if (face) { const r = input.getBoundingClientRect(); face.attend(r.left + r.width / 2, r.top + r.height / 2); lastAttend = performance.now(); }
    if (typed && !reduce) for (const ch of e.data) if (ch.trim()) spawnGlyph(ch);
    else if (typed && reduce && face) face.gulp();
  });
  input.addEventListener('focus', () => { if (face) { const r = input.getBoundingClientRect(); face.attend(r.left + r.width / 2, r.top + r.height / 2); } });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim().slice(0, 140);
    if (!text) { if (face) face.confused(); say('Say what’s wrong first.'); input.focus(); return; }
    if (face) face.happy();
    say('Heard.');
    window.heresayDemo = { text, at: Date.now() };
    try { sessionStorage.setItem('heresay-demo', text); } catch (_) {}
    window.dispatchEvent(new CustomEvent('heresay:report', { detail: { text } }));
    input.value = '';
  });
}

/* ---------------------------------------------------------------- fallback */
let fb = null;
function showFallback() {
  if (fb || face) return;
  fb = document.createElement('img');
  fb.className = 'hero-fallback'; fb.src = 'mark.svg'; fb.alt = ''; fb.width = 200; fb.height = 200;
  stage.appendChild(fb);
  requestAnimationFrame(() => fb && fb.classList.add('on'));
}
function hideFallback() { if (fb) { fb.remove(); fb = null; } }

/* --------------------------------------------------------------- 3D face */
class Spring {
  constructor(k, d, x = 0) { this.k = k; this.d = d; this.x = x; this.v = 0; this.t = x; }
  step(dt) { const a = this.k * (this.t - this.x) - this.d * this.v; this.v += a * dt; this.x += this.v * dt; return this.x; }
}

async function build() {
  const THREE = await import('three');
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');

  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0xffffff, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.8;
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-2.5, 3.5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ff5e6, 1.2); rim.position.set(3, 1, -2); scene.add(rim);

  const FOV = 28, DIST = 6.3;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
  camera.position.set(0, 0, DIST);
  const viewH = 2 * DIST * Math.tan(THREE.MathUtils.degToRad(FOV / 2)); // world units across the stage
  const BASE_Y = 0.12;

  /* ---- soft pillow body: the six-wave outline (r = 1 + 9/74 sin 6t in the mark), inflated ---- */
  const A = 9 / 74, H = 0.5, P = 0.62;
  const outlineR = (th) => 1 - A * Math.sin(6 * th); // y-up
  const NR = 60, NS = 120;
  const nv = 2 + (NR - 1) * NS;
  const base = new Float32Array(nv * 3), nrm0 = new Float32Array(nv * 3);
  const surfZ = (x, y) => { // analytic height of the front surface at (x,y)
    const th = Math.atan2(y, x), rho = clamp(Math.hypot(x, y) / outlineR(th), 0, 1);
    return H * Math.pow(Math.sqrt(1 - rho * rho), P);
  };
  {
    let n = 0;
    const put = (x, y, z) => { base[n * 3] = x; base[n * 3 + 1] = y; base[n * 3 + 2] = z; n++; };
    put(0, 0, H);
    for (let i = 1; i < NR; i++) {
      const phi = Math.PI * i / NR, rho = Math.sin(phi), c = Math.cos(phi);
      const z = H * Math.sign(c) * Math.pow(Math.abs(c), P);
      for (let j = 0; j < NS; j++) {
        const th = 2 * Math.PI * j / NS, r = outlineR(th) * rho;
        put(r * Math.cos(th), r * Math.sin(th), z);
      }
    }
    put(0, 0, -H);
  }
  const idx = [];
  const V = (i, j) => 1 + (i - 1) * NS + ((j % NS) + NS) % NS, back = nv - 1;
  for (let j = 0; j < NS; j++) idx.push(0, V(1, j), V(1, j + 1));
  for (let i = 1; i < NR - 1; i++) for (let j = 0; j < NS; j++) {
    const a = V(i, j), b = V(i, j + 1), c = V(i + 1, j), d = V(i + 1, j + 1);
    idx.push(a, c, b, b, c, d);
  }
  for (let j = 0; j < NS; j++) idx.push(back, V(NR - 1, j + 1), V(NR - 1, j));
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(base), 3));
  bodyGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
  bodyGeo.setIndex(idx);
  bodyGeo.computeVertexNormals();
  nrm0.set(bodyGeo.attributes.normal.array);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a5f58, roughness: 0.17, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
    sheen: 0.25, sheenRoughness: 0.4, sheenColor: new THREE.Color(0x2dd4bf), ior: 1.5, specularIntensity: 1,
    transparent: true, opacity: 0,
  });
  bodyMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float ndv = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
      float fres = pow(1.0 - ndv, 2.6);
      outgoingLight += vec3(0.10, 0.80, 0.70) * fres * 0.5;           // turquoise rim, like light through jelly
      outgoingLight += vec3(0.02, 0.20, 0.17) * pow(ndv, 1.5) * 0.08;   // soft inner glow
      #include <opaque_fragment>`);
  };
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.frustumCulled = false;

  /* ---- eyes: the mark's quote-mark path, extruded with a generous round bevel ---- */
  const eyeShape = (() => {
    const pts = [], bez = (p0, p1, p2, p3, n) => { for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); } };
    pts.push([-13, 12]);
    bez([-13, 12], [-13, -8], [-2, -24], [17, -32], 28);
    pts.push([20, -25]);
    bez([20, -25], [8, -18], [2, -9], [3, -1], 28);
    // arc (3,-1) -> (-13,12), r 13, large arc, sweep 1 (SVG y-down): pick the centre giving a >180deg positive sweep
    const p0 = [3, -1], p1 = [-13, 12], r = 13, mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dl = Math.hypot(dx, dy), h = Math.sqrt(r * r - dl * dl / 4);
    for (const s of [1, -1]) {
      const c = [mx - s * dy / dl * h, my + s * dx / dl * h];
      const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]);
      let d = Math.atan2(p1[1] - c[1], p1[0] - c[0]) - a0; d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (d > Math.PI) { for (let i = 1; i < 56; i++) { const a = a0 + d * i / 56; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } break; }
    }
    const ang = -24 * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang), K = 1.25 / 74;
    return pts.map(([x, y]) => new THREE.Vector2((x * ca - y * sa) * K, -(x * sa + y * ca) * K));
  })();
  const eyeGeo = new THREE.ExtrudeGeometry(new THREE.Shape(eyeShape), {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.03, bevelOffset: -0.03, bevelSegments: 8, curveSegments: 1,
  });
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1,
    transparent: true, opacity: 0,
  });
  const eyes = [[-20, 6], [24, 1]].map(([ex, ey]) => {
    const g = new THREE.Group(), m = new THREE.Mesh(eyeGeo, eyeMat);
    g.add(m); g.userData.home = new THREE.Vector2(ex / 74, ey / 74); // (80,106)/(124,101) vs centre 100, y flipped
    return g;
  });

  /* ---- soft contact shadow ---- */
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(11,94,87,0.34)'); g.addColorStop(0.45, 'rgba(11,94,87,0.14)'); g.addColorStop(1, 'rgba(11,94,87,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
  shadow.position.set(0, -1.38, -0.6); shadow.scale.set(2.3, 0.36, 1);
  scene.add(shadow);

  const root = new THREE.Group(); // lean / nod / tilt / pop
  root.add(body); eyes.forEach((e) => root.add(e));
  scene.add(root);

  /* ---- intro points: a drifting chorus that converges onto the surface ---- */
  const NP = reduce ? 0 : small ? 2400 : 6000;
  let points = null, pu = null;
  if (NP) {
    const pos = new Float32Array(NP * 3), tgt = new Float32Array(NP * 3), seed = new Float32Array(NP * 4), col = new Float32Array(NP * 3);
    const c1 = new THREE.Color(0x2dd4bf), c2 = new THREE.Color(0x0f766e), tmp = new THREE.Color();
    for (let i = 0; i < NP; i++) {
      const v = (Math.random() < 0.8 ? Math.floor(Math.random() * (nv / 2)) : Math.floor(Math.random() * nv)) % nv; // mostly the front half
      const jx = (Math.random() - 0.5) * 0.02;
      tgt[i * 3] = base[v * 3] * 1.012 + nrm0[v * 3] * 0.012 + jx; tgt[i * 3 + 1] = base[v * 3 + 1] * 1.012 + nrm0[v * 3 + 1] * 0.012 + jx; tgt[i * 3 + 2] = base[v * 3 + 2] + nrm0[v * 3 + 2] * 0.012;
      const a = Math.random() * Math.PI * 2, rr = 0.7 + Math.sqrt(Math.random()) * 0.75;
      pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = Math.sin(a) * rr * 0.9; pos[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
      seed.set([Math.random(), 0.4 + Math.random() * 1.2, Math.random() * 6.283, Math.random() - 0.5], i * 4);
      tmp.copy(c1).lerp(c2, Math.random() * Math.random() * 1.2); col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aTarget', new THREE.BufferAttribute(tgt, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    pu = { uProg: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 }, uPx: { value: 3 } };
    points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: pu, transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec3 aTarget; attribute vec4 aSeed; attribute vec3 aColor;
        uniform float uProg, uTime, uPx; varying vec3 vC; varying float vA;
        void main(){
          float p = clamp((uProg - aSeed.x * 0.5) / 0.5, 0.0, 1.0);
          float e = 1.0 - pow(1.0 - p, 3.0);
          vec3 s = position + vec3(sin(uTime * aSeed.y + aSeed.z), cos(uTime * aSeed.y * 0.8 + aSeed.z * 1.7), sin(uTime * 0.6 * aSeed.y + aSeed.z * 2.3)) * 0.16;
          vec3 d = aTarget - s; vec3 side = normalize(vec3(-d.y, d.x, 0.0) + 1e-4);
          vec3 w = mix(s, aTarget, e) + side * sin(e * 3.14159) * aSeed.w * 1.1;
          vec4 mv = modelViewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uPx * (0.8 + aSeed.y * 0.5) * (${DIST.toFixed(2)} / -mv.z);
          vC = aColor; vA = (0.55 + 0.45 * e) * (1.0 - smoothstep(1.15, 1.5, length(w.xy)));
        }`,
      fragmentShader: `
        uniform float uFade; varying vec3 vC; varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.55, d) * vA * uFade;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC, a);
        }`,
    }));
    points.frustumCulled = false; points.renderOrder = 2;
    scene.add(points);
  }

  /* ---- state ---- */
  const lean = { ry: new Spring(70, 9), rx: new Spring(70, 9), rz: new Spring(60, 8) };
  const nod = new Spring(120, 7), sq = new Spring(190, 9), pop = new Spring(150, 11, 0.5);
  const wob = [new Spring(90, 2.4), new Spring(140, 2.8), new Spring(230, 3.2)];
  const happyS = new Spring(150, 16), blinkAmt = { v: 0 };
  const drag = { on: false, ax: 0, ay: 0, px: new Spring(120, 10), py: new Spring(120, 10), amt: new Spring(170, 11), pid: -1 };
  const ptr = { x: 0, y: 0, seen: false, t: -99 };
  const att = { x: 0, y: 0, until: 0 };
  const look = { x: new Spring(130, 16), y: new Spring(130, 16) };
  let dive = 0, canvasOp = 1, hidden = false;
  let happyUntil = 0, tiltUntil = 0, nextBlink = performance.now() + 1800, blink2 = 0, blinkStart = -1, nextGlance = 0;
  const S = { sx: 1, sy: 1, sz: 1 };

  const blink = (double) => { blinkStart = performance.now(); if (double) blink2 = blinkStart + 230; };
  const rect = { x: 0, y: 0, s: 600 };
  const upRect = () => { const r = stage.getBoundingClientRect(); rect.x = r.left + r.width / 2; rect.y = r.top + r.height / 2; rect.s = r.width; };
  const toLocal = (px, py) => ({ x: (px - rect.x) / rect.s * viewH, y: -(py - rect.y) / rect.s * viewH - BASE_Y });
  const inside = (px, py) => { const p = toLocal(px, py); return Math.hypot(p.x, p.y) < 1.0 * outlineR(Math.atan2(p.y, p.x)); };

  /* Desktop: the canvas is a fixed full-viewport layer and the camera is shifted so the face still appears
     exactly where the stage is (same pixels-per-unit). That lets the dive grow past the stage's edges. */
  let full = false, cw = 2, ch = 2, dvE = 0;
  function resize() {
    full = innerWidth >= 1100 && !reduce;
    canvas.classList.toggle('full', full);
    cw = full ? innerWidth : Math.max(2, stage.clientWidth); ch = full ? innerHeight : Math.max(2, stage.clientHeight);
    renderer.setSize(cw, ch, false);
    if (pu) pu.uPx.value = 2.7 * renderer.getPixelRatio() * (Math.max(2, stage.clientWidth) / 620);
    fit();
  }
  function fit() {
    if (!full) { camera.fov = FOV; camera.aspect = cw / ch; camera.clearViewOffset(); camera.updateProjectionMatrix(); return; }
    const ppu = rect.s / viewH, worldH = ch / ppu;
    camera.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(worldH / 2 / DIST)); camera.aspect = cw / ch;
    const cx = rect.x + (cw / 2 - rect.x) * dvE, cy = rect.y + (ch / 2 - rect.y) * dvE;
    camera.setViewOffset(cw, ch, cw / 2 - cx, ch / 2 - cy, cw, ch);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage); addEventListener('resize', resize); resize();

  /* ---- input ---- */
  if (!coarse) addEventListener('pointermove', (e) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.seen = true; ptr.t = performance.now(); }, { passive: true });
  addEventListener('pointermove', (e) => {
    upRect();
    if (drag.on && e.pointerId === drag.pid) {
      const p = toLocal(e.clientX, e.clientY);
      let dx = (p.x - drag.ax) * 0.75, dy = (p.y - drag.ay) * 0.75, l = Math.hypot(dx, dy);
      if (l > 0.55) { dx *= 0.55 / l; dy *= 0.55 / l; }
      drag.px.t = dx; drag.py.t = dy;
    }
    if (e.pointerType === 'mouse' && !drag.on) (full ? stage : canvas).style.cursor = diveT < 0.04 && inside(e.clientX, e.clientY) ? 'grab' : '';
  }, { passive: true });
  const onDown = (e) => {
    upRect();
    if (full && (diveT > 0.04 || (e.target.closest && e.target.closest('input,button,a,textarea,label,summary,.topbar')))) return;
    if (!inside(e.clientX, e.clientY)) return;
    const p = toLocal(e.clientX, e.clientY);
    drag.on = true; drag.pid = e.pointerId; drag.ax = p.x; drag.ay = p.y;
    drag.px.t = drag.py.t = 0; drag.amt.t = 1;
    sq.v += 3.2; sq.t = 0.25; blink(false);
    wob.forEach((w) => { w.v += (Math.random() - 0.5) * 7; });
    canvas.classList.add('drag');
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  };
  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointerdown', (e) => { if (full && e.target !== canvas) onDown(e); });
  const release = (e) => {
    if (!drag.on || e.pointerId !== drag.pid) return;
    drag.on = false; drag.px.t = drag.py.t = 0; drag.amt.t = 0; sq.t = 0; sq.v -= 2.2;
    wob.forEach((w) => { w.v += (Math.random() - 0.5) * 9; });
    canvas.classList.remove('drag');
  };
  addEventListener('pointerup', release); addEventListener('pointercancel', release);

  /* ---- deformation: the soft body ---- */
  const posAttr = bodyGeo.attributes.position, parr = posAttr.array;
  const Y0 = -0.95;
  function deform(x, y, z, o) {
    let X = x * S.sx, Y = (y - Y0) * S.sy + Y0, Z = z * S.sz;
    const r2 = x * x + y * y;
    X += wob[0].x * 0.1 * (y + 1) * 0.5;
    Y += wob[1].x * 0.07 * (1 - r2 * 0.5) * Math.sign(z || 1) * 0.6;
    Z += wob[2].x * 0.1 * (1 - r2);
    if (drag.amt.x > 0.002 || drag.px.x * drag.px.x + drag.py.x * drag.py.x > 1e-5) {
      const dx = x - drag.ax, dy = y - drag.ay, g = Math.exp(-(dx * dx + dy * dy) * 2.4) * (z > 0 ? 1 : 0.35);
      X += drag.px.x * g; Y += drag.py.x * g; Z -= drag.amt.x * 0.2 * g * Math.sign(z || 1);
    }
    o.x = X; o.y = Y; o.z = Z; return o;
  }
  const tmpO = { x: 0, y: 0, z: 0 };

  /* ---- API for the form ---- */
  const tv = new THREE.Vector3();
  const api = {
    mouth() {
      tv.set(0, -0.36, surfZ(0, -0.36) * 0.9); root.localToWorld(tv); tv.project(camera);
      const r = stage.getBoundingClientRect();
      return { x: r.left + (tv.x * 0.5 + 0.5) * r.width, y: r.top + (-tv.y * 0.5 + 0.5) * r.height };
    },
    gulp() { sq.v += 1.35; wob[2].v += 1.2; },
    attend(x, y) { att.x = x; att.y = y; att.until = performance.now() + 1800; },
    happy() { happyUntil = performance.now() + 1100; nod.v += 5.5; sq.v += 1.2; },
    confused() { tiltUntil = performance.now() + 1100; blink(false); wob[0].v += 2; },
  };

  /* ---- frame ---- */
  let running = false, raf = 0, last = 0, t0 = 0, frames = 0, prevLx = 0, prevLy = 0, popped = false, finalized = false;
  const clock0 = performance.now();

  function frame(now) {
    raf = 0; if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0.001, 0.05); last = now;
    const t = (now - clock0) / 1000;
    frames++; upRect();
    if (frames === 3) t0 = now;
    const it = frames < 3 ? 0 : reduce ? 9 : (now - t0) / 1000; // intro clock (wall time)

    /* intro choreography (~2.5s) */
    if (pu) { pu.uProg.value = clamp(it / 1.7, 0, 1); pu.uTime.value = t; pu.uFade.value = 1 - smooth(1.65, 2.5, it); }
    if (it >= 1.4 && !popped) { popped = true; pop.t = 1; pop.v = 7; }
    const vis = reduce ? 1 : smooth(1.45, 1.95, it);
    bodyMat.opacity = eyeMat.opacity = vis; shadow.material.opacity = vis;
    if (reduce) { pop.x = pop.t = 1; }
    if (it >= 2.5 && !finalized) {
      finalized = true; bodyMat.transparent = false; bodyMat.opacity = 1; bodyMat.needsUpdate = true;
      eyeMat.transparent = false; eyeMat.opacity = 1; eyeMat.needsUpdate = true;
      if (points) { scene.remove(points); points.geometry.dispose(); points.material.dispose(); points = null; pu = null; }
      hideFallback(); fireFormed();
    }

    /* the dive: smoothed toward the scroll-driven target */
    dive += (diveT - dive) * (1 - Math.exp(-dt * 10));
    if (Math.abs(diveT - dive) < 0.0005) dive = diveT;
    const dvA = smooth(0, 0.92, dive);
    dvE = full ? smooth(0, 0.8, dive) : 0;
    const eyeOut = smooth(0.0, 0.38, dive);
    const op = full ? 1 - smooth(0.86, 0.99, dive) : 1;
    if (op !== canvasOp) { canvasOp = op; canvas.style.opacity = op < 1 ? op.toFixed(3) : ''; }
    const shouldHide = full && dive >= 0.995;
    if (shouldHide !== hidden) { hidden = shouldHide; canvas.style.visibility = hidden ? 'hidden' : ''; }

    /* where is it looking? */
    let tx = 0, ty = 0, have = false;
    if (now < att.until) { have = true; tx = att.x - rect.x; ty = att.y - rect.y; }
    else if (ptr.seen && !coarse) { have = true; tx = ptr.x - rect.x; ty = ptr.y - rect.y; }
    let lx = 0, ly = 0;
    if (have && !reduce) { const l = Math.hypot(tx, ty); lx = tx / (l + 240); ly = ty / (l + 240); }
    const idle = !(now < att.until) && (!ptr.seen || now - ptr.t > 4000);
    if (idle && !reduce && now > nextGlance) { // idle glance
      nextGlance = now + 1500 + Math.random() * 2600;
      const a = Math.random() * 6.283, m = Math.random() < 0.3 ? 0 : 0.55 + Math.random() * 0.4;
      look.x.t = Math.cos(a) * m; look.y.t = Math.sin(a) * m * 0.7;
    }
    if (!idle) { look.x.t = lx * 1.1; look.y.t = ly * 1.1; }
    if (dive > 0) { look.x.t *= 1 - dvA; look.y.t *= 1 - dvA; lx *= 1 - dvA; ly *= 1 - dvA; }
    const tilting = now < tiltUntil;
    lean.ry.t = lx * 0.5; lean.rx.t = ly * 0.34; lean.rz.t = tilting ? 0.3 : lx * -0.04;
    if (!reduce) {
      // the face "feels" fast pointer swings: kick the jelly modes
      const dl = (lx - prevLx) + (ly - prevLy) * 0.3; prevLx = lx; prevLy = ly;
      if (Math.abs(dl) > 0.004) { wob[0].v -= dl * 40; wob[1].v += dl * 14; }
    }

    /* happiness */
    happyS.t = now < happyUntil ? 1 : 0;

    /* springs */
    const sub = 2, h = dt / sub;
    for (let i = 0; i < sub; i++) {
      lean.ry.step(h); lean.rx.step(h); lean.rz.step(h); nod.step(h); sq.step(h); pop.step(h);
      wob.forEach((w) => w.step(h)); happyS.step(h); look.x.step(h); look.y.step(h);
      drag.px.step(h); drag.py.step(h); drag.amt.step(h);
    }
    if (reduce) { lean.ry.x = lean.rx.x = lean.rz.x = 0; }

    /* blink schedule */
    if (now > nextBlink) { blink(!reduce && Math.random() < 0.18); nextBlink = now + (reduce ? 5000 + Math.random() * 3000 : 2500 + Math.random() * 2500); }
    if (blink2 && now > blink2) { blink2 = 0; blinkStart = now; }
    let b = 0;
    if (blinkStart > 0) { const u = (now - blinkStart) / 170; if (u >= 1) blinkStart = -1; else b = Math.pow(Math.sin(Math.PI * u), 1.4); }

    /* body transform */
    const breath = reduce ? 0 : Math.sin(t * 1.9);
    S.sx = 1 + 0.012 * breath + 0.17 * sq.x; S.sy = 1 - 0.011 * breath - 0.24 * sq.x; S.sz = 1 + 0.012 * breath + 0.1 * sq.x;
    root.rotation.set(lean.rx.x + nod.x * 0.22, lean.ry.x, lean.rz.x);
    const bob = reduce ? 0 : Math.sin(t * 1.25) * 0.03;
    root.position.set(lx * 0.06, BASE_Y + bob, 0);
    const sc = Math.max(0.01, pop.x) * (1 + 1.05 * dvA); root.scale.setScalar(sc);
    camera.position.z = DIST - 3.9 * dvA; fit();
    shadow.scale.set(2.3 * (1 + 0.1 * sq.x) * (1 - bob * 0.8) * sc, 0.36 * (1 - bob * 1.5) * sc, 1); shadow.material.opacity = vis * (1 - smooth(0, 0.25, dive));
    shadow.position.x = -lean.ry.x * 0.15;

    for (let i = 0; i < nv; i++) {
      deform(base[i * 3], base[i * 3 + 1], base[i * 3 + 2], tmpO);
      parr[i * 3] = tmpO.x; parr[i * 3 + 1] = tmpO.y; parr[i * 3 + 2] = tmpO.z;
    }
    posAttr.needsUpdate = true; bodyGeo.computeVertexNormals();

    /* eyes ride the surface */
    const hp = happyS.x;
    eyes.forEach((e, k) => {
      const hx = e.userData.home.x + look.x.x * 0.045 + (k ? 1 : -1) * eyeOut * 2.6, hy = e.userData.home.y - look.y.x * 0.03 + hp * 0.035 + (tilting ? (k ? 0.03 : -0.02) : 0);
      deform(hx, hy, surfZ(hx, hy) - 0.01, tmpO);
      e.position.set(tmpO.x, tmpO.y, tmpO.z);
      const sy = Math.max(0.05, (1 - 0.93 * b) * (1 - 0.5 * hp));
      e.scale.set(S.sx * (1 + 0.14 * hp), sy * S.sy, 1);
      e.rotation.z = 0;
    });

    if (!hidden) renderer.render(scene, camera);
    if (frames === 1) stage.classList.add('ready');
  }

  api.wake = () => { if (!running && onScreen && !document.hidden) start(); };
  function start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  let onScreen = true;
  const sync = () => (onScreen && !document.hidden ? start() : stop());
  new IntersectionObserver((es) => { onScreen = es[es.length - 1].isIntersecting; canvas.style.display = onScreen ? '' : 'none'; sync(); }, { threshold: 0.02 }).observe(stage);
  document.addEventListener('visibilitychange', sync);
  addEventListener('resize', upRect);

  sync();
  Object.assign(api, { renderer });
  return api;
}

/* ----------------------------------------------------------------- boot */
let booted = false;
function boot() {
  if (booted) return; booted = true;
  build().then((api) => { face = api; }).catch((err) => {
    console.info('[heresay] 3D hero unavailable, using the flat mark:', err && err.message);
    showFallback(); fireFormed();
  });
}
// slow CDN: show the flat mark after 4s; the 3D face removes it once it forms
setTimeout(() => { if (!face) showFallback(); }, 4000);
// load three after first paint, never before; the page works without it
const go = () => requestAnimationFrame(() => setTimeout(boot, 0));
if (document.readyState === 'complete') go();
else { addEventListener('load', go, { once: true }); setTimeout(go, 2500); }
