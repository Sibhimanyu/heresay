/* Heresay: the hall of voices (chapter B).
   ~300 speech-bubble cards float in depth, then fly into four lanes by type (REPORT_ORDER).
   One card is the visitor's own report. Scroll drives window.heresayHall.setProgress(p), p 0..1.
   Initialises only when the section is near the viewport, pauses when it is not.
   Everything fixed here is drawn from our own strings; the visitor's text only ever goes through canvas fillText. */
import * as THREE from 'three';

const root = document.documentElement;
const sec = document.getElementById('how');
const host = sec && sec.querySelector('.hall-canvas');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const HS = () => window.HERESAY;

let want = 0, inst = null;
window.heresayHall = { setProgress(p) { want = clamp(+p || 0); if (inst) inst.wake(); }, get progress() { return want; } };

function fail(err) {
  console.info('[heresay] 3D hall unavailable, using the static lanes:', err && err.message);
  root.classList.remove('hall-3d');
  window.dispatchEvent(new Event('heresay:hall-failed'));
}

const TYPES = [
  { label: 'Broken', chip: '#fdecea', ink: '#b42318' },
  { label: 'Confusing', chip: '#fdf3e3', ink: '#8a4b0b' },
  { label: 'Could be better', chip: '#e6f4f2', ink: '#0b5e57' },
  { label: 'Idea', chip: '#eef0f3', ink: '#5b6472' },
];
const TEXTS = [
  ['Checkout hangs on a spinner.', 'The export button does nothing.', 'App crashes when I rotate my phone.', 'Login loops back to the start.', 'Upload fails with no error.', 'Dark mode makes the text vanish.', 'Search finds nothing, ever.', 'The page goes blank after saving.'],
  ["I can't find where to cancel my plan.", 'Where did the Share button go?', 'What does Archive actually do?', 'How do I invite my team?', 'Two buttons say Save. Which one?', 'Why was I logged out?', 'Is my draft saved or not?', "What's the difference between these plans?"],
  ['The sidebar feels cramped.', 'Loading takes a bit too long.', 'Error messages are hard to read.', 'Tables should scroll sideways.', 'The text is small on my laptop.', 'Too many clicks to rename something.', 'Notifications are a bit loud.', 'The buttons are tiny on mobile.'],
  ['Could you add a dark mode?', 'Let me pin my favourite reports.', 'Keyboard shortcuts would be great.', 'An undo for deletes, please.', 'Export to PDF would help.', 'Show my recent searches.', 'Let me reorder my dashboard.', 'A weekly email summary?'],
];
const COUNTS = [62, 84, 86, 68]; // 300 in all
const N = COUNTS.reduce((a, b) => a + b, 0);
const FONT = '600 29px Figtree, system-ui, sans-serif';

/* word-wrap on a canvas; returns lines that fit */
function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/* one speech-bubble card into a 512x256 cell at (ox, oy) */
function drawCard(ctx, ox, oy, type, text, opts = {}) {
  const blank = text == null;
  const T = TYPES[type];
  ctx.save(); ctx.translate(ox, oy);
  const x = 18, y = 14, w = 476, h = 196;
  ctx.fillStyle = opts.fill || 'rgba(255,255,255,0.97)';
  rr(ctx, x, y, w, h, 34); ctx.fill();
  ctx.beginPath();
  if (opts.tailLeft) { ctx.moveTo(x + 52, y + h - 2); ctx.lineTo(x + 40, y + h + 30); ctx.lineTo(x + 96, y + h - 2); }
  else { ctx.moveTo(x + w - 52, y + h - 2); ctx.lineTo(x + w - 40, y + h + 30); ctx.lineTo(x + w - 96, y + h - 2); }
  ctx.closePath(); ctx.fill();
  if (opts.stroke) { ctx.strokeStyle = opts.stroke; ctx.lineWidth = 5; rr(ctx, x, y, w, h, 34); ctx.stroke(); }
  // type chip
  ctx.font = '700 22px Figtree, system-ui, sans-serif';
  const cw = (blank ? 70 : ctx.measureText(T.label).width + 30);
  ctx.fillStyle = T.chip; rr(ctx, x + 28, y + 24, cw + 4, 36, 18); ctx.fill();
  if (blank) {
    ctx.fillStyle = 'rgba(21,23,28,0.16)';
    rr(ctx, x + 30, y + 92, 300, 16, 8); ctx.fill(); rr(ctx, x + 30, y + 126, 200, 16, 8); ctx.fill();
    ctx.restore(); return;
  }
  ctx.fillStyle = T.ink; ctx.textBaseline = 'middle'; ctx.fillText(T.label, x + 43, y + 43);
  // text
  ctx.fillStyle = '#15171c'; ctx.textBaseline = 'alphabetic';
  let size = opts.fit ? 32 : 29, lines;
  for (; size >= 19; size -= 2) {
    ctx.font = `600 ${size}px Figtree, system-ui, sans-serif`;
    lines = wrap(ctx, text, w - 60);
    if (lines.length <= (opts.fit ? (size > 24 ? 2 : 3) : 2)) break;
  }
  const maxL = size > 24 ? 2 : 3;
  if (lines.length > maxL) { lines = lines.slice(0, maxL); let l = lines[maxL - 1]; while (l.length > 1 && ctx.measureText(l + '…').width > w - 60) l = l.slice(0, -1); lines[maxL - 1] = l + '…'; }
  const lh = size * 1.22, top = y + 86 + (maxL === 3 ? 0 : 6);
  lines.forEach((l, i) => ctx.fillText(l, x + 30, top + size * 0.8 + i * lh));
  ctx.restore();
}

async function build() {
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
  try { await Promise.race([document.fonts.load(FONT), new Promise((r) => setTimeout(r, 1200))]); } catch (_) {}

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // colours are authored in the canvas, drawn as is
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const FOV = 38, CAM = 10;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
  camera.position.set(0, 0, 12);

  /* ---- atlas: 4 columns x 8 rows of 512x256 cells; rows 0-1 Broken, 2-3 Confusing, ... ---- */
  const atlas = document.createElement('canvas'); atlas.width = 2048; atlas.height = 2048;
  const actx = atlas.getContext('2d');
  for (let t = 0; t < 4; t++) for (let k = 0; k < 8; k++) { const cell = t * 8 + k; drawCard(actx, (cell % 4) * 512, Math.floor(cell / 4) * 256, t, TEXTS[t][k]); }
  const blankAtlas = document.createElement('canvas'); blankAtlas.width = 2048; blankAtlas.height = 2048;
  const bctx = blankAtlas.getContext('2d');
  for (let t = 0; t < 4; t++) for (let k = 0; k < 8; k++) { const cell = t * 8 + k; drawCard(bctx, (cell % 4) * 512, Math.floor(cell / 4) * 256, t, null); }
  const blankTex = new THREE.CanvasTexture(blankAtlas);
  blankTex.premultiplyAlpha = true; blankTex.colorSpace = THREE.LinearSRGBColorSpace; blankTex.anisotropy = 4;
  const atlasTex = new THREE.CanvasTexture(atlas);
  atlasTex.premultiplyAlpha = true; atlasTex.colorSpace = THREE.LinearSRGBColorSpace; atlasTex.anisotropy = 4;

  /* ---- the crowd: one instanced draw ---- */
  const rnd = (() => { let s = 0x9e3779b9; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; })();
  const cards = [];
  COUNTS.forEach((n, t) => { for (let i = 0; i < n; i++) cards.push({ t, k: Math.floor(rnd() * 8), seed: [rnd(), rnd(), rnd(), rnd()] }); });
  // chaos positions fill the whole view at every depth
  const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2)), ASPECT0 = 1.7;
  cards.forEach((c) => {
    const z = -16 + Math.pow(rnd(), 0.8) * 19.5, d = 11 - z;
    c.chaos = [(rnd() * 2 - 1) * TAN * d * ASPECT0 * 1.05, (rnd() * 2 - 1) * TAN * d * 1.1, z];
  });
  cards.sort((a, b) => a.chaos[2] - b.chaos[2]); // back to front: draw order is correct in both phases
  const byType = [[], [], [], []];
  cards.forEach((c, i) => byType[c.t].push(i));
  byType.forEach((list) => list.forEach((idx, j) => { cards[idx].slot = list.length - 1 - j; })); // nearest chaos z -> front of its lane

  // the first rows of every lane are all different cards; repeats only happen deeper, blurred
  byType.forEach((list, t) => {
    const perm = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => rnd() - 0.5);
    list.forEach((idx) => { const c = cards[idx]; c.k = c.slot < 8 ? perm[c.slot] : perm[(c.slot * 3 + 1) % 8]; });
  });

  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
  geo.instanceCount = N;
  const aChaos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  const aLane = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  const aSeed = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
  const aUV = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
  const aBlank = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  cards.forEach((c, i) => { aBlank.array[i] = c.slot >= 5 ? 1 : 0; });
  cards.forEach((c, i) => {
    aChaos.set(c.chaos, i * 3); aSeed.set(c.seed, i * 4);
    const cell = c.t * 8 + c.k, col = cell % 4, row = Math.floor(cell / 4);
    aUV.set([col / 4, 1 - (row + 1) / 8, 1 / 4, 1 / 8], i * 4);
  });
  geo.setAttribute('aChaos', aChaos); geo.setAttribute('aLane', aLane); geo.setAttribute('aSeed', aSeed); geo.setAttribute('aUV', aUV); geo.setAttribute('aBlank', aBlank);

  const U = { uP: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 }, uFocus: { value: 12 }, uCard: { value: new THREE.Vector2(2.2, 1.1) }, uMap: { value: atlasTex }, uBlank: { value: blankTex } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: false, premultipliedAlpha: true,
    vertexShader: `
      attribute vec3 aChaos, aLane; attribute vec4 aSeed, aUV; attribute float aBlank;
      uniform float uP, uTime, uFade, uFocus; uniform vec2 uCard;
      varying vec2 vUv; varying float vA, vBias, vDim, vBl;
      void main(){
        float s = aSeed.x;
        float u = smoothstep(0.30 + s * 0.17, 0.60 + s * 0.12, uP);
        vec3 drift = vec3(sin(uTime * 0.23 * (0.5 + aSeed.y) + aSeed.z * 6.283), cos(uTime * 0.19 * (0.5 + aSeed.w) + aSeed.z * 5.1) * 0.8, sin(uTime * 0.15 + aSeed.y * 6.283) * 0.7) * (1.0 - u) * 0.75;
        vec3 pos = mix(aChaos + drift, aLane, u);
        float arc = sin(u * 3.14159);
        pos.z += arc * (1.2 + aSeed.y * 2.2); pos.x += arc * (aSeed.w - 0.5) * 3.0;
        float rz = mix((aSeed.z - 0.5) * 0.8, 0.0, u), ry = mix((aSeed.w - 0.5) * 1.3, 0.0, u) + arc * 0.25;
        vec3 l = vec3(position.xy * uCard, 0.0);
        float cz = cos(rz), sz = sin(rz), cy = cos(ry), sy = sin(ry);
        l = vec3(l.x * cz - l.y * sz, l.x * sz + l.y * cz, 0.0);
        l = vec3(l.x * cy, l.y, -l.x * sy);
        vec4 mv = modelViewMatrix * vec4(pos + l, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z, blur = clamp(abs(d - uFocus) / 5.5, 0.0, 1.0);
        float fog = smoothstep(uFocus + 3.0, uFocus + 17.0, d), near = smoothstep(1.2, 4.5, d);
        vBias = blur * blur * 4.0;
        vA = (1.0 - fog * 0.92) * (1.0 - blur * 0.3) * near * uFade * (0.82 + 0.18 * u);
        vDim = mix(1.0, 0.5, max(fog, blur * 0.7)) * mix(0.6, 1.0, u);
        vBl = aBlank * smoothstep(0.35, 0.65, uP);
        vA *= 1.0 - 0.55 * vBl;
        vUv = aUV.xy + uv * aUV.zw;
      }`,
    fragmentShader: `
      uniform sampler2D uMap, uBlank; varying vec2 vUv; varying float vA, vBias, vDim, vBl;
      void main(){ vec4 c = mix(texture2D(uMap, vUv, vBias), texture2D(uBlank, vUv, vBias + 1.5), vBl); c.rgb *= vDim; c *= vA; if (c.a < 0.003) discard; gl_FragColor = c; }`,
  });
  const crowd = new THREE.Mesh(geo, mat); crowd.frustumCulled = false; crowd.renderOrder = 0;
  scene.add(crowd);

  /* ---- you: a separate, glowing card ---- */
  const rCanvas = document.createElement('canvas'); rCanvas.width = 768; rCanvas.height = 512;
  const rctx = rCanvas.getContext('2d');
  const rTex = new THREE.CanvasTexture(rCanvas); rTex.colorSpace = THREE.LinearSRGBColorSpace; rTex.premultiplyAlpha = true; rTex.anisotropy = 4;
  let rType = 0;
  function drawR() {
    const h = HS(), text = h ? h.getR() : 'The export button does nothing.';
    rType = h ? h.guessType(text) : 0;
    rctx.clearRect(0, 0, 768, 512);
    rctx.save();
    rctx.shadowColor = 'rgba(45,212,191,0.95)'; rctx.shadowBlur = 54; rctx.fillStyle = '#fff';
    rr(rctx, 128 + 18, 128 + 14, 476, 196, 34); rctx.fill(); rctx.restore();
    rctx.save(); rctx.shadowColor = 'rgba(45,212,191,0.7)'; rctx.shadowBlur = 22; rr(rctx, 128 + 18, 128 + 14, 476, 196, 34); rctx.fill(); rctx.restore();
    drawCard(rctx, 128, 128, rType, text, { fill: '#ffffff', stroke: '#2dd4bf', fit: true, tailLeft: true });
    // "you" tag
    rctx.save(); rctx.translate(128, 128);
    rctx.font = '800 22px Figtree, system-ui, sans-serif';
    const tw = rctx.measureText('you').width + 28;
    rctx.fillStyle = '#0b5e57'; rr(rctx, 18 + 476 - tw - 22, 14 + 24, tw, 36, 18); rctx.fill();
    rctx.fillStyle = '#2dd4bf'; rctx.textBaseline = 'middle'; rctx.fillText('you', 18 + 476 - tw - 22 + 14, 14 + 43);
    rctx.restore();
    rTex.needsUpdate = true;
  }
  drawR();
  const rMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: rTex, transparent: true, depthWrite: false, depthTest: false, premultipliedAlpha: true, toneMapped: false }));
  rMesh.renderOrder = 3; rMesh.frustumCulled = false; scene.add(rMesh);
  // soft halo behind it
  const halo = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(45,212,191,0.55)'); g.addColorStop(0.5, 'rgba(45,212,191,0.16)'); g.addColorStop(1, 'rgba(45,212,191,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.LinearSRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.renderOrder = 2; m.frustumCulled = false; scene.add(m); return m;
  })();
  addEventListener('heresay:report', drawR);

  /* ---- layout: lanes in world units, derived from the viewport so DOM labels line up ---- */
  const L = { W: 1, H: 1, visW: 1, visH: 1, cardW: 2, cardH: 1, laneX: [0, 0, 0, 0], rowY: [0, 0, 0, 0, 0], pxTop: 0 };
  const toWorldY = (py) => (L.H / 2 - py) / L.H * L.visH;
  function layout() {
    const W = Math.max(2, host.clientWidth), H = Math.max(2, host.clientHeight);
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    L.W = W; L.H = H; L.visH = 2 * CAM * TAN; L.visW = L.visH * (W / H);
    L.cardW = L.visW * 0.205; L.cardH = L.cardW / 2;
    U.uCard.value.set(L.cardW, L.cardH);
    const pitch = L.cardH * 0.7, cardPxH = L.cardH / L.visH * H;
    L.pxTop = clamp(0.405 * H, 292, 380);
    const rowPx = L.pxTop - cardPxH * 0.5;
    for (let r = 0; r < 5; r++) L.rowY[r] = toWorldY(L.pxTop + r * pitch / L.visH * H);
    for (let k = 0; k < 4; k++) L.laneX[k] = (k - 1.5) * L.visW * 0.245;
    sec.style.setProperty('--lane-top', Math.round(rowPx - 44) + 'px');
    const la = aLane.array;
    cards.forEach((c, i) => {
      const layer = Math.floor(c.slot / 5), row = c.slot % 5, j = layer > 0 ? 1 : 0;
      const jx = (c.seed[2] - 0.5) * L.cardW * 0.26 * Math.min(layer, 2) * j, jy = (c.seed[3] - 0.5) * L.cardH * 0.4 * j;
      la[i * 3] = L.laneX[c.t] + jx;
      la[i * 3 + 1] = L.rowY[row] + jy + layer * L.cardH * 0.05;
      la[i * 3 + 2] = -Math.min(layer, 6) * 1.7 - Math.max(0, layer - 6) * 0.4 - (layer ? c.seed[0] * 0.3 : 0);
    });
    aLane.needsUpdate = true;
  }
  new ResizeObserver(layout).observe(host); layout();

  /* ---- input ---- */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => { mouse.tx = (e.clientX / innerWidth) * 2 - 1; mouse.ty = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });

  /* ---- frame ---- */
  let running = false, raf = 0, last = 0, p = want, onScreen = true;
  const clock0 = performance.now();
  const e3 = (t) => t * t * (3 - 2 * t);
  function frame(now) {
    raf = 0; if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!root.classList.contains('hall-3d')) return;
    const dt = clamp((now - last) / 1000, 0.001, 0.05); last = now;
    p += (want - p) * (1 - Math.exp(-dt * 9)); if (Math.abs(want - p) < 0.0004) p = want;
    const t = (now - clock0) / 1000;
    U.uP.value = p; U.uTime.value = t;
    U.uFade.value = 1 - smooth(0.82, 0.96, p);

    // camera: slow push during the chaos, still in the lanes, with a little mouse parallax
    mouse.x += (mouse.tx - mouse.x) * (1 - Math.exp(-dt * 3)); mouse.y += (mouse.ty - mouse.y) * (1 - Math.exp(-dt * 3));
    const calm = 1 - 0.85 * smooth(0.45, 0.62, p);
    const cz = lerp(12.5, CAM, smooth(0, 0.5, p));
    camera.position.set(mouse.x * 0.8 * calm, -mouse.y * 0.5 * calm, cz);
    camera.lookAt(mouse.x * 0.5 * calm, -mouse.y * 0.3 * calm, 0);
    U.uFocus.value = cz;

    // R: chaos -> its lane -> toward the camera
    const cw = L.cardW, ch = L.cardH;
    const ux = smooth(0.34, 0.66, p), uy = smooth(0.8, 0.99, p);
    const chaosR = [-L.visW * 0.12 + Math.sin(t * 0.35) * 0.35, L.visH * 0.06 + Math.cos(t * 0.3) * 0.3, 3.2 + Math.sin(t * 0.2) * 0.3];
    const laneR = [L.laneX[rType], L.rowY[1], 0.05];
    const arc = Math.sin(ux * Math.PI);
    let x = lerp(chaosR[0], laneR[0], ux), y = lerp(chaosR[1], laneR[1], ux), z = lerp(chaosR[2], laneR[2], ux) + arc * 1.6;
    let sc = lerp(1.18, 1.08, ux);
    const hy = Math.sin(uy * Math.PI);
    x = lerp(x, 0, e3(uy)); y = lerp(y, toWorldY(L.H * 0.5) - 0.05, e3(uy)); z = lerp(z, 4.6, e3(uy)) + hy * 0.6; sc = lerp(sc, 1.05, e3(uy));
    rMesh.position.set(x, y, z);
    rMesh.rotation.set(lerp(0, 0, ux), lerp(-0.35 + Math.sin(t * 0.4) * 0.08, 0, ux) * (1 - uy), lerp(0.08 + Math.sin(t * 0.3) * 0.03, 0, ux));
    rMesh.scale.set(cw * 1.5 * sc, ch * 2 * sc, 1);
    const pulse = 0.82 + 0.18 * Math.sin(t * 2.2);
    halo.position.set(x, y, z - 0.05); halo.scale.set(cw * 3.2 * sc * (0.95 + 0.05 * pulse), ch * 4.6 * sc * (0.95 + 0.05 * pulse), 1);
    halo.material.opacity = pulse * (1 - 0.7 * smooth(0.55, 0.8, p)) * (1 - smooth(0.9, 1, p) * 0.4);

    renderer.render(scene, camera);
  }
  function start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  const sync = () => (onScreen && !document.hidden ? start() : stop());
  new IntersectionObserver((es) => { onScreen = es[es.length - 1].isIntersecting; sync(); }, { rootMargin: '10% 0px' }).observe(sec);
  document.addEventListener('visibilitychange', sync);
  sync();
  return { wake() { if (!running && onScreen && !document.hidden) start(); }, renderer };
}

if (sec && host && root.classList.contains('hall-3d')) {
  const io = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    io.disconnect();
    build().then((i) => { inst = i; }).catch(fail);
  }, { rootMargin: '150% 0px' });
  io.observe(sec);
}
