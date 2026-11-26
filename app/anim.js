// 动作动画（原型）：在现有模型上搭骨架、自动蒙皮，播放关节动作；播放时隐藏 / 淡化 / 点选全部照常可用
import * as THREE from 'three';
const $ = s => document.querySelector(s);
let C;                 // ctx：meshes, meshByName, scene, sysState, loadSystem, requestRender, setSelection, frame, replaceMesh, afterRender, onTick
let rig = null;        // { root, bones: {elbow_r, elbow_l}, joints: {...}, skeleton }
const skinned = new Set();

// ───────── 动作库：关节角度关键帧 ─────────
// keys: [时间(0–1), 角度(度)]；phases: 发力阶段；muscles: 主要 / 协同（模型英文结构名）
export const ANIMS = {
  curl: {
    name: '肱二头肌弯举', dur: 3.2,
    joints: [{ joint: 'elbow', keys: [[0, 2], [0.42, 138], [0.52, 138], [1, 2]] }],
    phases: [[0, 0.42, 'con', '向心收缩：屈肘上举，肱二头肌缩短发力'], [0.42, 0.52, 'iso', '顶峰停顿：保持收缩'], [0.52, 1, 'ecc', '离心收缩：慢慢放下，肱二头肌在拉长中控制']],
    primary: ['Long head of biceps brachii', 'Short head of biceps brachii', 'Brachialis muscle'],
    secondary: ['Brachioradialis muscle'],
    view: 'arm',
  },
  hammer_curl: {
    name: '锤式弯举', dur: 3.2,
    joints: [{ joint: 'elbow', keys: [[0, 2], [0.42, 130], [0.52, 130], [1, 2]] }],
    phases: [[0, 0.42, 'con', '向心收缩：屈肘上举'], [0.42, 0.52, 'iso', '顶峰停顿'], [0.52, 1, 'ecc', '离心收缩：慢慢放下']],
    primary: ['Brachialis muscle', 'Brachioradialis muscle'],
    secondary: ['Long head of biceps brachii', 'Short head of biceps brachii'],
    view: 'arm',
  },
  triceps_ext: {
    name: '臂屈伸（下压）', dur: 3.0,
    joints: [{ joint: 'elbow', keys: [[0, 95], [0.4, 3], [0.5, 3], [1, 95]] }],
    phases: [[0, 0.4, 'con', '向心收缩：伸肘下压，肱三头肌缩短发力'], [0.4, 0.5, 'iso', '底部停顿'], [0.5, 1, 'ecc', '离心收缩：慢慢回到屈肘']],
    primary: ['Long head of triceps brachii', 'Lateral head of triceps brachii', 'Medial head of triceps brachii'],
    secondary: ['Anconeus muscle'],
    view: 'arm-back',
  },
};
export const hasAnim = id => !!ANIMS[id];

// ───────── 关节定位（从骨骼几何推算）─────────
function worldVerts(m, step = 1) {
  const pos = m.geometry.attributes.position, out = [], v = new THREE.Vector3();
  m.updateMatrixWorld(true);
  for (let i = 0; i < pos.count; i += step) out.push(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).clone());
  return out;
}
const centroid = pts => pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(Math.max(1, pts.length));
function sliceY(pts, from, to) {   // 取 y 方向某一段的点（0 = 最低，1 = 最高）
  let lo = Infinity, hi = -Infinity; pts.forEach(p => { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); });
  return pts.filter(p => p.y >= lo + (hi - lo) * from && p.y <= lo + (hi - lo) * to);
}
function elbowJoint(side) {
  const hum = C.meshByName.get('Humerus.' + side), rad = C.meshByName.get('Radius.' + side), uln = C.meshByName.get('Ulna.' + side);
  if (!hum || !rad || !uln) return null;
  const H = worldVerts(hum, 2), low = sliceY(H, 0, 0.07);
  const E = centroid(low);
  // 屈伸轴：肱骨远端最内、最外两点（内外上髁）的连线
  let a = low[0], b = low[0]; low.forEach(p => { if (p.x < a.x) a = p; if (p.x > b.x) b = p; });
  const axis = b.clone().sub(a).normalize();
  const W = centroid([...sliceY(worldVerts(rad, 2), 0, 0.05), ...sliceY(worldVerts(uln, 2), 0, 0.05)]);
  const dir = W.clone().sub(E).normalize();
  // 方向校正：屈肘时手要向前（+z）
  const test = W.clone().sub(E).applyAxisAngle(axis, 0.3).add(E);
  if (test.z < W.z) axis.negate();
  return { E, W, axis, dir, len: E.distanceTo(W) };
}

// ───────── 哪些结构参与变形 ─────────
const ARM_RE = /upper limb|of arm|forearm|hand|brachi|elbow|wrist|carp|digit|ulnar|radial|median|cubital|palmar|metacarp|phalan|humer|radius|ulna|biceps|triceps|anconeus|pronator|supinator|pollicis|indicis|lumbrical|interosse|thenar/i;
function eligible(m) {
  const u = m.userData, txt = u.base + ' ' + u.groups.join(' ');
  if (/plantar|foot|toe|hallucis|tarsal|lower limb|femor|tibia|fibul|digiti minimi of foot/i.test(txt)) return false;
  return ARM_RE.test(txt);
}
// 骨骼按整块刚性跟随，不弯曲
const FOREARM_BONES = /^(Radius|Ulna|Scaphoid|Lunate|Triquetrum|Pisiform|Trapezium|Trapezoid|Capitate|Hamate)|metacarpal|phalanx/i;

// ───────── 骨架 + 蒙皮 ─────────
function buildRig() {
  const joints = { elbow_r: elbowJoint('r'), elbow_l: elbowJoint('l') };
  if (!joints.elbow_r || !joints.elbow_l) return null;
  const root = new THREE.Bone(); root.name = 'root';
  const bones = {};
  for (const k of ['elbow_r', 'elbow_l']) { const b = new THREE.Bone(); b.name = k; b.position.copy(joints[k].E); root.add(b); bones[k] = b; }
  C.scene.add(root); root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([root, bones.elbow_r, bones.elbow_l]);
  return { root, bones, joints, skeleton, index: { root: 0, elbow_r: 1, elbow_l: 2 } };
}
function skinMesh(m) {
  if (skinned.has(m) || m.isSkinnedMesh) return;
  const g = m.geometry, pos = g.attributes.position, n = pos.count;
  const sIdx = new Uint16Array(n * 4), sW = new Float32Array(n * 4);
  const u = m.userData, side = u.side || null;
  const R = 0.03;   // 关节处过渡宽度（米）
  m.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const isBone = u.sys === 'skeletal', rigidF = isBone && FOREARM_BONES.test(u.base);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
    const sd = side || (v.x >= 0 ? 'l' : 'r');          // 身体左侧在 +X
    const J = rig.joints['elbow_' + sd];
    let w = 0;
    if (eligible(m)) {
      if (isBone) w = rigidF ? 1 : 0;
      else {
        const s = v.clone().sub(J.E).dot(J.dir);                  // 沿前臂方向离肘关节的距离
        w = THREE.MathUtils.smoothstep(s, -R, R);
        // 离前臂轴线太远的点（躯干、大腿）不跟随
        const t = THREE.MathUtils.clamp(s, 0, J.len + 0.22), onAxis = J.E.clone().addScaledVector(J.dir, t);
        if (v.distanceTo(onAxis) > 0.11) w = 0;
      }
    }
    sIdx[i * 4] = rig.index['elbow_' + sd]; sW[i * 4] = w;
    sIdx[i * 4 + 1] = 0; sW[i * 4 + 1] = 1 - w;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
  const sm = new THREE.SkinnedMesh(g, m.material);
  sm.name = m.name; sm.userData = m.userData; sm.renderOrder = m.renderOrder; sm.visible = m.visible;
  m.parent.add(sm); sm.position.copy(m.position); sm.quaternion.copy(m.quaternion); sm.scale.copy(m.scale);
  sm.updateMatrixWorld(true);
  sm.bind(rig.skeleton, sm.matrixWorld);
  sm.frustumCulled = false;
  C.replaceMesh(m, sm); m.removeFromParent();
  skinned.add(sm);
}
async function ensureRig() {
  await C.loadSystem('skeletal'); await C.loadSystem('muscular');
  if (!rig) { rig = buildRig(); if (!rig) throw new Error('找不到肘关节骨骼'); }
  C.meshes.filter(m => !m.isSkinnedMesh && eligible(m)).forEach(skinMesh);
}
addEventListener('system-loaded', () => { if (rig) C.meshes.filter(m => !m.isSkinnedMesh && eligible(m)).forEach(skinMesh); });

// ───────── 播放 ─────────
let cur = null, t = 0, playing = false, speed = 1, sides = 'r', lastTs = 0;
function angleAt(keys, x) {
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a0] = keys[i], [t1, a1] = keys[i + 1];
    if (x >= t0 && x <= t1) { const k = (x - t0) / (t1 - t0 || 1), e = k * k * (3 - 2 * k); return a0 + (a1 - a0) * e; }
  }
  return keys[keys.length - 1][1];
}
function pose(x) {
  if (!rig || !cur) return;
  for (const jd of cur.joints) for (const sd of ['r', 'l']) {
    const b = rig.bones[jd.joint + '_' + sd], J = rig.joints[jd.joint + '_' + sd];
    const on = sides === 'both' || sides === sd;
    b.quaternion.setFromAxisAngle(J.axis, on ? THREE.MathUtils.degToRad(angleAt(jd.keys, x)) : 0);
  }
  rig.root.updateMatrixWorld(true);
  const ph = cur.phases.find(p => x >= p[0] && x <= p[1]) || cur.phases[0];
  C.setPhase(ph[2], ph[3]);
  $('#apProg').value = Math.round(x * 1000);
  C.requestRender();
}
function tick(ts) {
  if (!playing) return;
  const dt = lastTs ? (ts - lastTs) / 1000 : 0; lastTs = ts;
  t = (t + dt * speed / cur.dur) % 1; pose(t);
  requestAnimationFrame(tick);
}
function setPlaying(p) { playing = p; $('#apPlay').textContent = p ? '⏸' : '▶'; if (p) { lastTs = 0; requestAnimationFrame(tick); } }
export async function play(id) {
  const a = ANIMS[id]; if (!a) return;
  document.body.classList.add('animating');
  $('#animBar').classList.remove('hidden'); $('#apName').textContent = a.name; $('#apPhase').textContent = '正在准备骨架…';
  await ensureRig();
  cur = a; t = 0;
  C.highlight(a.primary, a.secondary, a.view);
  pose(0); setPlaying(true);
}
export function stop() {
  setPlaying(false); t = 0; if (cur) pose(0); cur = null;
  if (rig) { Object.values(rig.bones).forEach(b => b.quaternion.identity()); rig.root.updateMatrixWorld(true); }
  $('#animBar').classList.add('hidden'); document.body.classList.remove('animating'); C.setPhase(null); C.requestRender();
}
export function refreshBounds() { skinned.forEach(m => { m.computeBoundingSphere?.(); m.computeBoundingBox?.(); }); }

export function initAnim(ctx) {
  C = ctx;
  $('#animBar').addEventListener('click', e => {
    const b = e.target.closest('[data-ap]'); if (!b) return;
    const a = b.dataset.ap;
    if (a === 'play') setPlaying(!playing);
    if (a === 'stop') stop();
    if (a === 'speed') { speed = speed === 1 ? 0.5 : speed === 0.5 ? 0.25 : speed === 0.25 ? 2 : 1; b.textContent = speed + '×'; }
    if (a === 'side') { sides = sides === 'r' ? 'l' : sides === 'l' ? 'both' : 'r'; b.textContent = { r: '右侧', l: '左侧', both: '双侧' }[sides]; pose(t); }
  });
  $('#apProg').addEventListener('input', e => { setPlaying(false); t = +e.target.value / 1000; pose(t); });
}
