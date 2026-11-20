/* =========================================================
   Motor 3D del plano (Three.js) — optimizado para fluidez
   - se dibuja solo cuando algo cambia (no 60 veces por segundo en reposo)
   - sombras calculadas una vez y solo cuando cambia la altura de un lote
   - selección del lote por cuadrícula 2D (no recorre 80.000 triángulos)
   - contornos y números en geometría fija: al filtrar solo cambian colores
   ========================================================= */
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const H = 2.2;              // altura de los lotes disponibles
const HS = 0.75;            // altura de los vendidos (quedan "asentados")
const HIDE = -6;            // los contornos que no se usan se esconden bajo el terreno
const AZ = -0.35;           // giro de la cámara por defecto (norte del plano arriba)
const POL = 0.75;           // inclinación de la vista general (≈43° desde la vertical)
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;  // respeta "reducir movimiento"
let R = null;
const tmpC = new THREE.Color(), tmpE = new THREE.Color(), tmpR = new THREE.Color();

const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const req = () => { if (R) R.dirty = true; };

function build(geo, pid) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;            // sombras estáticas
  const labelR = new CSS2DRenderer(); labelR.domElement.className = 'lbls';
  const scene = new THREE.Scene();
  const bg = new THREE.Color(css('--bg') || '#0f1114'); scene.fog = new THREE.Fog(bg, 2600, 6000);
  const camera = new THREE.PerspectiveCamera(32, 1, 2, 12000);
  // navegación tipo mapa: arrastrar mueve, clic derecho gira, rueda acerca hacia el cursor
  const controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .12; controls.maxPolarAngle = Math.PI * 0.44;
  controls.minDistance = 35; controls.maxDistance = 4200; controls.screenSpacePanning = false; controls.zoomToCursor = true;
  controls.rotateSpeed = .5; controls.zoomSpeed = 1.15; controls.panSpeed = 1; controls.keyPanSpeed = 40;
  renderer.domElement.tabIndex = 0; controls.listenToKeyEvents(renderer.domElement);

  const cx = geo.w / 2, cz = geo.h / 2;
  const world = new THREE.Group(); world.position.set(-cx, 0, -cz); scene.add(world);

  // luz (sol de tarde, sombras largas)
  const hemi = new THREE.HemisphereLight(0xf4ecdc, 0x16140f, 0.8); scene.add(hemi);
  let site = null, rim = null, gm = null, crown = null;
  const sun = new THREE.DirectionalLight(0xffe4bc, 2.1); sun.position.set(-950, 1000, 800); sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096); const sc = sun.shadow.camera; sc.left = -1000; sc.right = 1000; sc.top = 1000; sc.bottom = -1000; sc.near = 200; sc.far = 3200;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6; scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fb4c8, 0.35); fill.position.set(900, 600, -700); scene.add(fill);

  // cielo (degradado en un lienzo; el ambiente elegido lo repinta)
  const skyCv = document.createElement('canvas'); skyCv.width = 2; skyCv.height = 256;
  const skyTx = new THREE.CanvasTexture(skyCv); skyTx.colorSpace = THREE.SRGBColorSpace; scene.background = skyTx;
  // terreno
  const ground = new THREE.Mesh(new THREE.CircleGeometry(5200, 48), new THREE.MeshStandardMaterial({ color: new THREE.Color(css('--ground') || '#1a211d'), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.4; ground.receiveShadow = true; scene.add(ground);
  const toShape = r => new THREE.Shape(r.map(p => new THREE.Vector2(p[0], -p[1])));
  if (geo.sitio) { const sg = new THREE.ShapeGeometry(toShape(geo.sitio)); sg.rotateX(-Math.PI / 2);
    site = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: new THREE.Color(css('--grass') || '#1f2a22'), roughness: 1 })); site.position.y = -0.2; site.receiveShadow = true; world.add(site);
    rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(geo.sitio.map(p => new THREE.Vector3(p[0], 0.3, p[1]))), new THREE.LineBasicMaterial({ color: new THREE.Color(css('--accent') || '#999'), transparent: true, opacity: .45 })); world.add(rim); }
  if (geo.verdes && geo.verdes.length) { const gg = new THREE.ShapeGeometry(geo.verdes.map(toShape)); gg.rotateX(-Math.PI / 2);
    gm = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: new THREE.Color(css('--grass2') || '#26352a'), roughness: 1 })); gm.position.y = 0.05; gm.receiveShadow = true; world.add(gm); }
  // árboles
  if (geo.arboles && geo.arboles.length) {
    const n = geo.arboles.length, d = new THREE.Object3D();
    crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.4, 0), new THREE.MeshStandardMaterial({ roughness: .85, flatShading: true }), n);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.45, .6, 4, 5), new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 1 }), n);
    const base = new THREE.Color(css('--tree') || '#3f5a36'), c = new THREE.Color();
    geo.arboles.forEach((t, i) => { const s = t[2];
      d.position.set(t[0], 2 * s, t[1]); d.rotation.set(0, i * 1.7, 0); d.scale.set(s, s, s); d.updateMatrix(); trunk.setMatrixAt(i, d.matrix);
      d.position.set(t[0], 5.6 * s, t[1]); d.scale.set(s, s * (1.05 + ((i * 37) % 10) / 40), s); d.updateMatrix(); crown.setMatrixAt(i, d.matrix);
      c.copy(base).offsetHSL(((i * 13) % 10 - 5) / 300, 0, ((i * 7) % 10 - 5) / 90); crown.setColorAt(i, c); });
    crown.castShadow = true; trunk.castShadow = true; world.add(trunk); world.add(crown);
  }
  // vías
  const vShapes = [];
  geo.vias.forEach(rs => { const sh = toShape(rs[0]); for (let i = 1; i < rs.length; i++) sh.holes.push(new THREE.Path(rs[i].map(p => new THREE.Vector2(p[0], -p[1])))); vShapes.push(sh); });
  const vg = new THREE.ShapeGeometry(vShapes); vg.rotateX(-Math.PI / 2);
  const roads = new THREE.Mesh(vg, new THREE.MeshStandardMaterial({ color: new THREE.Color(css('--road') || '#34373a'), roughness: .9 })); roads.position.y = 0.15; roads.receiveShadow = true; world.add(roads);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(vg, 1), new THREE.LineBasicMaterial({ color: 0x6d6a63, transparent: true, opacity: .35 })); edges.position.y = 0.2; world.add(edges);

  // ---- lotes: una sola geometría ----
  const parts = [], starts = [], counts = [], ids = [], cents = [];
  let v = 0;
  geo.lotes.forEach(x => {
    let pts = x.p.map(p => new THREE.Vector2(x.cx + (p[0] - x.cx) * 0.93, -(x.cy + (p[1] - x.cy) * 0.93)));
    if (THREE.ShapeUtils.isClockWise(pts)) pts = pts.reverse();
    const eg = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: H, bevelEnabled: false, curveSegments: 1 }); eg.rotateX(-Math.PI / 2); eg.deleteAttribute('uv');
    const n = eg.attributes.position.count; starts.push(v); counts.push(n); v += n; parts.push(eg);
    ids.push(`${pid}-${x.mz}-${x.n}`); cents.push(new THREE.Vector3(x.cx, H, x.cy));
  });
  const merged = mergeGeometries(parts, false); parts.forEach(p => p.dispose());
  const nrm = merged.attributes.normal.array, shade = new Float32Array(v);
  for (let i = 0; i < v; i++) shade[i] = nrm[i * 3 + 1] > 0.5 ? 1.0 : 0.62;
  const colors = new Float32Array(v * 3); merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: .04 }));
  mesh.castShadow = true; mesh.receiveShadow = true; world.add(mesh);
  const posA = merged.attributes.position.array, top = new Uint8Array(v);
  for (let k = 0; k < v; k++) top[k] = posA[k * 3 + 1] > H * 0.5 ? 1 : 0;

  // ---- contornos (geometría fija; solo cambian colores y alturas) ----
  const bPos = [], rPos = [], bRange = [], rRange = [];
  geo.lotes.forEach(x => {
    const s = x.sp;
    const push = (arr, sc, y) => { for (let j = 0; j < s.length; j++) { const a = s[j], b = s[(j + 1) % s.length];
      arr.push(x.cx + (a[0] - x.cx) * sc, y, x.cy + (a[1] - x.cy) * sc, x.cx + (b[0] - x.cx) * sc, y, x.cy + (b[1] - x.cy) * sc); } };
    bRange.push([bPos.length / 6, s.length]); push(bPos, 0.93, H + 0.04);
    rRange.push([rPos.length / 6, s.length]); push(rPos, 0.86, HIDE);
  });
  const baseMat = new LineMaterial({ linewidth: 0.9, vertexColors: true, transparent: true, opacity: .55 });
  const ringMat = new LineMaterial({ linewidth: 2.6, vertexColors: true, transparent: true, opacity: .95 });
  const mkLines = (P, m) => { const g = new LineSegmentsGeometry(); g.setPositions(P); g.setColors(new Float32Array(P.length)); const o = new LineSegments2(g, m); o.frustumCulled = false; world.add(o); return o; };
  const baseLines = mkLines(bPos, baseMat), rings = mkLines(rPos, ringMat);

  // ---- números de lote (una textura con todos los números, un rectángulo por lote) ----
  const maxN = Math.max(...geo.lotes.map(x => x.n));
  const cols = 16, cell = 64, rowsN = Math.ceil(maxN / cols);
  const cv = document.createElement('canvas'); cv.width = cols * cell; cv.height = rowsN * cell;
  const c2 = cv.getContext('2d'); c2.textAlign = 'center'; c2.textBaseline = 'middle';
  for (let n = 1; n <= maxN; n++) { const col = (n - 1) % cols, row = Math.floor((n - 1) / cols);
    c2.font = `700 ${n > 99 ? 30 : 38}px "Helvetica Neue", Helvetica, Arial, sans-serif`; c2.fillStyle = '#111111'; c2.fillText(String(n), col * cell + cell / 2, row * cell + cell / 2 + 2); }
  const ntex = new THREE.CanvasTexture(cv); ntex.colorSpace = THREE.SRGBColorSpace; ntex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // orientación del texto: "arriba" apunta hacia donde mira la cámara por defecto
  const ux = -Math.sin(AZ), uz = -Math.cos(AZ);   // arriba en pantalla
  const rx = -uz, rz = ux;                         // derecha en pantalla
  const nPos = new Float32Array(geo.lotes.length * 12), nUv = new Float32Array(geo.lotes.length * 8), nIdx = [];
  geo.lotes.forEach((x, i) => {
    const s = x.sp; let per = 0; for (let j = 0; j < s.length; j++) { const a = s[j], b = s[(j + 1) % s.length]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    let area = 0; for (let j = 0; j < x.p.length; j++) { const a = x.p[j], b = x.p[(j + 1) % x.p.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const w = Math.abs(area / 2) / (per / 2); const sz = Math.max(3, Math.min(8.5, w * 0.85)) / 2;
    const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
    corners.forEach(([a, b], k) => { nPos[i * 12 + k * 3] = x.cx + (a * rx + b * ux) * sz; nPos[i * 12 + k * 3 + 1] = H + 0.1; nPos[i * 12 + k * 3 + 2] = x.cy + (a * rz + b * uz) * sz; });
    const col = (x.n - 1) % cols, row = Math.floor((x.n - 1) / cols);
    const u0 = col / cols, u1 = (col + 1) / cols, v1 = 1 - row / rowsN, v0 = 1 - (row + 1) / rowsN;
    nUv.set([u0, v1, u1, v1, u1, v0, u0, v0], i * 8);
    const o = i * 4; nIdx.push(o, o + 2, o + 1, o, o + 3, o + 2);
  });
  const ngeo = new THREE.BufferGeometry(); ngeo.setAttribute('position', new THREE.BufferAttribute(nPos, 3)); ngeo.setAttribute('uv', new THREE.BufferAttribute(nUv, 2)); ngeo.setIndex(nIdx);
  const nmat = new THREE.MeshBasicMaterial({ map: ntex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
  const numbers = new THREE.Mesh(ngeo, nmat); numbers.frustumCulled = false; numbers.renderOrder = 2; world.add(numbers);

  // ---- cuadrícula para encontrar el lote bajo el mouse ----
  const CELL = 24, grid = new Map();
  geo.lotes.forEach((x, i) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; x.p.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++) { const k = gx + ':' + gy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); } });

  // etiquetas de manzana
  const labels = [];
  geo.manzanas.forEach(m => { const d = document.createElement('div'); d.className = 'mz3'; d.textContent = 'Mz ' + m.t; const o = new CSS2DObject(d); o.position.set(m.x, H + 6, m.y); world.add(o); labels.push(o); });
  const dims = new THREE.Group(); world.add(dims);

  // resaltados
  const hl = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: .25, transparent: true, opacity: .32, depthWrite: false })); hl.visible = false; world.add(hl);
  const sel = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: .55, transparent: true, opacity: .7, roughness: .35, metalness: .3 })); sel.visible = false; world.add(sel);
  const selMat2 = new LineMaterial({ linewidth: 3.4, color: 0xffffff, transparent: true, depthTest: false });
  const selLine = new LineSegments2(new LineSegmentsGeometry(), selMat2); selLine.visible = false; selLine.renderOrder = 5; world.add(selLine);
  const ring = new THREE.Mesh(new THREE.RingGeometry(9, 11, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; world.add(ring);

  R = { geo, pid, renderer, labelR, scene, camera, controls, world, mesh, colors, shade, starts, counts, top, ids, cents,
    lotH: new Float32Array(ids.length).fill(H), lotT: new Float32Array(ids.length).fill(H), ringOn: new Uint8Array(ids.length),
    animH: new Set(), painted: false, baseLines, rings, bRange, rRange, baseMat, ringMat, numbers, nmat, grid, CELL,
    labels, dims, hl, sel, selLine, selMat2, ring, hlIdx: -1, selIdx: -1, anim: null, running: false, ro: null, cb: null, el: null,
    ray: new THREE.Raycaster(), ptr: new THREE.Vector2(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -H * 0.6), hit: new THREE.Vector3(),
    down: null, dirty: true, lastDist: -1, lblMode: '', idIndex: Object.fromEntries(ids.map((id, i) => [id, i])) };
  // área real de lotes (para encuadrar y limitar el paseo)
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  geo.lotes.forEach(x => x.p.forEach(p => { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]); }));
  R.box = [bx0, by0, bx1, by1];
  // contorno real (envolvente convexa de los lotes): encuadra la forma, no el rectángulo
  { const P = []; geo.lotes.forEach(x => x.p.forEach(p => P.push(p))); P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], hi = [];
    for (const p of P) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    R.hull = lo.slice(0, -1).concat(hi.slice(0, -1)); }
  R.env = { hemi, sun, fill, ground, site, rim, gm, roads, edges, crown, skyCv, skyTx, treeBase: (geo.arboles || []).length };
  R.dprHi = Math.min(devicePixelRatio, 1.5); R.dprLo = Math.min(1, R.dprHi);
  applyTheme3();
  setEscena(leerEscena());

  const dom = renderer.domElement;
  /* zoom suave hacia el cursor (como Google Maps): cada giro de la rueda fija un destino
     y la cámara se desliza hacia él; varios giros seguidos se acumulan sin saltos */
  controls.enableZoom = false;
  dom.addEventListener('wheel', e => {
    e.preventDefault(); R.anim = null; R.cb && R.cb.user && R.cb.user();
    const r = dom.getBoundingClientRect();
    R.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    R.ray.setFromCamera(R.ptr, R.camera);
    const p = new THREE.Vector3(); if (!R.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return;
    const base = R.zg || { pos: R.camera.position.clone(), target: R.controls.target.clone() };
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    let f = Math.exp(THREE.MathUtils.clamp(dy, -240, 240) * 0.0021);
    const d0 = base.pos.distanceTo(base.target);
    f = THREE.MathUtils.clamp(d0 * f, R.controls.minDistance, R.controls.maxDistance) / d0;
    R.zg = { pos: p.clone().add(base.pos.clone().sub(p).multiplyScalar(f)), target: p.clone().add(base.target.clone().sub(p).multiplyScalar(f)) };
    R.zg.target.y = 0; req();
  }, { passive: false });
  dom.addEventListener('dblclick', e => {
    const i = pick(e); if (i >= 0) { R.cb && R.cb.dbl && R.cb.dbl(R.ids[i]); return; }
    R.ray.setFromCamera(R.ptr, R.camera); const p = new THREE.Vector3(); if (!R.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return;
    const off = R.camera.position.clone().sub(R.controls.target).multiplyScalar(0.45);
    fly({ pos: p.clone().add(off), target: p }, 700);
  });
  controls.addEventListener('change', req);
  controls.addEventListener('start', () => { R.anim = null; R.cb && R.cb.user && R.cb.user(); });
  dom.addEventListener('pointerdown', e => { R.down = { x: e.clientX, y: e.clientY }; });
  dom.addEventListener('pointermove', e => { R.lastMove = e; if (!R.pending) { R.pending = true; requestAnimationFrame(() => { R.pending = false; hover(R.lastMove); }); } });
  dom.addEventListener('pointerleave', () => { setHover(-1); R.cb && R.cb.hover(null); });
  dom.addEventListener('pointerup', e => { if (!R.down) return; const m = Math.hypot(e.clientX - R.down.x, e.clientY - R.down.y); R.down = null; if (m > 5 || e.button !== 0) return; const i = pick(e); if (i >= 0) R.cb && R.cb.click(R.ids[i]); });
}

/* ---- utilidades de geometría ---- */
function inPoly(px, py, p) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if (((a[1] > py) !== (b[1] > py)) && (px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
function pick(e) {
  const r = R.renderer.domElement.getBoundingClientRect();
  R.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  R.ray.setFromCamera(R.ptr, R.camera);
  if (!R.ray.ray.intersectPlane(R.plane, R.hit)) return -1;
  const lx = R.hit.x + R.geo.w / 2, ly = R.hit.z + R.geo.h / 2;
  const cand = R.grid.get(Math.floor(lx / R.CELL) + ':' + Math.floor(ly / R.CELL)); if (!cand) return -1;
  for (const i of cand) if (inPoly(lx, ly, R.geo.lotes[i].p)) return i;
  return -1;
}
function lotGeom(i, depth, scale = 0.93) {
  const x = R.geo.lotes[i];
  let pts = x.p.map(p => new THREE.Vector2(x.cx + (p[0] - x.cx) * scale, -(x.cy + (p[1] - x.cy) * scale)));
  if (THREE.ShapeUtils.isClockWise(pts)) pts = pts.reverse();
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth, bevelEnabled: false, curveSegments: 1 }); g.rotateX(-Math.PI / 2); return g;
}
function hover(e) { if (!R || R.down) return; const i = pick(e); setHover(i); R.renderer.domElement.style.cursor = i >= 0 ? 'pointer' : 'grab'; R.cb && R.cb.hover(i >= 0 ? R.ids[i] : null, e); }
function setHover(i) {
  if (i === R.hlIdx) return; R.hlIdx = i;
  if (i < 0) { R.hl.visible = false; req(); return; }
  R.hl.geometry.dispose(); R.hl.geometry = lotGeom(i, R.lotH[i] + 1.0, 0.95); R.hl.visible = true; req();
}

/* ---- alturas, contornos y números de un lote ---- */
function setHeight(i, h) {
  R.lotH[i] = h;
  const pos = R.mesh.geometry.attributes.position.array, s0 = R.starts[i];
  for (let k = s0; k < s0 + R.counts[i]; k++) if (R.top[k]) pos[k * 3 + 1] = h;
  const bp = R.baseLines.geometry.attributes.instanceStart.data.array;
  const [b0, bn] = R.bRange[i]; for (let s = b0; s < b0 + bn; s++) { bp[s * 6 + 1] = h + 0.04; bp[s * 6 + 4] = h + 0.04; }
  setRingY(i);
  const np = R.numbers.geometry.attributes.position.array; for (let k = 0; k < 4; k++) np[i * 12 + k * 3 + 1] = h + 0.1;
}
function setRingY(i) {
  const rp = R.rings.geometry.attributes.instanceStart.data.array; const y = R.ringOn[i] ? R.lotH[i] + 0.08 : HIDE;
  const [r0, rn] = R.rRange[i]; for (let s = r0; s < r0 + rn; s++) { rp[s * 6 + 1] = y; rp[s * 6 + 4] = y; }
}
function flushGeom(pos) {
  if (pos) { R.mesh.geometry.attributes.position.needsUpdate = true; R.numbers.geometry.attributes.position.needsUpdate = true; R.baseLines.geometry.attributes.instanceStart.data.needsUpdate = true; }
  R.rings.geometry.attributes.instanceStart.data.needsUpdate = true;
}

/* ---- pintar: solo colores y estados, sin rehacer geometría ---- */
function paint() {
  if (!R || !R.cb) return;
  const { colors, shade, starts, counts, ids, geo, lotT } = R; const bg = new THREE.Color(R.esc ? R.esc.fog : (css('--bg') || '#111'));
  const bc = R.baseLines.geometry.attributes.instanceColorStart.data.array, rc = R.rings.geometry.attributes.instanceColorStart.data.array;
  let posChanged = false;
  for (let i = 0; i < ids.length; i++) {
    const p = R.cb.paint(ids[i], i, geo.lotes[i]);
    const dk = p.dim === true ? 0.8 : (+p.dim || 0);
    const h = p.low ? HS : H;
    if (lotT[i] !== h) { lotT[i] = h; if (R.painted) R.animH.add(i); else { setHeight(i, h); posChanged = true; } }
    tmpC.setStyle(R.esc && R.esc.lot ? R.esc.lot : p.c); if (dk) tmpC.lerp(bg, dk);
    const s0 = starts[i], n = counts[i];
    for (let k = s0; k < s0 + n; k++) { const f = shade[k]; colors[k * 3] = tmpC.r * f; colors[k * 3 + 1] = tmpC.g * f; colors[k * 3 + 2] = tmpC.b * f; }
    tmpE.copy(tmpC).multiplyScalar(0.55);
    const [b0, bn] = R.bRange[i]; for (let s = b0; s < b0 + bn; s++) bc.set([tmpE.r, tmpE.g, tmpE.b, tmpE.r, tmpE.g, tmpE.b], s * 6);
    const on = p.ring ? 1 : 0;
    if (on) { tmpR.setStyle(p.ring); if (dk) tmpR.lerp(bg, dk); const [r0, rn] = R.rRange[i]; for (let s = r0; s < r0 + rn; s++) rc.set([tmpR.r, tmpR.g, tmpR.b, tmpR.r, tmpR.g, tmpR.b], s * 6); }
    if (R.ringOn[i] !== on) { R.ringOn[i] = on; setRingY(i); }
  }
  R.mesh.geometry.attributes.color.needsUpdate = true;
  R.baseLines.geometry.attributes.instanceColorStart.data.needsUpdate = true;
  R.rings.geometry.attributes.instanceColorStart.data.needsUpdate = true;
  flushGeom(posChanged);
  if (!R.painted || posChanged) R.renderer.shadowMap.needsUpdate = true;
  R.painted = true;
  const sec = R.sector;
  R.labels.forEach((o, j) => { const m = geo.manzanas[j]; o.userData.inS = sec == null || geo.sectorOf[m.t] === sec; });
  R.lblMode = ''; req();
}

/* ---- selección ---- */
function select(id) {
  if (!R) return; const i = id != null && R.idIndex[id] !== undefined ? R.idIndex[id] : -1;
  if (i === R.selIdx) return; R.selIdx = i;
  if (i < 0) { R.sel.visible = false; R.selLine.visible = false; R.ring.visible = false; clearDims(); req(); return; }
  buildSel(i); R.selT0 = performance.now(); R.selSettled = false;
  const c = R.cents[i]; R.ring.position.set(c.x, 0.6, c.z); R.ring.visible = true;
  buildDims(i); req();
}
function buildSel(i) {
  const lift = R.lotH[i] + 2.4;
  R.sel.geometry.dispose(); R.sel.geometry = lotGeom(i, lift, 0.95); R.sel.visible = true;
  const x = R.geo.lotes[i], s = x.sp, P = [], sc = 0.95;
  for (const y of [lift + 0.05, 0.2]) for (let j = 0; j < s.length; j++) { const a = s[j], b = s[(j + 1) % s.length];
    P.push(x.cx + (a[0] - x.cx) * sc, y, x.cy + (a[1] - x.cy) * sc, x.cx + (b[0] - x.cx) * sc, y, x.cy + (b[1] - x.cy) * sc); }
  const g = new LineSegmentsGeometry(); g.setPositions(P); R.selLine.geometry.dispose(); R.selLine.geometry = g; R.selLine.visible = true;
}
function clearDims() { while (R.dims.children.length) { const o = R.dims.children.pop(); if (o.geometry) o.geometry.dispose(); if (o.element) o.element.remove(); } }
function buildDims(i) {
  clearDims(); if (i < 0) return;
  const x = R.geo.lotes[i]; const md = medidasLote(x, R.geo); const y = H + 3.6, off = 3.2, tick = 1.6; const pos = [];
  md.edges.forEach(e => {
    pos.push(e.a[0] + e.nx * off, y, e.a[1] + e.ny * off, e.b[0] + e.nx * off, y, e.b[1] + e.ny * off);
    pos.push(e.a[0] + e.nx * .6, y, e.a[1] + e.ny * .6, e.a[0] + e.nx * (off + tick), y, e.a[1] + e.ny * (off + tick));
    pos.push(e.b[0] + e.nx * .6, y, e.b[1] + e.ny * .6, e.b[0] + e.nx * (off + tick), y, e.b[1] + e.ny * (off + tick));
    const d = document.createElement('div'); d.className = 'dim3'; d.textContent = fmtMts(e.m);
    const o = new CSS2DObject(d); o.position.set(e.mx + e.nx * (off + 4.5), y, e.my + e.ny * (off + 4.5)); R.dims.add(o);
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  R.dims.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(css('--accent2') || '#fff'), depthTest: false, transparent: true })));
  R.lastDist = -1;
}
function pulse(id) { const i = R ? R.idIndex[id] : undefined; if (i === undefined) return; R.pulseT = performance.now(); const c = R.cents[i]; R.ring.position.set(c.x, 0.6, c.z); R.ring.visible = true; req(); }

/* ---- ambientes de fondo: cielo, terreno, pasto, vías, árboles y luz ---- */
export const ESCENAS = {
  nocturno:  { nombre: 'Nocturno',  sky: ['#1d1a17', '#0d0c0b'], fog: '#0d0c0b', ground: '#12120f', grass: '#1e2219', grass2: '#283020', road: '#2f2c28', edge: '#6d6a63', tree: '#4a5a35',
               hemi: [0xf4ecdc, 0x16140f, 0.8], sun: [0xffe4bc, 2.1], fill: 0.35, exp: 1.05 },
  atardecer: { nombre: 'Atardecer', sky: ['#2c2a3d', '#c98a5c'], fog: '#5a4436', ground: '#3a3122', grass: '#4b5130', grass2: '#58603a', road: '#3b342c', edge: '#b39a76', tree: '#55693a',
               hemi: [0xffd7ad, 0x2a2016, 0.85], sun: [0xffb36b, 2.5], fill: 0.3, exp: 1.08 },
  dia:       { nombre: 'Campo de día', sky: ['#8fb6d3', '#e8eef0'], fog: '#cfdce2', ground: '#6f8350', grass: '#87995f', grass2: '#97ab6c', road: '#5c5953', edge: '#e6e1d6', tree: '#3e6a32',
               hemi: [0xffffff, 0x5d6e44, 1.0], sun: [0xfff3df, 2.6], fill: 0.45, exp: 1.0 },
  maqueta:   { nombre: 'Maqueta blanca', sky: ['#FFFFFF', '#F2F2F4'], fog: '#F2F2F4', ground: '#E9E9EC', grass: '#E3E3E7', grass2: '#D9D9DE', road: '#C9C9CF', edge: '#FFFFFF', tree: '#C4C4CA',
               hemi: [0xffffff, 0xb4b4bc, 1.05], sun: [0xffffff, 1.9], fill: 0.5, exp: 1.3, lot: '#FFFFFF' },
};
function leerEscena() { try { const e = localStorage.getItem('lotecontrol-escena'); if (ESCENAS[e]) return e; } catch (e) {} return 'maqueta'; }
function setEscena(nombre) {
  if (!R || !ESCENAS[nombre]) return; const E = ESCENAS[nombre], v = R.env; R.escena = nombre; R.esc = E;
  const c2 = v.skyCv.getContext('2d'), gr = c2.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, E.sky[0]); gr.addColorStop(.6, E.sky[1]); gr.addColorStop(1, E.sky[1]); c2.fillStyle = gr; c2.fillRect(0, 0, 2, 256); v.skyTx.needsUpdate = true;
  R.scene.fog.color.set(E.fog);
  v.ground.material.color.set(E.ground); v.site && v.site.material.color.set(E.grass); v.gm && v.gm.material.color.set(E.grass2);
  v.roads.material.color.set(E.road); v.edges.material.color.set(E.edge);
  v.hemi.color.setHex(E.hemi[0]); v.hemi.groundColor.setHex(E.hemi[1]); v.hemi.intensity = E.hemi[2];
  v.sun.color.setHex(E.sun[0]); v.sun.intensity = E.sun[1]; v.fill.intensity = E.fill; R.renderer.toneMappingExposure = E.exp;
  if (v.crown) { const base = new THREE.Color(E.tree), c = new THREE.Color();
    for (let i = 0; i < v.treeBase; i++) { c.copy(base).offsetHSL(((i * 13) % 10 - 5) / 300, 0, ((i * 7) % 10 - 5) / 90); v.crown.setColorAt(i, c); } v.crown.instanceColor.needsUpdate = true; }
  try { localStorage.setItem('lotecontrol-escena', nombre); } catch (e) {}
  if (R.painted) paint(); R.renderer.shadowMap.needsUpdate = true; req();
  if (R.el) { R.el.dataset.escena = nombre; R.el.querySelectorAll('[data-esc]').forEach(b => b.classList.toggle('on', b.dataset.esc === nombre)); }
}
function applyTheme3() {
  if (!R) return; const acc = new THREE.Color(css('--accent2') || '#ffffff');
  R.hl.material.color.copy(acc); R.hl.material.emissive.copy(acc);
  R.sel.material.color.copy(acc); R.sel.material.emissive.copy(acc); R.selMat2.color.copy(acc); R.ring.material.color.copy(acc);
  R.scene.fog.color.set(R.esc ? R.esc.fog : (css('--bg') || '#0f1114')); req();
}

/* ---- cámara ----
   Encuadre por proyección: se llevan las 8 esquinas de la caja al espacio de la cámara
   (ya inclinada) y se busca la distancia mínima a la que todas caben, con margen. */
function camFor(minx, minz, maxx, maxz, mode, margin = 1.06, az = AZ, pts = null) {
  const cx = (minx + maxx) / 2 - R.geo.w / 2, cz = (minz + maxz) / 2 - R.geo.h / 2;
  if (!pts) pts = [[minx, minz], [maxx, minz], [maxx, maxz], [minx, maxz]];
  const pol = mode === 'top' ? 0.0001 : POL;
  const dir = new THREE.Vector3(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az)); // del objetivo hacia la cámara
  const f = dir.clone().negate();                                            // hacia donde mira
  const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  if (right.lengthSq() < 1e-6) right.set(Math.cos(az), 0, -Math.sin(az));
  const up = new THREE.Vector3().crossVectors(right, f).normalize();
  // se descuenta la franja superior donde flotan los sectores (≈52 px) para que no tape el plano
  const padPx = 52, hh = R.h || 600, tFull = Math.tan(R.camera.fov * Math.PI / 360);
  const tanY = tFull * (1 - padPx / hh) / margin, tanX = tFull * (R.camera.aspect || 1.6) / margin;
  const yBias = -(padPx / hh) * tFull;   // centro vertical deseado, un poco por debajo del centro de la pantalla
  const t = new THREE.Vector3(cx, 0, cz); const c = new THREE.Vector3();
  const gf = new THREE.Vector3(f.x, 0, f.z); if (gf.lengthSq() < 1e-6) gf.set(-Math.sin(az), 0, -Math.cos(az)); gf.normalize();
  const solve = () => { let d = 10;
    for (const [X, Z] of pts) for (const Y of [0, H]) { c.set(X - R.geo.w / 2, Y, Z - R.geo.h / 2).sub(t); const depth = c.dot(f);
      d = Math.max(d, Math.abs(c.dot(right)) / tanX - depth, Math.abs(c.dot(up)) / tanY - depth); }
    return d; };
  let d = solve();
  // centrar la forma en pantalla: se mide cuánto sobra a cada lado y se corre el objetivo sobre el terreno
  for (let it = 0; it < 3; it++) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [X, Z] of pts) { c.set(X - R.geo.w / 2, 0, Z - R.geo.h / 2).sub(t); const depth = d + c.dot(f);
      const sx = c.dot(right) / depth, sy = c.dot(up) / depth; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - yBias;
    t.addScaledVector(right, mx * d).addScaledVector(gf, my * d / Math.max(0.3, Math.cos(pol)));
    d = solve();
  }
  return { pos: t.clone().addScaledVector(dir, d), target: t, dist: d };
}
function fitAll(ms = 1100) {
  const b = R.box;
  // se elige el giro (±35° alrededor del norte del plano) en el que el condominio se ve más grande
  if (R.homeAz == null) {
    let best = null; for (let a = AZ - 0.6; a <= AZ + 0.601; a += 0.05) { const v = camFor(b[0], b[1], b[2], b[3], '3d', 1.04, a, R.hull); if (!best || v.dist < best.d - 1) best = { a, d: v.dist }; }
    R.homeAz = best.a;
  }
  const v = camFor(b[0], b[1], b[2], b[3], R.mode || '3d', 1.04, R.homeAz, R.hull);
  R.fitDist = v.dist; R.controls.maxDistance = v.dist * 1.7; fly(v, ms); return v;
}
function fly(to, ms = 1100, instant = false) {
  if (RM) ms = 0; R.zg = null;
  if (instant || !ms) { R.camera.position.copy(to.pos); R.controls.target.copy(to.target); R.controls.update(); req(); return; }
  R.anim = { p0: R.camera.position.clone(), t0: R.controls.target.clone(), p1: to.pos, t1: to.target, s: performance.now(), ms }; req();
}
function flyToSector(k, ms = 1100) {
  if (!R) return; R.sector = k;
  if (k == null) { fitAll(ms); paint(); return; }
  const s = R.geo.sectores.find(s => s.id === k); if (!s) return;
  const b = s.bbox; fly(camFor(b[0], b[1], b[2], b[3], R.mode || '3d', 1.08, curAz()), ms); paint();
}
function flyToLot(id, modo) {
  if (!R) return; const i = R.idIndex[id]; if (i === undefined) return; const x = R.geo.lotes[i];
  const k = modo === 'cerca' ? 0.55 : 0.8;
  fly(camFor(x.cx - 170 * k, x.cy - 120 * k, x.cx + 170 * k, x.cy + 120 * k, R.mode || '3d', 1, curAz()), 1000);
}
function flyToBox(x0, y0, x1, y1) { if (R) fly(camFor(x0, y0, x1, y1, R.mode || '3d', 1.05, curAz()), 1000); }
const curAz = () => R ? R.controls.getAzimuthalAngle() : AZ;
function setCam(mode) {
  if (!R) return; R.mode = mode;
  const t = R.controls.target, d = R.camera.position.distanceTo(t); const pol = mode === 'top' ? 0.0001 : POL, az = curAz();
  fly({ pos: new THREE.Vector3(t.x + d * Math.sin(pol) * Math.sin(az), d * Math.cos(pol), t.z + d * Math.sin(pol) * Math.cos(az)), target: t.clone() });
}
/* zoom con botones (+/−) y volver al norte con la brújula */
function zoomBy(f) {
  if (!R) return; const t = R.controls.target.clone(); const off = R.camera.position.clone().sub(t);
  const d = THREE.MathUtils.clamp(off.length() * f, R.controls.minDistance, R.controls.maxDistance);
  fly({ pos: t.clone().add(off.setLength(d)), target: t }, 380);
}
function resetNorth() {
  if (!R) return; const t = R.controls.target.clone(), d = R.camera.position.distanceTo(t), pol = (R.mode === 'top' ? 0.0001 : POL);
  const a = R.homeAz ?? AZ;
  fly({ pos: new THREE.Vector3(t.x + d * Math.sin(pol) * Math.sin(a), d * Math.cos(pol), t.z + d * Math.sin(pol) * Math.cos(a)), target: t }, 650);
}

/* ---- bucle: solo dibuja cuando hace falta ---- */
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
/* un solo ciclo por plano: si se pausa y se reanuda, nunca quedan dos ciclos dibujando a la vez */
function start() {
  const me = R; me.running = true; if (me.loopOn) return; me.loopOn = true;
  const step = () => { if (R !== me || !me.running) { me.loopOn = false; return; } requestAnimationFrame(step); tick(performance.now()); };
  step();
}
function tick(now) {
  let moving = false;
  if (R.zg) { R.camera.position.lerp(R.zg.pos, 0.2); R.controls.target.lerp(R.zg.target, 0.2);
    if (R.camera.position.distanceTo(R.zg.pos) < 0.4) { R.camera.position.copy(R.zg.pos); R.controls.target.copy(R.zg.target); R.zg = null; }
    R.dirty = true; moving = true; }
  if (R.anim) { const a = R.anim; const t = Math.min(1, (now - a.s) / a.ms); const e = ease(t);
    R.camera.position.lerpVectors(a.p0, a.p1, e); R.controls.target.lerpVectors(a.t0, a.t1, e); if (t >= 1) R.anim = null; R.dirty = true; moving = true; }
  if (R.controls.update()) { R.dirty = true; moving = true; }
  /* resolución adaptativa: mientras la cámara se mueve se dibuja a resolución normal (más cuadros por segundo);
     al quedarse quieta vuelve a la nitidez alta en el siguiente cuadro */
  if (moving) { R.lastMoveT = now; if (R.renderer.getPixelRatio() !== R.dprLo) { R.renderer.setPixelRatio(R.dprLo); R.dirty = true; } }
  else if (R.renderer.getPixelRatio() !== R.dprHi && now - (R.lastMoveT || 0) > 180) { R.renderer.setPixelRatio(R.dprHi); R.dirty = true; }
  // límites del paseo: el centro de la vista no sale del condominio
  if (R.box) { const t = R.controls.target, b = R.box, m = 80;
    const x0 = b[0] - R.geo.w / 2 - m, x1 = b[2] - R.geo.w / 2 + m, z0 = b[1] - R.geo.h / 2 - m, z1 = b[3] - R.geo.h / 2 + m;
    const nx = Math.min(x1, Math.max(x0, t.x)), nz = Math.min(z1, Math.max(z0, t.z));
    if (nx !== t.x || nz !== t.z) { R.camera.position.x += nx - t.x; R.camera.position.z += nz - t.z; t.x = nx; t.z = nz; R.dirty = true; } }
  if (R.animH.size) {
    for (const i of [...R.animH]) { const t = R.lotT[i], c = R.lotH[i]; const nv = c + (t - c) * 0.16; const done = Math.abs(t - nv) < 0.02;
      setHeight(i, done ? t : nv); if (done) R.animH.delete(i); if (i === R.selIdx) buildSel(i); }
    flushGeom(true); if (!R.animH.size) R.renderer.shadowMap.needsUpdate = true; R.dirty = true;
  }
  if (R.selIdx >= 0 && !R.selSettled) {
    const t = (now - R.selT0) / 1000; const up = Math.min(1, t / 0.45), e = 1 - Math.pow(1 - up, 3);
    R.sel.scale.y = 0.3 + 0.7 * e; R.selLine.scale.y = R.sel.scale.y;
    const k = (t % 1.2) / 1.2; R.ring.scale.setScalar(1 + k * 2.4); R.ring.material.opacity = 0.55 * (1 - k) * Math.max(0, 1 - t / 2.4);
    if (t > 2.4) { R.selSettled = true; R.ring.visible = false; R.sel.scale.y = 1; R.selLine.scale.y = 1; }
    R.dirty = true;
  }
  if (R.pulseT) { const k = (now - R.pulseT) / 1400; if (k >= 1) { R.pulseT = 0; R.ring.visible = false; } else { R.ring.visible = true; R.ring.scale.setScalar(1 + k * 6); R.ring.material.opacity = 0.9 * (1 - k); } R.dirty = true; }
  if (!R.dirty) return;
  R.dirty = false;
  const dist = R.camera.position.distanceTo(R.controls.target);
  if (Math.abs(dist - R.lastDist) > 2) {
    R.lastDist = dist;
    const showDims = dist < 520; R.dims.children.forEach(o => { o.visible = showDims; });
    const op = Math.max(0, Math.min(1, (1050 - dist) / 380)); R.nmat.opacity = op; R.numbers.visible = op > 0.02;
    R.baseLines.visible = dist < (R.fitDist || 2000) * 0.85;   // el filo fino de cada lote solo aporta de cerca
  }
  // brújula: gira con el plano y solo se destaca cuando hay giro o inclinación distinta
  const az = R.controls.getAzimuthalAngle(); if (Math.abs(az - (R.lastAz ?? 99)) > 0.002) { R.lastAz = az;
    const home = R.homeAz ?? AZ;
    const n = R.el && R.el.querySelector('.cmp-needle'); if (n) n.style.transform = `rotate(${(az - home) * 180 / Math.PI}deg)`;
    const b = R.el && R.el.querySelector('.cmp'); if (b) b.classList.toggle('on', Math.abs(az - home) > 0.05); }
  // zoom semántico: en la vista general no se muestran las 100 etiquetas de manzana (se amontonan); aparecen al acercar
  const mode = (R.sector != null ? 's' : (dist < (R.fitDist ? R.fitDist * 0.72 : 1200) ? 'a' : 'n'));
  // etiquetas ocultas = fuera del cálculo (no se mueven en pantalla cada cuadro)
  if (mode !== R.lblMode) { R.lblMode = mode; R.labels.forEach(o => { o.visible = mode === 's' ? !!o.userData.inS : mode === 'a'; }); }
  R.renderer.render(R.scene, R.camera); R.labelR.render(R.scene, R.camera);
}
function resize() {
  if (!R || !R.el) return; const w = R.el.clientWidth, h = R.el.clientHeight; if (!w || !h) return;
  if (w === R.w && h === R.h) return; R.w = w; R.h = h;
  R.renderer.setSize(w, h, false); R.labelR.setSize(w, h);
  R.baseMat.resolution.set(w, h); R.ringMat.resolution.set(w, h); R.selMat2.resolution.set(w, h);
  R.camera.aspect = w / h; R.camera.updateProjectionMatrix(); req();
}

const P3 = window.P3 = {
  mount(el, geo, pid, cb) {
    if (!R || R.geo !== geo || R.pid !== pid) {
      // construir el plano toma ~1 s: se deja pintar la pantalla de carga y luego se construye
      if (P3.building) return; P3.building = true;
      setTimeout(() => { if (R) { R.running = false; R.ro && R.ro.disconnect(); R.renderer.domElement.remove(); R.labelR.domElement.remove(); R.renderer.dispose(); } build(geo, pid); P3.building = false; R.fresh = true; window.P3.mount(document.getElementById('v3d') || el, geo, pid, cb); }, 60);
      return;
    }
    R.cb = cb;
    if (R.el !== el) { R.el = el; R.lastAz = null; if (R.ro) R.ro.disconnect(); R.ro = new ResizeObserver(resize); R.ro.observe(el); }
    if (R.renderer.domElement.parentNode !== el) { el.prepend(R.labelR.domElement); el.prepend(R.renderer.domElement); }
    el.querySelector('#load3')?.remove();
    el.querySelectorAll('[data-esc]').forEach(b => b.classList.toggle('on', b.dataset.esc === R.escena));
    resize();
    R.sector = S.sector; R.mode = S.cam;
    paint();
    if (R.fresh) { // entrada: aparece un poco más alto y baja suave hasta encuadrar todo el condominio
      R.fresh = false; const v = fitAll(0); const t = v.target.clone();
      R.camera.position.copy(t.clone().add(v.pos.clone().sub(t).multiplyScalar(1.35))); R.controls.target.copy(t); R.controls.update();
      fly(v, 1200);
    }
    start();
  },
  pause() { if (R) R.running = false; },
  repaint() { if (R && R.running) paint(); },
  select, flyToSector, flyToLot, flyToBox, setCam, pulse, zoomBy, resetNorth, setEscena, escenas: ESCENAS, escena: () => R ? R.escena : leerEscena(),
  fit() { if (R) { R.sector = null; fitAll(900); paint(); } },
  // completa la animación en curso y dibuja de inmediato (pruebas y "reducir movimiento")
  finish() { if (!R) return; if (R.anim) { R.camera.position.copy(R.anim.p1); R.controls.target.copy(R.anim.t1); R.anim = null; } R.dirty = true; tick(performance.now());
    return { dist: Math.round(R.camera.position.distanceTo(R.controls.target)), fit: Math.round(R.fitDist || 0) }; },
  focus() { R && R.renderer.domElement.focus({ preventScroll: true }); },
  theme() { applyTheme3(); },
};
window.dispatchEvent(new Event('p3ready'));
