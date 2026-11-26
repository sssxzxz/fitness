import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';


const $ = s => document.querySelector(s);
const MUSCLES = window.MUSCLES, ZH = window.ZH_TERMS;
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

let INDEX = {}, DEFS = {};
const byBase = {};            // base -> muscle entry
MUSCLES.forEach(m => m.bases.forEach(b => byBase[b] = m));
const meshes = [];            // all loaded meshes
const meshByName = new Map();
const sysState = {};          // key -> {group, loaded, loading, visible, opacity}
let selected = new Set(), primary = null, ghost = false, showBothSides = true;
const hiddenStack = [];

// ───────── three setup ─────────
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14171c);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.12;
scene.add(new THREE.HemisphereLight(0xffffff, 0x404858, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.6); camera.add(key); key.position.set(0.5, 1, 1);
scene.add(camera);
const HL = new THREE.Color(0x2a8cff);
let bodyBox = new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.15), new THREE.Vector3(0.3, 1.75, 0.15));
let needRender = true;
const requestRender = () => needRender = true;
controls.addEventListener('change', requestRender);
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  const info = document.getElementById('info');
  const sheet = innerWidth <= 820 && info && !info.classList.contains('hidden') ? info.offsetHeight : 0;
  if (sheet) camera.setViewOffset(r.width, r.height, 0, sheet / 2, r.width, r.height); else camera.clearViewOffset();
  camera.updateProjectionMatrix(); requestRender();
}
new ResizeObserver(resize).observe(canvas.parentElement);
(function loop() { requestAnimationFrame(loop); if (controls.update() || needRender) { renderer.render(scene, camera); needRender = false; } })();

// ───────── naming helpers ─────────
const SIDE = { l: '左侧', r: '右侧', '': '' };
function zhOf(base) {
  if (!base) return '';
  const clean = base.replace(/^\(|\)$/g, '');
  return ZH[clean] || ZH[clean.replace(/ muscles?$/, '')] || (byBase[base] && byBase[base].zh) || '';
}
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
function baseColor(sys, name) {
  const c = new THREE.Color(SYS[sys].color);
  const n = name.toLowerCase();
  if (sys === 'muscular' && /fascia|aponeuros|tendon|linea alba|ligament|retinacul|septum|tarsus|ring/.test(n)) c.set(0xd8cdb8);
  if (sys === 'cardiovascular' && /vein|vena|venous|sinus/.test(n)) c.set(0x3f6fd1);
  if (sys === 'skeletal' && /cartilage|disc/.test(n)) c.set(0xa9c7d6);
  const v = ((hash(name) % 100) / 100) * 0.08 - 0.04;
  c.offsetHSL(0, 0, v);
  return c;
}

// ───────── loading ─────────
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
async function loadSystem(key) {
  const st = sysState[key];
  if (st.loaded) return; if (st.loading) return st.loading;
  setLoading(`正在加载：${SYS[key].zh}…`);
  st.loading = new Promise((res, rej) => loader.load(`models/${key}.glb`, gltf => {
    const json = gltf.parser.json, assoc = gltf.parser.associations;
    const info = INDEX[key] || {};
    const list = [];
    gltf.scene.traverse(o => { if (o.isMesh) list.push(o); });
    for (const o of list) {
      let a = assoc.get(o), name = null;
      if (a && a.nodes !== undefined) name = json.nodes[a.nodes].name;
      else if (o.parent) { const pa = assoc.get(o.parent); if (pa && pa.nodes !== undefined) name = json.nodes[pa.nodes].name; }
      const meta = name && info[name];
      if (!meta) { o.removeFromParent(); continue; }
      const [base, side, groups] = meta;
      const col = baseColor(key, base);
      o.material = new THREE.MeshStandardMaterial({ color: col, roughness: 0.62, metalness: 0.0, side: THREE.DoubleSide });
      o.userData = { name, base, side, groups, sys: key, color: col.clone() };
      if (key === 'muscular' && (groups.some(g => /fasci/i.test(g)) || /fascia|aponeuros|linea alba|retinacul|septum|sheath/i.test(base))) {
        o.userData.fascia = true; o.visible = $('#optFascia').checked;
      }
      const pa = o.geometry.attributes.position;   // 解量化，保证拾取准确
      if (pa.isInterleavedBufferAttribute || pa.normalized || !(pa.array instanceof Float32Array)) {
        const f = new Float32Array(pa.count * 3);
        for (let i = 0; i < pa.count; i++) { f[i * 3] = pa.getX(i); f[i * 3 + 1] = pa.getY(i); f[i * 3 + 2] = pa.getZ(i); }
        o.geometry.setAttribute('position', new THREE.BufferAttribute(f, 3));
      }
      o.geometry.computeBoundingSphere(); o.geometry.computeBoundingBox();
      meshes.push(o); meshByName.set(name, o);
    }
    st.group.add(gltf.scene);
    st.loaded = true; applyStyles(); setLoading(''); res();
  }, undefined, e => { setLoading('加载失败：' + key); rej(e); }));
  return st.loading;
}
let pending = 0;
function setLoading(t) { if (t && t.startsWith('正在加载')) pending++; else if (!t) { pending = Math.max(0, pending - 1); if (pending) return; } const el = $('#loading'); el.textContent = t; el.style.display = t ? 'block' : 'none'; }

// ───────── visual state ─────────
let heatMap = null;
function applyStyles() {
  for (const m of meshes) {
    const st = sysState[m.userData.sys];
    const mat = m.material;
    const isSel = selected.has(m);
    let op = st.opacity;
    if (ghost && selected.size && !isSel) op = Math.min(op, 0.16);
    mat.transparent = op < 0.999; mat.opacity = op; mat.depthWrite = op > 0.5;
    if (heatMap && m.userData.sys === 'muscular') {
      const hk = heatMap[byBase[m.userData.base]?.id] ?? heatMap[m.userData.base];
      const h = hk == null ? null : (m.userData.side === 'l' ? hk.l : m.userData.side === 'r' ? hk.r : Math.max(hk.l ?? -1, hk.r ?? -1, -1) < 0 ? null : Math.max(hk.l ?? 0, hk.r ?? 0));
      if (h != null) mat.color.setHSL(0.11 - 0.11 * (h / 10), 0.95, 0.5);
      else mat.color.setRGB(0.42, 0.40, 0.40);
    } else mat.color.copy(m.userData.color);
    mat.emissive.copy(isSel ? HL : new THREE.Color(0)); mat.emissiveIntensity = isSel ? (m === primary ? 0.75 : 0.5) : 0;
    m.renderOrder = isSel ? 2 : 0;
  }
  requestRender();
}
function setSelection(list, prim) {
  selected = new Set(list); primary = prim || list[0] || null; applyStyles();
}
function frame(list, pad = 1.6, autoDir = false) {
  const box = new THREE.Box3();
  (list && list.length ? list : null)?.forEach(m => box.expandByObject(m));
  if (box.isEmpty()) box.copy(bodyBox);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  let dir = camera.position.clone().sub(controls.target).normalize();
  if (autoDir) {   // 从肌肉所在的一面去看：前/后/侧
    const axis = bodyBox.getCenter(new THREE.Vector3()); axis.y = c.y;
    const out = c.clone().sub(axis); out.y = 0;
    if (out.length() < 0.02) out.set(0, 0, 1);
    dir = out.normalize().add(new THREE.Vector3(0, 0.15, 0)).normalize();
  }
  const dist = Math.max(size * pad / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))), 0.25);
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
  let t = c.clone(), d = h * 1.9, dir = new THREE.Vector3(0, 0, 1);
  if (name === 'back') dir.set(0, 0, -1);
  if (name === 'left') dir.set(1, 0, 0);       // 身体左侧在 +X
  if (name === 'right') dir.set(-1, 0, 0);
  if (name === 'head') { t.y = bodyBox.min.y + h * 0.88; d = h * 0.45; dir.set(0.5, 0.1, 1).normalize(); }
  if (name === 'trunk') { t.y = bodyBox.min.y + h * 0.66; d = h * 0.8; dir.set(0.35, 0.05, 1).normalize(); }
  tween(t, t.clone().add(dir.multiplyScalar(d)));
}

// ───────── picking ─────────
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  camera.updateMatrixWorld(); ray.setFromCamera(ndc, camera);
  const cand = meshes.filter(m => m.visible && sysState[m.userData.sys].visible && m.material.opacity > 0.15);
  const hit = ray.intersectObjects(cand, false)[0];
  return hit ? hit.object : null;
}
let downAt = null;
canvas.addEventListener('pointerdown', e => downAt = [e.clientX, e.clientY]);
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  const m = pick(e);
  if (m) { selectMesh(m); } else { setSelection([]); closeInfo(); }
});
let lastMove = 0;
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !$('#optLabels').checked || e.buttons) { $('#tip').style.display = 'none'; return; }
  const now = performance.now(); if (now - lastMove < 60) return; lastMove = now;
  const m = pick(e), tip = $('#tip');
  if (!m) { tip.style.display = 'none'; return; }
  const u = m.userData, zh = zhOf(u.base);
  tip.textContent = (zh ? zh + ' · ' : '') + u.base + (u.side ? `（${SIDE[u.side]}）` : '');
  const r = canvas.getBoundingClientRect();
  tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 10) + 'px'; tip.style.display = 'block';
});
canvas.addEventListener('pointerleave', () => $('#tip').style.display = 'none');

function partners(m) {
  const u = m.userData;
  return meshes.filter(x => x.userData.base === u.base && x.userData.sys === u.sys && (showBothSides || x === m));
}
function selectMesh(m) {
  const list = showBothSides ? partners(m) : [m];
  setSelection(list, m);
  showInfoForMesh(m);
}

// ───────── hide / isolate ─────────
function hide(list) { list = list.filter(m => m.visible); if (!list.length) return; list.forEach(m => m.visible = false); hiddenStack.push(list); setSelection([]); closeInfo(); requestRender(); }
function isolate(list) { const keep = new Set(list); hide(meshes.filter(m => !keep.has(m))); setSelection(list); }
$('#btnShowAll').onclick = () => { meshes.forEach(m => m.visible = !m.userData.fascia || $('#optFascia').checked); hiddenStack.length = 0; requestRender(); };
$('#btnUndo').onclick = () => { const l = hiddenStack.pop(); if (l) { l.forEach(m => m.visible = true); requestRender(); } };
$('#btnGhost').onclick = e => { ghost = !ghost; e.target.classList.toggle('on', ghost); applyStyles(); };
document.querySelectorAll('#toolbar [data-view]').forEach(b => b.onclick = () => view(b.dataset.view));
addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select')) return;
  if (e.key === 'h' && selected.size) hide([...selected]);
  if (e.key === 'Escape') { setSelection([]); closeInfo(); }
  if (e.key === 'z' && (e.ctrlKey || e.metaKey)) $('#btnUndo').click();
});

// ───────── info panel ─────────
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function closeInfo() { $('#info').classList.add('hidden'); requestAnimationFrame(resize); }
$('#infoClose').onclick = () => { setSelection([]); closeInfo(); };
function openInfo(html) { $('#infoBody').innerHTML = html; $('#info').classList.remove('hidden'); $('#info').scrollTop = 0; requestAnimationFrame(resize); }

function entryHTML(e) {
  const tests = e.tests.map(t => `<div class="card"><b>▶ ${esc(t.name)}</b>${esc(t.how)}<div class="cue">判断：${esc(t.cue)}</div></div>`).join('');
  return `
   <h3>确认动作</h3>${tests}
   <div class="card"><b>⇄ 拉伸确认</b>${esc(e.stretch)}<div class="cue">拉伸时同一位置出现牵拉痛，与抗阻测试结果互相印证。</div></div>
   <div class="card"><b>☝ 触诊定位</b>${esc(e.palpate)}</div>
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
    `<div class="card">${esc(l.time.replace('T', ' '))} · ${SIDEZH[l.side] || ''} · 程度 ${l.pain}/10<br>${esc((l.feel || []).join('、'))}${l.tests?.length ? ' · 诱发：' + esc(l.tests.join('、')) : ''}${l.note ? '<br>' + esc(l.note) : ''}</div>`).join('');
}
function defHTML(base) {
  const d = DEFS[base]; if (!d || !d.def) return '';
  return `<details><summary style="cursor:pointer;color:var(--mut);font-size:13px;margin-top:14px">英文释义（Z-Anatomy / Wikipedia）</summary><div class="def">${esc(d.def)}</div><div class="lic">文本与模型来自 Z-Anatomy（CC BY-SA 4.0），源自 BodyParts3D 与 Wikipedia。</div></details>`;
}
function showInfoForMesh(m, whole = false) {
  const u = m.userData, e = byBase[u.base], zh = zhOf(u.base);
  const crumb = [SYS[u.sys].zh, ...u.groups.slice(1).map(g => zhOf(g) || g)].join(' › ');
  const la = DEFS[u.base]?.la;
  openInfo(`
    <h2>${esc(e ? e.zh : (zh || u.base))}${u.side && !whole ? ` <small style="font-size:14px;color:var(--mut)">${SIDE[u.side]}</small>` : ''}</h2>
    <div class="en">${esc(u.base)}${la ? ' · <i>' + esc(la) + '</i>' : ''}</div>
    ${e && e.bases.length > 1 ? `<div class="en">所选部分：${esc(zh && zh !== e.zh ? zh : u.base)}</div>` : ''}
    <div class="crumb">${esc(crumb)}</div>
    <div class="acts">
      <button data-a="focus">聚焦</button><button data-a="hide">隐藏</button><button data-a="iso">只看它</button>
      <button data-a="hideGroup">隐藏同组</button>${e ? '<button data-a="all">高亮整块肌肉</button>' : ''}
      <button data-a="log" class="primary">记录不适</button>
    </div>
    ${e ? entryHTML(e) : '<p class="hint">该结构暂无确认动作数据（第一版覆盖头颈与躯干的重点肌肉）。</p>'}
    ${defHTML(u.base)}`);
  const acts = $('#infoBody .acts');
  acts.onclick = ev => {
    const a = ev.target.dataset.a; if (!a) return;
    if (a === 'focus') frame([...selected]);
    if (a === 'hide') hide([...selected]);
    if (a === 'iso') { isolate([...selected]); frame([...selected]); }
    if (a === 'hideGroup') { const g = u.groups[u.groups.length - 1]; hide(meshes.filter(x => x.userData.sys === u.sys && x.userData.groups[x.userData.groups.length - 1] === g)); }
    if (a === 'all') selectEntry(e, false);
    if (a === 'log') openLog({ muscle: e ? e.id : u.base, side: u.side === 'l' ? 'left' : u.side === 'r' ? 'right' : 'mid' });
  };
}
async function selectEntry(e, doFrame = true) {
  await loadSystem('muscular'); setSysVisible('muscular', true);
  const list = meshes.filter(m => m.userData.sys === 'muscular' && e.bases.includes(m.userData.base));
  list.forEach(m => m.visible = true);
  ghost = true; $('#btnGhost').classList.add('on');
  setSelection(list, list[0]);
  if (list[0]) showInfoForMesh(list[0], true);
  if (doFrame) frame(list, 2.2, true);
  document.querySelectorAll('#focusList .item').forEach(b => b.classList.toggle('sel', b.dataset.id === e.id));
}

// ───────── layers pane ─────────
function setSysVisible(k, v) {
  const st = sysState[k]; st.visible = v; st.group.visible = v;
  const cb = document.querySelector(`#layerList input[data-k="${k}"]`); if (cb) cb.checked = v;
  if (v) loadSystem(k); requestRender();
}
function buildLayers() {
  $('#layerList').innerHTML = SYSTEMS.map(s => `
    <div class="layer"><input type="checkbox" data-k="${s.key}" ${s.on ? 'checked' : ''}>
      <span class="sw" style="background:#${s.color.toString(16).padStart(6, '0')}"></span>
      <span>${s.zh}<small>${s.en}</small></span>
      <input type="range" min="0.05" max="1" step="0.05" value="1" data-op="${s.key}" title="不透明度"></div>`).join('');
  $('#layerList').onchange = e => { if (e.target.dataset.k) setSysVisible(e.target.dataset.k, e.target.checked); };
  $('#layerList').oninput = e => { const k = e.target.dataset.op; if (k) { sysState[k].opacity = +e.target.value; applyStyles(); } };
  $('#optFascia').onchange = e => { meshes.forEach(m => { if (m.userData.fascia) m.visible = e.target.checked; }); requestRender(); };
  $('#optSides').onchange = e => showBothSides = e.target.checked;
  $('#optHeat').onchange = e => { heatMap = e.target.checked ? computeHeat() : null; applyStyles(); };
}

// ───────── focus pane ─────────
function buildFocus() {
  const regions = [...new Set(MUSCLES.map(m => m.region))];
  $('#focusList').innerHTML = regions.map(r => `<div class="region"><h4>${r}</h4>${MUSCLES.filter(m => m.region === r).map(m =>
    `<button class="item" data-id="${m.id}"><span class="dot" style="background:${REGION_COLOR[r]}"></span>${esc(m.zh)}<small>${esc(m.en)}</small></button>`).join('')}</div>`).join('');
  $('#focusList').onclick = e => { const b = e.target.closest('.item'); if (b) { selectEntry(MUSCLES.find(m => m.id === b.dataset.id)); closeSideMobile(); } };
  $('#redFlags').innerHTML = window.RED_FLAGS.map(t => `<li>${esc(t)}</li>`).join('');
}

// ───────── search pane ─────────
let SEARCH = [];
function buildSearch() {
  const seen = new Set();
  for (const k in INDEX) for (const n in INDEX[k]) {
    const b = INDEX[k][n][0], id = k + '|' + b; if (seen.has(id)) continue; seen.add(id);
    const zh = zhOf(b);
    SEARCH.push({ k, b, zh, text: (b + ' ' + zh + ' ' + (DEFS[b]?.la || '')).toLowerCase() });
  }
  MUSCLES.forEach(m => SEARCH.push({ entry: m, zh: m.zh, b: m.en, k: 'muscular', text: (m.zh + ' ' + m.en).toLowerCase() }));
  $('#q').oninput = () => {
    const q = $('#q').value.trim().toLowerCase();
    if (!q) { $('#results').innerHTML = ''; return; }
    const res = SEARCH.filter(s => s.text.includes(q)).sort((a, b) => (b.entry ? 1 : 0) - (a.entry ? 1 : 0)).slice(0, 80);
    $('#results').innerHTML = res.map((s, i) => `<button class="item" data-i="${i}">${s.entry ? '★ ' : ''}${esc(s.zh || s.b)}<small>${s.zh ? esc(s.b) + ' · ' : ''}${SYS[s.k].zh}</small></button>`).join('') || '<p class="hint">没有找到</p>';
    $('#results').onclick = async e => {
      const b = e.target.closest('.item'); if (!b) return; const s = res[+b.dataset.i];
      closeSideMobile();
      if (s.entry) return selectEntry(s.entry);
      await loadSystem(s.k); setSysVisible(s.k, true);
      const list = meshes.filter(m => m.userData.sys === s.k && m.userData.base === s.b);
      list.forEach(m => m.visible = true);
      if (list.length) { setSelection(list, list[0]); showInfoForMesh(list[0]); frame(list, 2.4, true); }
    };
  };
}

// ───────── logs ─────────
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
      trigger: f.trigger.value.trim(), note: f.note.value.trim()
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
$('#tabs').onclick = e => {
  const t = e.target.dataset.tab; if (!t) return;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + t));
  if (t === 'search') $('#q').focus();
};
$('#menuBtn').onclick = () => $('#side').classList.toggle('open');
function closeSideMobile() { if (innerWidth <= 820) $('#side').classList.remove('open'); }

window.__dbg = { meshes, THREE, camera, pick: (x, y) => pick({ clientX: x, clientY: y })?.userData.name, ready: () => !pending && sysState.muscular?.loaded && sysState.skeletal?.loaded };
// ───────── boot ─────────
(async function boot() {
  [INDEX, DEFS] = await Promise.all([fetch('data/index.json').then(r => r.json()), fetch('data/definitions.json').then(r => r.json())]);
  for (const s of SYSTEMS) { const g = new THREE.Group(); g.visible = !!s.on; scene.add(g); sysState[s.key] = { group: g, loaded: false, visible: !!s.on, opacity: 1 }; }
  buildLayers(); buildFocus(); buildSearch(); await loadLogs(); renderLogs();
  resize(); view('front');
  await Promise.all(SYSTEMS.filter(s => s.on).map(s => loadSystem(s.key)));
  const box = new THREE.Box3(); sysState.skeletal.group.traverse(o => o.isMesh && box.expandByObject(o));
  if (!box.isEmpty()) bodyBox = box;
  camera.near = 0.01; camera.far = 50; view('front');
})();
