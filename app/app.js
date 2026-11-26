import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeMaterial, makeIllusMaterial, OutlinePass, GHOST, setupLighting, setLightStyle, PIX } from './materials.js';
import { initTestsUI, loadCustom, entryTestsHTML, bindInfoEvents, resultsText, customHTML } from './tests-ui.js';
import { initFitness, loadWorkouts, careHTML, exercisesForBase, volumeByBase, renderTraining } from './fitness.js';
import { initExtras } from './extras.js';
import { initAnim, play as playAnim, stop as stopAnim, hasAnim, refreshBounds } from './anim.js';

const $ = s => document.querySelector(s);
const MUSCLES = window.MUSCLES, ZH = { ...window.ZH_TERMS, ...(window.ZH_NAMES || {}) };
const SYSTEMS = [
  { key: 'skeletal', zh: '骨骼', en: 'Skeletal', color: 0xe8dcc4, on: true },
  { key: 'muscular', zh: '肌肉与筋膜', en: 'Muscular', color: 0xb34a40, on: true },
  { key: 'joints', zh: '关节与韧带', en: 'Joints & ligaments', color: 0x9fb6c9 },
  { key: 'cardiovascular', zh: '心血管', en: 'Cardiovascular', color: 0xc62828 },
  { key: 'nervous', zh: '神经与感官', en: 'Nervous & sense organs', color: 0xf2c94c },
  { key: 'visceral', zh: '内脏', en: 'Visceral', color: 0xd99090 },
  { key: 'lymphoid', zh: '淋巴', en: 'Lymphoid', color: 0x7cb342 },
];
const SYS = Object.fromEntries(SYSTEMS.map(s => [s.key, s]));
const REGION_COLOR = { '头部': '#ce93d8', '颈部': '#4fb3ff', '胸部': '#ffb74d', '腹部': '#81c784', '背部': '#ef9a9a' };
const isMobile = matchMedia('(pointer:coarse)').matches || innerWidth <= 820;

// 个人设置（保存在浏览器）
const PREF = Object.assign({ hd: !isMobile, ao: false, bg: 'light', autoInfo: !isMobile, bothSides: false, style: 'illus', outline: true }, (() => { try { return JSON.parse(localStorage.getItem('viewerPref') || '{}'); } catch { return {}; } })());
const savePref = () => { try { localStorage.setItem('viewerPref', JSON.stringify(PREF)); } catch {} };

let INDEX = {}, DEFS = {}, LAYERS = {};
const byBase = {};
MUSCLES.forEach(m => m.bases.forEach(b => byBase[b] = m));
const meshes = [];
const meshByName = new Map();
const sysState = {};
let selected = new Set(), primary = null, secondary = new Set();
let tool = 'select', panMode = false, layerLevel = 0;

// ───────── three setup ─────────
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.12;
controls.zoomToCursor = true; controls.screenSpacePanning = true; controls.panSpeed = 1.2;
function applyControlMode() {
  controls.mouseButtons = { LEFT: panMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: panMode ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN };
  controls.touches = { ONE: panMode ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  $('#navPan')?.classList.toggle('on', panMode);
}
applyControlMode();
scene.add(camera);
setupLighting(renderer, scene, camera, RoomEnvironment);
function bgTexture(mode) {
  const c = document.createElement('canvas'); c.width = 8; c.height = 512; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  if (mode === 'dark') { gr.addColorStop(0, '#2a2f37'); gr.addColorStop(1, '#101317'); } else { gr.addColorStop(0, '#fbfbfc'); gr.addColorStop(1, '#d5d9de'); }
  g.fillStyle = gr; g.fillRect(0, 0, 8, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function applyBg() { scene.background = bgTexture(PREF.bg); document.body.classList.toggle('bg-light', PREF.bg !== 'dark'); requestRender(); }
// 后期：环境光遮蔽（GTAO）
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, 800, 600);
gtao.updateGtaoMaterial({ radius: 0.06, distanceExponent: 1, thickness: 1, scale: 1, samples: 16, distanceFallOff: 1 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
gtao.blendIntensity = 0.9;
{ const ov = gtao.overrideVisibility.bind(gtao); gtao.overrideVisibility = function () { ov(); scene.traverse(o => { if (o.isMesh && o.material?.transparent) o.visible = false; }); }; }
composer.addPass(gtao);
composer.addPass(new OutputPass());

const HL = new THREE.Color(0x14b8d4), SEC = new THREE.Color(0xff8a00), BLACK = new THREE.Color(0);
const PHASE_COLOR = { con: 0x1e7bff, iso: 0xb026d9, ecc: 0x1fbf5a };
function setPhase(kind, text) {
  HL.set(kind ? PHASE_COLOR[kind] : 0x14b8d4);
  const el = document.getElementById('apPhase'); if (el) { el.textContent = text || ''; el.dataset.k = kind || ''; }
  applyStyles();
}
let bodyBox = new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.15), new THREE.Vector3(0.3, 1.75, 0.15));
let needRender = true;
const requestRender = () => needRender = true;
controls.addEventListener('change', requestRender);
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(r.width, r.height);
  outline.setSize(Math.round(r.width * renderer.getPixelRatio()), Math.round(r.height * renderer.getPixelRatio())); outline.mat.uniforms.uWidth.value = Math.max(1, renderer.getPixelRatio() * 0.8);
  camera.aspect = r.width / r.height;
  const info = document.getElementById('info');
  const sheet = innerWidth <= 820 && info && !info.classList.contains('hidden') ? info.offsetHeight : 0;
  if (sheet) camera.setViewOffset(r.width, r.height, 0, sheet / 2, r.width, r.height); else camera.clearViewOffset();
  camera.updateProjectionMatrix(); PIX.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, r.height); requestRender();
}
new ResizeObserver(resize).observe(canvas.parentElement);
const outline = new OutlinePass(renderer);
const afterRender = [];
(function loop() {
  requestAnimationFrame(loop);
  if (controls.update() || needRender) {
    renderNow();
    needRender = false; afterRender.forEach(f => f());
  }
})();
function renderNow() {
  if (PREF.ao) composer.render(); else renderer.render(scene, camera);
  if (PREF.outline) outline.render(scene, camera, meshes, m => m.material !== GHOST);
}

// ───────── naming helpers ─────────
const showEn = () => !document.body.classList.contains('no-en');
function applyEnPref(on) { document.body.classList.toggle('no-en', !on); try { localStorage.setItem('showEn', on ? '1' : '0'); } catch {} }
try { applyEnPref(localStorage.getItem('showEn') !== '0'); } catch {}
const SIDE = { l: '左侧', r: '右侧', '': '' };
function zhOf(base) {
  if (!base) return '';
  const clean = base.replace(/^\(|\)$/g, '');
  return ZH[base] || ZH[clean] || ZH[clean.replace(/ muscles?$/, '')] || (byBase[base] && byBase[base].zh) || '';
}
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ───────── 画面风格：示意（Innerbody 式）/ 写实 ─────────
function buildMat(o, key, base) {
  const h = (Math.abs(hash(base)) % 1000) / 1000;
  return PREF.style === 'real' ? makeMaterial(o, key, base, h * 0.16 - 0.08) : makeIllusMaterial(key, base, h);
}
// 示意风格：把法线在相邻顶点间平均几次，抹掉模型表面细小的纤维起伏，表面看起来干净平滑
function smoothNormals(geo, iters = 4) {
  const n = geo.attributes.normal, idx = geo.index, P = geo.attributes.position; if (!n || !idx) return n;
  // 位置相同的顶点合并成一个（有些模型三角形之间没有连起来）
  const cnt = n.count, canon = new Uint32Array(cnt), map = new Map(); let U = 0;
  for (let v = 0; v < cnt; v++) {
    const k = Math.round(P.getX(v) * 2e4) + ',' + Math.round(P.getY(v) * 2e4) + ',' + Math.round(P.getZ(v) * 2e4);
    let c = map.get(k); if (c === undefined) { c = U++; map.set(k, c); } canon[v] = c;
  }
  let cur = new Float32Array(U * 3);
  for (let v = 0; v < cnt; v++) { const c = canon[v] * 3; cur[c] += n.getX(v); cur[c + 1] += n.getY(v); cur[c + 2] += n.getZ(v); }
  const a = idx.array;
  for (let it = 0; it < iters; it++) {
    const acc = new Float32Array(cur);
    for (let i = 0; i < a.length; i += 3) {
      const i0 = canon[a[i]] * 3, i1 = canon[a[i + 1]] * 3, i2 = canon[a[i + 2]] * 3;
      for (let k = 0; k < 3; k++) { const s3 = cur[i0 + k] + cur[i1 + k] + cur[i2 + k]; acc[i0 + k] += s3; acc[i1 + k] += s3; acc[i2 + k] += s3; }
    }
    for (let c = 0; c < U; c++) { const o = c * 3, l = Math.hypot(acc[o], acc[o + 1], acc[o + 2]) || 1; acc[o] /= l; acc[o + 1] /= l; acc[o + 2] /= l; }
    cur = acc;
  }
  const out = new Float32Array(cnt * 3);
  for (let v = 0; v < cnt; v++) { const c = canon[v] * 3, o = v * 3, l = Math.hypot(cur[c], cur[c + 1], cur[c + 2]) || 1; out[o] = cur[c] / l; out[o + 1] = cur[c + 1] / l; out[o + 2] = cur[c + 2] / l; }
  return new THREE.BufferAttribute(out, 3);
}
function applyNormals(m) {
  const g = m.geometry, u = m.userData;
  if (!u.nOrig) u.nOrig = g.attributes.normal;
  if (PREF.style !== "real" && (u.sys === "muscular" || u.sys === "skeletal")) { if (!u.nSmooth) u.nSmooth = smoothNormals(g, Math.round(THREE.MathUtils.clamp(Math.sqrt(g.attributes.position.count) / 20, 2, 6))); g.setAttribute("normal", u.nSmooth); }
  else g.setAttribute('normal', u.nOrig);
}
function applyStyleMode() {
  for (const m of meshes) { const u = m.userData, mat = buildMat(m, u.sys, u.base); u.mat = mat; u.color = mat.color.clone(); applyNormals(m); }
  setLightStyle(PREF.style);
  applyStyles();
}
// ───────── loading ─────────
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const HD_AVAILABLE = { muscular: true, skeletal: true };
async function loadSystem(key) {
  const st = sysState[key];
  if (st.loaded) return; if (st.loading) return st.loading;
  setLoading(`正在加载：${SYS[key].zh}…`);
  const url = `models/${key}${PREF.hd && HD_AVAILABLE[key] ? '_hd' : ''}.glb`;
  st.loading = new Promise((res, rej) => loader.load(url, gltf => {
    const json = gltf.parser.json, assoc = gltf.parser.associations;
    const info = INDEX[key] || {};
    const list = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => { if (o.isMesh) list.push(o); });
    for (const o of list) {
      let a = assoc.get(o), name = null;
      if (a && a.nodes !== undefined) name = json.nodes[a.nodes].name;
      else if (o.parent) { const pa = assoc.get(o.parent); if (pa && pa.nodes !== undefined) name = json.nodes[pa.nodes].name; }
      const meta = name && info[name];
      if (!meta) { o.removeFromParent(); continue; }
      const [base, side, groups] = meta;
      const pa = o.geometry.attributes.position;   // 解量化，保证拾取准确
      if (pa.isInterleavedBufferAttribute || pa.normalized || !(pa.array instanceof Float32Array)) {
        const f = new Float32Array(pa.count * 3);
        for (let i = 0; i < pa.count; i++) { f[i * 3] = pa.getX(i); f[i * 3 + 1] = pa.getY(i); f[i * 3 + 2] = pa.getZ(i); }
        o.geometry.setAttribute('position', new THREE.BufferAttribute(f, 3));
      }
      o.geometry.deleteAttribute('normal'); o.geometry.computeVertexNormals();   // 统一法线方向，避免部分肌肉发暗
      o.geometry.computeBoundingSphere(); o.geometry.computeBoundingBox();
      const mat = buildMat(o, key, base);
      o.material = mat;
      o.userData = { name, base, side, groups, sys: key, mat, color: mat.color.clone(), state: 'v', layer: LAYERS[name] };
      if (key === 'muscular' && (groups.some(g => /fasci/i.test(g)) || /fascia|aponeuros|linea alba|retinacul|septum|sheath/i.test(base))) o.userData.fascia = true;
      applyNormals(o);
      meshes.push(o); meshByName.set(name, o);
    }
    st.group.add(gltf.scene);
    st.loaded = true; applyStyles(); setLoading(''); res();
    window.dispatchEvent(new CustomEvent('system-loaded', { detail: key }));
  }, undefined, e => { setLoading('加载失败：' + key); rej(e); }));
  return st.loading;
}
let pending = 0;
function setLoading(t) { if (t && t.startsWith('正在加载')) pending++; else if (!t) { pending = Math.max(0, pending - 1); if (pending) return; } const el = $('#loading'); el.textContent = t; el.style.display = t ? 'block' : 'none'; }

// ───────── 显示状态：正常 v / 淡化 f / 隐藏 h ─────────
let heatMap = null, volMap = null;
const MAX_LAYER = 5;
function layerFaded(u) {
  if (!layerLevel) return false;
  if (u.sys === 'muscular') return layerLevel > MAX_LAYER ? true : (u.layer || 99) <= layerLevel;
  if (u.sys === 'skeletal') return layerLevel > MAX_LAYER + 1;
  return false;
}
const isHidden = m => m.userData.state === 'h' || (m.userData.fascia && !$('#optFascia').checked);
const isFaded = m => m.userData.state === 'f' || layerFaded(m.userData);
function applyStyles() {
  const vmax = volMap ? Math.max(1, ...Object.values(volMap)) : 1;
  for (const m of meshes) {
    const u = m.userData, isSel = selected.has(m), isSec = secondary.has(m);
    m.visible = !isHidden(m);
    if (isFaded(m) && !isSel && !isSec) { m.material = GHOST; m.renderOrder = 1; continue; }
    const mat = u.mat; m.material = mat; m.renderOrder = isSel || isSec ? 2 : 0;
    if (heatMap && u.sys === 'muscular') {
      const hk = heatMap[byBase[u.base]?.id] ?? heatMap[u.base];
      const h = hk == null ? null : (u.side === 'l' ? hk.l : u.side === 'r' ? hk.r : Math.max(hk.l ?? -1, hk.r ?? -1, -1) < 0 ? null : Math.max(hk.l ?? 0, hk.r ?? 0));
      if (h != null) mat.color.setHSL(0.11 - 0.11 * (h / 10), 0.95, 0.45); else mat.color.setRGB(0.5, 0.48, 0.47);
    } else if (volMap && u.sys === 'muscular') {
      const v = volMap[u.base];
      if (v) mat.color.setHSL(0.6 - 0.45 * Math.min(1, v / vmax), 0.85, 0.45); else mat.color.setRGB(0.5, 0.48, 0.47);
    } else mat.color.copy(u.color);
    if (PREF.style !== 'real' && (isSel || isSec)) {   // 示意风格：选中的结构直接换成醒目的纯色
      mat.color.copy(isSel ? HL : SEC); mat.emissive.copy(isSel ? HL : SEC); mat.emissiveIntensity = 0.25;
    } else { mat.emissive.copy(isSel ? HL : isSec ? SEC : BLACK); mat.emissiveIntensity = isSel ? 0.85 : isSec ? 0.5 : 0; }
  }
  requestRender(); updateHistoryButtons(); window.dispatchEvent(new Event('styles-changed'));
}

// ───────── 撤销 / 重做 ─────────
const undoStack = [], redoStack = [];
function commit(changes) {   // changes: [[mesh, newState]]
  const rec = changes.filter(([m, s]) => m.userData.state !== s).map(([m, s]) => [m, m.userData.state, s]);
  if (!rec.length) return;
  rec.forEach(([m, , s]) => m.userData.state = s);
  undoStack.push(rec); redoStack.length = 0; applyStyles();
}
function undo() { const r = undoStack.pop(); if (!r) return; r.forEach(([m, from]) => m.userData.state = from); redoStack.push(r); applyStyles(); }
function redo() { const r = redoStack.pop(); if (!r) return; r.forEach(([m, , to]) => m.userData.state = to); undoStack.push(r); applyStyles(); }
function updateHistoryButtons() {
  $('#tUndo') && ($('#tUndo').disabled = !undoStack.length); $('#tRedo') && ($('#tRedo').disabled = !redoStack.length);
}
const activeMeshes = () => meshes.filter(m => sysState[m.userData.sys].visible && !isHidden(m));
function hideMeshes(list) { commit(list.map(m => [m, 'h'])); list.forEach(m => selected.delete(m)); if (!selected.size) deselect(); else applyStyles(); }
function fadeMeshes(list) { commit(list.map(m => [m, 'f'])); deselect(); }
function fadeOthers(list) { const keep = new Set(list); commit(activeMeshes().filter(m => !keep.has(m)).map(m => [m, 'f']).concat(list.map(m => [m, 'v']))); }
function isolate(list) { const keep = new Set(list); commit(meshes.filter(m => !keep.has(m)).map(m => [m, 'h']).concat(list.map(m => [m, 'v']))); frame(list, 1.8); }
function showMeshes(list) { commit(list.map(m => [m, 'v'])); }
function resetAll() {
  meshes.forEach(m => m.userData.state = 'v'); undoStack.length = 0; redoStack.length = 0;
  setLayerLevel(0); heatMap = volMap = null; $('#optColor').value = '';
  deselect(); view('front');
}

// ───────── 选择 ─────────
function setSelection(list, prim, sec = []) {
  selected = new Set(list); secondary = new Set(sec); primary = prim || list[0] || null; anchor = null; applyStyles(); updateLabel();
}
function deselect() { setSelection([]); closeInfo(); }
function partners(m) { const u = m.userData; return meshes.filter(x => x.userData.base === u.base && x.userData.sys === u.sys); }
function selectMesh(m, { add = false, point = null, openPanel = PREF.autoInfo } = {}) {
  let list = PREF.bothSides ? partners(m) : [m];
  if (add) { const s = new Set(selected); const allIn = list.every(x => s.has(x)); list.forEach(x => allIn ? s.delete(x) : s.add(x)); list = [...s]; }
  setSelection(list, list.includes(m) ? m : list[0]);
  anchor = point ? point.clone() : null; updateLabel();
  if (openPanel && primary) showInfoForMesh(primary);
  else if ($('#info').classList.contains('hidden') === false && primary) showInfoForMesh(primary);
}

// ───────── 镜头 ─────────
function frame(list, pad = 1.6, autoDir = false) {
  const box = new THREE.Box3();
  (list && list.length ? list : null)?.forEach(m => box.expandByObject(m));
  if (box.isEmpty()) box.copy(bodyBox);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  let dir = camera.position.clone().sub(controls.target).normalize();
  if (autoDir) {
    const axis = bodyBox.getCenter(new THREE.Vector3()); axis.y = c.y;
    const out = c.clone().sub(axis); out.y = 0;
    if (out.length() < 0.02) out.set(0, 0, 1);
    dir = out.normalize().add(new THREE.Vector3(0, 0.15, 0)).normalize();
  }
  const dist = Math.max(size * pad / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))), 0.22);
  tween(c, c.clone().add(dir.multiplyScalar(dist)));
}
function tween(target, pos, ms = 450) {
  const t0 = performance.now(), ft = controls.target.clone(), fp = camera.position.clone();
  (function step() {
    const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    controls.target.lerpVectors(ft, target, e); camera.position.lerpVectors(fp, pos, e);
    controls.update(); requestRender(); if (k < 1) requestAnimationFrame(step);
  })();
}
function view(name) {
  const c = bodyBox.getCenter(new THREE.Vector3()), h = bodyBox.max.y - bodyBox.min.y;
  let t = c.clone(), d = h * 1.95, dir = new THREE.Vector3(0, 0, 1);
  if (name === 'back') dir.set(0, 0, -1);
  if (name === 'left') dir.set(1, 0, 0);
  if (name === 'right') dir.set(-1, 0, 0);
  if (name === 'head') { t.y = bodyBox.min.y + h * 0.88; d = h * 0.45; dir.set(0.5, 0.1, 1).normalize(); }
  if (name === 'trunk') { t.y = bodyBox.min.y + h * 0.66; d = h * 0.8; dir.set(0.35, 0.05, 1).normalize(); }
  tween(t, t.clone().add(dir.multiplyScalar(d)));
}
function orbitBy(dTheta, dPhi) {
  const off = camera.position.clone().sub(controls.target), s = new THREE.Spherical().setFromVector3(off);
  s.theta += dTheta; s.phi = THREE.MathUtils.clamp(s.phi + dPhi, 0.05, Math.PI - 0.05);
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s)); controls.update(); requestRender();
}
function panBy(dx, dy) {
  const dist = camera.position.distanceTo(controls.target), right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
  const v = right.multiplyScalar(dx * dist).add(up.multiplyScalar(dy * dist));
  camera.position.add(v); controls.target.add(v); controls.update(); requestRender();
}
function zoomBy(f) {
  const off = camera.position.clone().sub(controls.target).multiplyScalar(f);
  if (off.length() < 0.05) return;
  camera.position.copy(controls.target).add(off); controls.update(); requestRender();
}
function centerOn(point, zoom = 1) {
  const offset = camera.position.clone().sub(controls.target).multiplyScalar(zoom);
  tween(point.clone(), point.clone().add(offset), 380);
}

// ───────── 拾取 ─────────
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let lastHit = null;
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  camera.updateMatrixWorld(); ray.setFromCamera(ndc, camera);
  if (document.body.classList.contains('animating')) refreshBounds();
  const cand = meshes.filter(m => m.visible && sysState[m.userData.sys].visible && m.material !== GHOST);
  const hit = ray.intersectObjects(cand, false)[0];
  lastHit = hit || null;
  return hit ? hit.object : null;
}

// ───────── 鼠标 / 触摸 ─────────
let downAt = null, pressTimer = null, longPressed = false;
let lastTap = { t: 0, x: 0, y: 0, point: null };
canvas.addEventListener('pointerdown', e => {
  if (drawing()) return;
  downAt = [e.clientX, e.clientY]; longPressed = false;
  clearTimeout(pressTimer);
  if (e.button === 0) pressTimer = setTimeout(() => {   // 长按：飞到该结构
    if (!downAt) return; const m = pick({ clientX: downAt[0], clientY: downAt[1] });
    if (m) { longPressed = true; selectMesh(m, { point: lastHit.point }); frame(PREF.bothSides ? partners(m) : [m], 1.8); }
  }, 600);
});
canvas.addEventListener('pointermove', e => { if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) clearTimeout(pressTimer); });
canvas.addEventListener('pointerup', e => {
  clearTimeout(pressTimer);
  if (drawing() || longPressed || !downAt || e.button !== 0 || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) { downAt = null; return; }
  downAt = null;
  const now = performance.now(), dbl = now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 25;
  const firstPoint = lastTap.point;
  const m = pick(e);
  lastTap = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY, point: lastHit && lastHit.point.clone() };
  if (dbl) { const p = firstPoint || (lastHit && lastHit.point); if (p) centerOn(p, 0.6); return; }   // 双击：自动聚焦
  if (!m) { if (tool === 'select') deselect(); return; }
  if (tool === 'hide') return hideMeshes(PREF.bothSides ? partners(m) : [m]);
  if (tool === 'fade') return fadeMeshes(PREF.bothSides ? partners(m) : [m]);
  selectMesh(m, { add: e.ctrlKey || e.metaKey || e.shiftKey, point: lastHit.point });
});
let lastMove = 0;
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !$('#optLabels').checked || e.buttons || drawing()) { $('#tip').style.display = 'none'; return; }
  const now = performance.now(); if (now - lastMove < 60) return; lastMove = now;
  const m = pick(e), tip = $('#tip');
  if (!m) { tip.style.display = 'none'; return; }
  const u = m.userData, zh = zhOf(u.base);
  tip.textContent = (showEn() || !zh ? (zh ? zh + ' · ' : '') + u.base : zh) + (u.side ? `（${SIDE[u.side]}）` : '');
  const r = canvas.getBoundingClientRect();
  tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 10) + 'px'; tip.style.display = 'block';
});
canvas.addEventListener('pointerleave', () => $('#tip').style.display = 'none');
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ───────── 选中结构旁的浮动标签（名称 + 隐藏 / 淡化 / 只看它）─────────
let anchor = null;
const label = $('#label');
function labelTargets() { return [...selected]; }
function updateLabel() {
  if (!primary || !selected.size) { label.classList.add('hidden'); return; }
  const u = primary.userData, e = byBase[u.base], zh = zhOf(u.base), la = DEFS[u.base]?.la;
  const n = selected.size;
  label.innerHTML = `<div class="lb-head"><div><b>${esc(zh || u.base)}${u.side && n === 1 ? `<span class="lb-side">${SIDE[u.side]}</span>` : ''}${n > 1 ? `<span class="lb-side">等 ${n} 个</span>` : ''}</b>
      <div class="lb-en en-txt">${esc(u.base)}${la ? ' · <i>' + esc(la) + '</i>' : ''}</div>${e && zh !== e.zh ? `<div class="lb-en">属于：${esc(e.zh)}</div>` : ''}</div>
      <div class="lb-icons"><button data-l="speak" title="朗读名称">🔊</button><button data-l="info" title="详细信息">ⓘ</button><button data-l="close" title="取消选择">✕</button></div></div>
    <div class="lb-acts"><button data-l="hide">隐藏</button><button data-l="fademenu">淡化 ▾</button><button data-l="iso">只看它</button></div>
    <div class="lb-menu hidden"><button data-l="fade">淡化此结构</button><button data-l="fadeothers">淡化其他全部</button></div>`;
  label.classList.remove('hidden'); positionLabel();
}
function positionLabel() {
  if (label.classList.contains('hidden') || !primary) return;
  let p = anchor;
  if (!p) { const b = new THREE.Box3(); labelTargets().forEach(m => b.expandByObject(m)); p = b.getCenter(new THREE.Vector3()); }
  const v = p.clone().project(camera), r = canvas.getBoundingClientRect();
  if (v.z > 1) { label.style.visibility = 'hidden'; return; }
  let x = (v.x + 1) / 2 * r.width, y = (1 - v.y) / 2 * r.height;
  $('#labelDot').style.left = x + 'px'; $('#labelDot').style.top = y + 'px'; $('#labelDot').style.display = 'block';
  const w = label.offsetWidth, h = label.offsetHeight;
  let lx = x + 18, ly = y - h / 2;
  if (lx + w > r.width - 8) lx = x - w - 18;
  lx = Math.max(8, lx); ly = Math.max(8, Math.min(r.height - h - 8, ly));
  label.style.left = lx + 'px'; label.style.top = ly + 'px'; label.style.visibility = 'visible';
}
afterRender.push(positionLabel);
const _hideDot = new MutationObserver(() => { if (label.classList.contains('hidden')) $('#labelDot').style.display = 'none'; });
_hideDot.observe(label, { attributes: true, attributeFilter: ['class'] });
label.addEventListener('click', ev => {
  const a = ev.target.closest('[data-l]')?.dataset.l; if (!a) return;
  const list = labelTargets();
  if (a === 'close') return deselect();
  if (a === 'info') return primary && ($('#info').classList.contains('hidden') ? showInfoForMesh(primary) : closeInfo());
  if (a === 'speak') return speak(primary.userData.base);
  if (a === 'hide') return hideMeshes(list);
  if (a === 'iso') return isolate(list);
  if (a === 'fademenu') return label.querySelector('.lb-menu').classList.toggle('hidden');
  if (a === 'fade') return fadeMeshes(list);
  if (a === 'fadeothers') { fadeOthers(list); updateLabel(); }
});
function speak(base) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const zh = zhOf(base);
  if (zh) { const u1 = new SpeechSynthesisUtterance(zh.replace(/（.*?）/g, '')); u1.lang = 'zh-CN'; speechSynthesis.speak(u1); }
  if (showEn()) { const u2 = new SpeechSynthesisUtterance(base.replace(/[()]/g, '')); u2.lang = 'en-US'; u2.rate = 0.9; speechSynthesis.speak(u2); }
}

// ───────── 左侧工具栏：选择 / 隐藏 / 淡化 · 层次 · 搜索 · 绘图 · 帮助 · 撤销 / 重做 / 重置 ─────────
function setTool(t) {
  tool = t;
  document.querySelectorAll('#vtools [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  canvas.style.cursor = t === 'hide' ? 'not-allowed' : t === 'fade' ? 'cell' : '';
  toast({ select: '选择工具：点击结构查看名称', hide: '隐藏工具：点击结构直接隐藏', fade: '淡化工具：点击结构直接淡化' }[t]);
}
let toastTimer;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1800); }
$('#vtools').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tool) return setTool(b.dataset.tool);
  const a = b.dataset.act;
  if (a === 'layers') return $('#layerPop').classList.toggle('hidden');
  if (a === 'search') return openSearch();
  if (a === 'draw') return window.__extras?.startDraw();
  if (a === 'help') return window.__extras?.openHelp();
  if (a === 'undo') return undo();
  if (a === 'redo') return redo();
  if (a === 'reset') return resetAll();
});
function openSearch() { if (innerWidth <= 820) $('#side').classList.add('open'); gotoTab('search'); setTimeout(() => $('#q').focus(), 50); }
// 层次滑块：由外向内逐层淡化（与 Innerbody 的 Anatomy Layers 相同）
const LAYER_NAMES = ['全部显示', '淡化浅层肌', '淡化至第 2 层', '淡化至第 3 层', '淡化至第 4 层', '淡化至最深层肌', '淡化全部肌肉', '再淡化骨骼'];
function setLayerLevel(v) { layerLevel = v; $('#layerRange').value = 7 - v; $('#layerName').textContent = LAYER_NAMES[v]; applyStyles(); }
$('#layerRange').addEventListener('input', e => setLayerLevel(7 - +e.target.value));
// 右下角导航
$('#nav').addEventListener('click', e => {
  const a = e.target.closest('button')?.dataset.nav; if (!a) return;
  if (a === 'toggle') return $('#nav').classList.toggle('open');
  if (a === 'home') return view('front');
  if (a === 'pan') { panMode = !panMode; applyControlMode(); return toast(panMode ? '平移模式：拖动画面即可平移' : '旋转模式：拖动画面即可旋转'); }
  if (a === 'in') return zoomBy(0.8);
  if (a === 'out') return zoomBy(1.25);
  if (a === 'full') return toggleFull();
});
function toggleFull() { const el = document.documentElement; if (!document.fullscreenElement) el.requestFullscreen?.(); else document.exitFullscreen?.(); }
document.querySelectorAll('#toolbar [data-view]').forEach(b => b.onclick = () => view(b.dataset.view));

// ───────── 快捷键（与 Innerbody / BioDigital 相同）─────────
addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select') || document.querySelector('dialog[open]') || drawing()) return;
  const k = e.key, slow = e.shiftKey ? 0.25 : 1, mod = e.ctrlKey || e.metaKey;
  if (mod && k.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (mod && k.toLowerCase() === 'y') { e.preventDefault(); return redo(); }
  if (mod && k === 'Enter') return toggleFull();
  if (mod) return;
  if (k === 'ArrowLeft') { e.preventDefault(); return orbitBy(0.12 * slow, 0); }
  if (k === 'ArrowRight') { e.preventDefault(); return orbitBy(-0.12 * slow, 0); }
  if (k === 'ArrowUp') { e.preventDefault(); return orbitBy(0, -0.1 * slow); }
  if (k === 'ArrowDown') { e.preventDefault(); return orbitBy(0, 0.1 * slow); }
  const lk = k.toLowerCase();
  if (e.shiftKey && lk === 'h') return selected.size && hideMeshes([...selected]);
  if (e.shiftKey && lk === 'f') return selected.size && fadeMeshes([...selected]);
  if (e.shiftKey && lk === 'i') return selected.size && isolate([...selected]);
  if (e.shiftKey && lk === 'r') return resetAll();
  if (k === '?') return window.__extras?.openHelp();
  if (lk === 'w') return panBy(0, 0.05 * slow);
  if (lk === 's') return panBy(0, -0.05 * slow);
  if (lk === 'a') return panBy(-0.05 * slow, 0);
  if (lk === 'd') return panBy(0.05 * slow, 0);
  if (lk === 'e' || k === '=' || k === '+') return zoomBy(e.shiftKey ? 0.95 : 0.85);
  if (lk === 'c' || k === '-' || k === '_') return zoomBy(e.shiftKey ? 1.05 : 1.18);
  if (k === 'Delete' || k === 'Backspace') return selected.size && hideMeshes([...selected]);
  if (lk === 'h') return selected.size && hideMeshes([...selected]);
  if (lk === 'f') return selected.size && frame([...selected]);
  if (lk === 'p') return $('#nav [data-nav=pan]').click();
  if (k === '1') return setTool('select');
  if (k === '2') return setTool('hide');
  if (k === '3') return setTool('fade');
  if (k === '/') { e.preventDefault(); return openSearch(); }
  if (k === 'Escape') { $('#layerPop').classList.add('hidden'); return deselect(); }
});
const drawing = () => document.body.classList.contains('drawing');

// ───────── 信息面板 ─────────
function closeInfo() { $('#info').classList.add('hidden'); requestAnimationFrame(resize); }
$('#infoClose').onclick = () => closeInfo();
function openInfo(html) { $('#infoBody').innerHTML = html; $('#info').classList.remove('hidden'); $('#info').scrollTop = 0; requestAnimationFrame(resize); }
function entryHTML(e) {
  return `
   <h3>确认动作</h3>${entryTestsHTML(e)}
   ${careHTML(e)}
   <h3>与易混结构的区分</h3><ul>${e.diff.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
   <h3>常见不适表现</h3><p style="font-size:13px;line-height:1.6;margin:4px 0">${esc(e.refer)}</p>
   <h3>解剖</h3><dl><dt>起点</dt><dd>${esc(e.origin)}</dd><dt>止点</dt><dd>${esc(e.insertion)}</dd><dt>神经支配</dt><dd>${esc(e.nerve)}</dd><dt>主要作用</dt><dd><ul>${e.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul></dd></dl>
   <h3>常用训练动作</h3><ul>${e.train.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
   ${historyHTML(e.id)}`;
}
function historyHTML(id) {
  const list = LOGS.filter(l => l.muscle === id).sort((a, b) => b.time.localeCompare(a.time));
  if (!list.length) return '';
  return `<h3>我的记录（${list.length}）</h3>${chartSVG(list.slice().reverse())}` + list.slice(0, 5).map(l =>
    `<div class="card">${esc(l.time.replace('T', ' '))} · ${SIDEZH[l.side] || ''} · 程度 ${l.pain}/10<br>${esc((l.feel || []).join('、'))}${l.tests?.length ? ' · 诱发：' + esc(l.tests.join('、')) : ''}${l.results ? '<br>逐项：' + esc(resultsText(l.results) || '均正常') : ''}${l.note ? '<br>' + esc(l.note) : ''}</div>`).join('');
}
function defHTML(base) {
  const d = DEFS[base]; if (!d || !d.def) return '';
  return `<details><summary style="cursor:pointer;color:var(--mut);font-size:13px;margin-top:14px">英文释义（Z-Anatomy / Wikipedia）</summary><div class="def">${esc(d.def)}</div><div class="lic">文本与模型来自 Z-Anatomy（CC BY-SA 4.0），源自 BodyParts3D 与 Wikipedia。</div></details>`;
}
let curWhole = false, curInfo = null;
function refreshInfo() {
  const st = $('#info').scrollTop;
  if (curInfo?.ex) import('./fitness.js').then(f => { f.showExercise(curInfo.ex); $('#info').scrollTop = st; });
  else if (primary) { showInfoForMesh(primary, curWhole); $('#info').scrollTop = st; }
}
async function highlightBases(prim, sec) {
  await loadSystem('muscular'); setSysVisible('muscular', true);
  const P = meshes.filter(m => m.userData.sys === 'muscular' && prim.includes(m.userData.base));
  const S = meshes.filter(m => m.userData.sys === 'muscular' && sec.includes(m.userData.base));
  showMeshes([...P, ...S].filter(m => m.userData.state !== 'v'));
  setSelection(P, P[0], S); frame([...P, ...S], 1.5, true);
}
async function selectBase(base) {
  await loadSystem('muscular'); setSysVisible('muscular', true);
  const m = meshes.find(x => x.userData.sys === 'muscular' && x.userData.base === base);
  if (m) { if (m.userData.state !== 'v') showMeshes([m]); selectMesh(m, { openPanel: true }); frame([...selected], 2.2, true); }
}
function showInfoForMesh(m, whole = false) {
  curWhole = whole; curInfo = null;
  const u = m.userData, e = byBase[u.base], zh = zhOf(u.base);
  const crumb = [SYS[u.sys].zh, ...u.groups.slice(1).map(g => zhOf(g) || g)].join(' › ');
  const la = DEFS[u.base]?.la;
  openInfo(`
    <h2>${esc(e ? e.zh : (zh || u.base))}${u.side && !whole ? ` <small style="font-size:14px;color:var(--mut)">${SIDE[u.side]}</small>` : ''}</h2>
    <div class="en en-txt">${esc(u.base)}${la ? ' · <i>' + esc(la) + '</i>' : ''}</div>
    ${e && e.bases.length > 1 ? `<div class="en">所选部分：${esc(zh && zh !== e.zh ? zh : u.base)}</div>` : ''}
    <div class="crumb">${esc(crumb)}</div>
    <div class="acts">
      <button data-a="focus">聚焦</button><button data-a="hideGroup">隐藏同组</button>${e ? '<button data-a="all">高亮整块肌肉</button>' : ''}
      <button data-a="log" class="primary">记录不适</button>
    </div>
    ${e ? entryHTML(e) : (u.sys === 'muscular' ? '<p class="hint">该结构暂无确认动作数据（第一版覆盖头颈与躯干的重点肌肉）。</p>' : '')}
    ${u.sys === 'muscular' ? exercisesForBase(u.base) : ''}
    ${defHTML(u.base)}`);
  $('#infoBody .acts').onclick = ev => {
    const a = ev.target.dataset.a; if (!a) return;
    if (a === 'focus') frame([...selected]);
    if (a === 'hideGroup') { const g = u.groups[u.groups.length - 1]; hideMeshes(meshes.filter(x => x.userData.sys === u.sys && x.userData.groups[x.userData.groups.length - 1] === g)); }
    if (a === 'all') selectEntry(e, false);
    if (a === 'log') openLog({ muscle: e ? e.id : u.base, side: u.side === 'l' ? 'left' : u.side === 'r' ? 'right' : 'mid' });
  };
}
async function selectEntry(e, doFrame = true) {
  await loadSystem('muscular'); setSysVisible('muscular', true);
  const list = meshes.filter(m => m.userData.sys === 'muscular' && e.bases.includes(m.userData.base));
  showMeshes(list.filter(m => m.userData.state !== 'v'));
  setSelection(list, list[0]);
  if (list[0]) showInfoForMesh(list[0], true);
  if (doFrame) frame(list, 2.2, true);
  document.querySelectorAll('#focusList .item').forEach(b => b.classList.toggle('sel', b.dataset.id === e.id));
}

// ───────── 图层面板 ─────────
function setSysVisible(k, v) {
  const st = sysState[k]; st.visible = v; st.group.visible = v;
  const cb = document.querySelector(`#layerList input[data-k="${k}"]`); if (cb) cb.checked = v;
  if (v) loadSystem(k); requestRender(); window.dispatchEvent(new Event('styles-changed'));
}
function buildLayers() {
  $('#layerList').innerHTML = SYSTEMS.map(s => `
    <div class="layer"><input type="checkbox" data-k="${s.key}" ${s.on ? 'checked' : ''}>
      <span class="sw" style="background:#${s.color.toString(16).padStart(6, '0')}"></span>
      <span>${s.zh}<small class="en-txt">${s.en}</small></span>
      <span class="lyr-btns"><button type="button" data-fade="${s.key}" title="淡化整个系统">淡化</button><button type="button" data-solo="${s.key}" title="只看这个系统">只看</button></span></div>`).join('');
  $('#layerList').onchange = e => { if (e.target.dataset.k) setSysVisible(e.target.dataset.k, e.target.checked); };
  $('#layerList').onclick = async e => {
    const f = e.target.dataset.fade, s = e.target.dataset.solo;
    if (f) { await loadSystem(f); setSysVisible(f, true); const list = meshes.filter(m => m.userData.sys === f); const allF = list.every(m => m.userData.state === 'f'); commit(list.map(m => [m, allF ? 'v' : 'f'])); }
    if (s) { await loadSystem(s); SYSTEMS.forEach(x => setSysVisible(x.key, x.key === s)); }
  };
  $('#optEn').checked = showEn();
  $('#optEn').onchange = e => applyEnPref(e.target.checked);
  $('#optFascia').onchange = () => applyStyles();
  $('#optSides').checked = PREF.bothSides; $('#optSides').onchange = e => { PREF.bothSides = e.target.checked; savePref(); };
  $('#optAutoInfo').checked = PREF.autoInfo; $('#optAutoInfo').onchange = e => { PREF.autoInfo = e.target.checked; savePref(); };
  $('#optAO').checked = PREF.ao; $('#optAO').onchange = e => { PREF.ao = e.target.checked; savePref(); requestRender(); };
  $('#optHD').checked = PREF.hd; $('#optHD').onchange = e => { PREF.hd = e.target.checked; savePref(); toast('刷新页面后生效'); };
  $('#optStyle').value = PREF.style; $('#optStyle').onchange = e => { PREF.style = e.target.value; savePref(); applyStyleMode(); };
  $('#optOutline').checked = PREF.outline; $('#optOutline').onchange = e => { PREF.outline = e.target.checked; savePref(); requestRender(); };
  $('#optBg').value = PREF.bg; $('#optBg').onchange = e => { PREF.bg = e.target.value; savePref(); applyBg(); };
  $('#optColor').onchange = e => { const v = e.target.value; heatMap = v === 'pain' ? computeHeat() : null; volMap = v === 'volume' ? volumeByBase(7) : null; applyStyles(); };
}

// ───────── focus pane ─────────
function buildFocus() {
  const regions = [...new Set(MUSCLES.map(m => m.region))];
  $('#focusList').innerHTML = regions.map(r => `<div class="region"><h4>${r}</h4>${MUSCLES.filter(m => m.region === r).map(m =>
    `<button class="item" data-id="${m.id}"><span class="dot" style="background:${REGION_COLOR[r]}"></span>${esc(m.zh)}<small class="en-txt">${esc(m.en)}</small></button>`).join('')}</div>`).join('');
  $('#focusList').onclick = e => { const b = e.target.closest('.item'); if (b) { selectEntry(MUSCLES.find(m => m.id === b.dataset.id)); closeSideMobile(); } };
  $('#redFlags').innerHTML = window.RED_FLAGS.map(t => `<li>${esc(t)}</li>`).join('');
}

// ───────── logs ─────────
const TREATS = ['休息', '冷敷', '热敷', '放松按压', '拉伸', '强化训练', '调整姿势', '药物', '理疗/推拿', '就医'];
const EFFECTS = { better2: '明显好转', better: '有些好转', same: '没变化', worse: '加重' };
const FEELS = ['酸痛', '胀', '紧绷', '刺痛', '牵拉痛', '烧灼', '麻木', '无力', '僵硬', '抽筋'];
let LOGS = [], serverMode = false;
async function loadLogs() {
  try { const r = await fetch('api/logs'); if (!r.ok) throw 0; LOGS = await r.json(); serverMode = true; }
  catch { LOGS = JSON.parse(localStorage.getItem('bodylogs') || '[]'); serverMode = false; }
  $('#storeHint').textContent = serverMode ? '记录保存在电脑上的 userdata/logs.json，电脑和手机共用。' : '未连接本地服务器：记录暂存于本浏览器。用 start 脚本启动可在电脑和手机间共享。';
}
async function saveLog(log) {
  const i = LOGS.findIndex(l => l.id === log.id); if (i >= 0) LOGS[i] = log; else LOGS.push(log);
  if (serverMode) await fetch('api/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(log) });
  else localStorage.setItem('bodylogs', JSON.stringify(LOGS));
  renderLogs();
}
async function deleteLog(id) {
  LOGS = LOGS.filter(l => l.id !== id);
  if (serverMode) await fetch('api/logs/' + encodeURIComponent(id), { method: 'DELETE' });
  else localStorage.setItem('bodylogs', JSON.stringify(LOGS));
  renderLogs();
}
const labelOf = id => MUSCLES.find(m => m.id === id)?.zh || zhOf(id) || id;
const SIDEZH = { left: '左', right: '右', both: '双侧', mid: '正中' };
function renderLogs() {
  const f = $('#logFilter').value;
  const used = [...new Set(LOGS.map(l => l.muscle))];
  $('#logFilter').innerHTML = '<option value="">全部肌肉</option>' + used.map(u => `<option value="${esc(u)}" ${u === f ? 'selected' : ''}>${esc(labelOf(u))}</option>`).join('');
  const list = LOGS.filter(l => !f || l.muscle === f).sort((a, b) => b.time.localeCompare(a.time));
  $('#logList').innerHTML = list.map(l => `<div class="logitem" data-id="${esc(l.id)}" style="border-left-color:hsl(${110 - l.pain * 11},80%,50%)">
     <b>${esc(labelOf(l.muscle))}</b>（${SIDEZH[l.side] || ''}） 程度 ${l.pain}/10
     <div class="meta">${esc(l.time.replace('T', ' '))} · ${esc((l.feel || []).join('、'))}${l.tests?.length ? ' · 诱发：' + esc(l.tests.join('、')) : ''}</div>
     ${l.treat?.length || l.effect ? `<div class="meta">处理：${esc((l.treat || []).join('、') || '—')}${l.effect ? ' → ' + EFFECTS[l.effect] : ''}</div>` : ''}
     ${l.results ? `<div class="meta">逐项测试：${esc(resultsText(l.results) || '均正常')}</div>` : ''}
     ${l.note ? `<div>${esc(l.note)}</div>` : ''}</div>`).join('') || '<p class="hint">还没有记录。点击模型中的肌肉，再点「记录不适」。</p>';
  $('#logList').onclick = e => { const d = e.target.closest('.logitem'); if (d) openLog(LOGS.find(l => l.id === d.dataset.id)); };
  $('#logChart').innerHTML = f ? chartSVG(list.slice().reverse()) : '';
  if (heatMap) { heatMap = computeHeat(); applyStyles(); }
}
function chartSVG(list) {
  if (list.length < 2) return '';
  const t = list.map(l => +new Date(l.time)), t0 = Math.min(...t), t1 = Math.max(...t) || t0 + 1;
  const pts = list.map((l, i) => [10 + 280 * (t[i] - t0) / (t1 - t0 || 1), 100 - l.pain * 9]);
  return `<svg viewBox="0 0 300 110"><line x1="10" y1="100" x2="290" y2="100" stroke="#323a46"/><polyline fill="none" stroke="#4fb3ff" stroke-width="2" points="${pts.map(p => p.join(',')).join(' ')}"/>${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#ffb74d"/>`).join('')}<text x="10" y="12" fill="#9aa4b2" font-size="10">不适程度变化（0–10）</text></svg>`;
}
function computeHeat() {
  const since = Date.now() - 30 * 864e5, h = {};
  LOGS.forEach(l => {
    if (+new Date(l.time) < since) return;
    const o = h[l.muscle] ??= {};
    const sides = l.side === 'left' ? ['l'] : l.side === 'right' ? ['r'] : ['l', 'r'];
    sides.forEach(sd => o[sd] = Math.max(o[sd] ?? 0, +l.pain));
  });
  return h;
}
function nowLocal() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
function openLog(log = {}) {
  const f = $('#logForm'), dlg = $('#logDlg');
  const opts = MUSCLES.map(m => [m.id, m.zh]);
  if (log.muscle && !byBase[log.muscle] && !MUSCLES.some(m => m.id === log.muscle)) opts.unshift([log.muscle, labelOf(log.muscle)]);
  $('#fMuscle').innerHTML = opts.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  f.muscle.value = log.muscle || MUSCLES[0].id;
  f.side.value = log.side || 'right'; f.time.value = log.time || nowLocal();
  f.pain.value = log.pain ?? 3; $('#painVal').textContent = f.pain.value;
  f.trigger.value = log.trigger || ''; f.note.value = log.note || ''; f.id.value = log.id || '';
  $('#fTreat').innerHTML = TREATS.map(x => `<label><input type="checkbox" value="${x}" ${(log.treat || []).includes(x) ? 'checked' : ''}>${x}</label>`).join('');
  f.effect.value = log.effect || '';
  $('#fFeel').innerHTML = FEELS.map(x => `<label><input type="checkbox" value="${x}" ${(log.feel || []).includes(x) ? 'checked' : ''}>${x}</label>`).join('');
  const fillTests = () => {
    const e = MUSCLES.find(m => m.id === f.muscle.value);
    const names = [...(e ? e.tests.map(t => t.name) : []), '拉伸', '按压', '日常动作', '静息时也痛'];
    $('#fTests').innerHTML = names.map(x => `<label><input type="checkbox" value="${esc(x)}" ${(log.tests || []).includes(x) ? 'checked' : ''}>${esc(x)}</label>`).join('');
  };
  fillTests(); f.muscle.onchange = fillTests;
  f.pain.oninput = () => $('#painVal').textContent = f.pain.value;
  $('#logDelete').style.display = log.id ? '' : 'none';
  $('#logDelete').onclick = () => { if (confirm('删除这条记录？')) { deleteLog(log.id); dlg.close(); } };
  dlg.returnValue = ''; dlg.showModal();
  dlg.onclose = () => {
    if (dlg.returnValue !== 'ok') return;
    saveLog({
      id: f.id.value || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      muscle: f.muscle.value, side: f.side.value, time: f.time.value, pain: +f.pain.value,
      feel: [...$('#fFeel').querySelectorAll('input:checked')].map(i => i.value),
      tests: [...$('#fTests').querySelectorAll('input:checked')].map(i => i.value),
      trigger: f.trigger.value.trim(), note: f.note.value.trim(),
      treat: [...$('#fTreat').querySelectorAll('input:checked')].map(i => i.value), effect: f.effect.value,
      ...(log.results ? { results: log.results, summary: log.summary, kind: log.kind } : {})
    });
  };
}
$('#newLog').onclick = () => openLog(primary ? { muscle: byBase[primary.userData.base]?.id || primary.userData.base } : {});
$('#logFilter').onchange = renderLogs;
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }
$('#exportJson').onclick = () => download('身体记录.json', JSON.stringify(LOGS, null, 2), 'application/json');
$('#exportCsv').onclick = () => {
  const rows = [['时间', '肌肉', '侧别', '程度', '感觉', '诱发动作', '诱因', '备注']].concat(LOGS.map(l => [l.time, labelOf(l.muscle), SIDEZH[l.side], l.pain, (l.feel || []).join('/'), (l.tests || []).join('/'), l.trigger, l.note]));
  download('身体记录.csv', '﻿' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
};
$('#importJson').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  const arr = JSON.parse(await file.text()); for (const l of arr) if (l.id && l.muscle) await saveLog(l);
};

// ───────── tabs / mobile ─────────
function gotoTab(t) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + t));
  if (t === 'train') renderTraining();
  if (t === 'search') window.__extras?.renderBrowser();
}
$('#tabs').onclick = e => {
  const t = e.target.dataset.tab; if (!t) return;
  if (t === 'train') renderTraining();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + t));
  if (t === 'search') { window.__extras?.renderBrowser(); $('#q').focus(); }
};
$('#menuBtn').onclick = () => $('#side').classList.toggle('open');
function closeSideMobile() { if (innerWidth <= 820) $('#side').classList.remove('open'); }

window.__dbg = { PREF, requestRender, composer, gtao, meshes, THREE, camera, controls, renderer, scene, sysState, loadSystem, commit, undo, redo, resetAll, setLayerLevel, get selected() { return selected; }, pick: (x, y) => pick({ clientX: x, clientY: y })?.userData.name, ready: () => !pending && sysState.muscular?.loaded && sysState.skeletal?.loaded };
// ───────── boot ─────────
(async function boot() {
  [INDEX, DEFS, LAYERS] = await Promise.all(['index', 'definitions', 'layers'].map(n => fetch(`data/${n}.json`).then(r => r.json()).catch(() => ({}))));
  for (const s of SYSTEMS) { const g = new THREE.Group(); g.visible = !!s.on; scene.add(g); sysState[s.key] = { group: g, loaded: false, visible: !!s.on }; }
  applyBg(); setLightStyle(PREF.style);
  buildLayers(); buildFocus(); await loadLogs(); await loadCustom(serverMode); renderLogs();
  initTestsUI({ isServer: () => serverMode, saveLog, MUSCLES, onChange: refreshInfo });
  await loadWorkouts(serverMode);
  initFitness({
    isServer: () => serverMode, zhOf, customHTML, closeSideMobile,
    openInfo: (html, ex) => { openInfo(html); curInfo = { ex }; },
    highlight: highlightBases, selectBase, selectedBase: () => primary?.userData.base || null,
    gotoTab, onVolumeChange: () => { if (volMap) { volMap = volumeByBase(7); applyStyles(); } },
  });
  bindInfoEvents($('#infoBody'));
  initExtras({ SYSTEMS, SYS, INDEX, DEFS, MUSCLES, meshes, sysState, zhOf, loadSystem, setSysVisible, commit, isolate, fadeOthers, setSelection, frame,
    showInfoForMesh, selectEntry, closeSideMobile, PREF, controls, renderer, renderNow, toast });
  initAnim({ meshes, meshByName, scene, loadSystem, requestRender, setPhase,
    replaceMesh: (o, n) => { const i = meshes.indexOf(o); if (i >= 0) meshes[i] = n; meshByName.set(n.userData.name, n);
      if (selected.has(o)) { selected.delete(o); selected.add(n); } if (secondary.has(o)) { secondary.delete(o); secondary.add(n); } if (primary === o) primary = n; },
    highlight: async (P, S, v) => { await highlightBases(P, S); const sel = [...selected, ...secondary];
      const box = new THREE.Box3(); sel.forEach(m => box.expandByObject(m)); const c = box.getCenter(new THREE.Vector3());
      const d = 0.85, dir = v === 'arm-back' ? new THREE.Vector3(-1, 0.15, -0.35) : new THREE.Vector3(-1, 0.12, 0.3);
      label.classList.add('hidden');
      tween(c, c.clone().add(dir.normalize().multiplyScalar(d))); } });
  window.__anim = { play: playAnim, stop: stopAnim, has: hasAnim };
  setLayerLevel(0); updateHistoryButtons();
  resize(); view('front');
  await Promise.all(SYSTEMS.filter(s => s.on).map(s => loadSystem(s.key)));
  const box = new THREE.Box3(); sysState.skeletal.group.traverse(o => o.isMesh && box.expandByObject(o));
  if (!box.isEmpty()) bodyBox = box;
  view('front');
  if (!localStorage.getItem('helpSeen')) { try { localStorage.setItem('helpSeen', '1'); } catch {} setTimeout(() => window.__extras.openHelp(), 600); }
})();
