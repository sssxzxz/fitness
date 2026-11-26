// 健身模块：动作库、训练记录、训练量统计；以及肌肉的“对症处理”展示
const EX = window.EXERCISES || [], CARE = window.CARE || {}, CG = window.CARE_GENERAL || {};
const EXI = Object.fromEntries(EX.map(e => [e.id, e]));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = s => document.querySelector(s);
let ctx;                      // { isServer, openInfo, highlight(primary, secondary), zhOf, customHTML(key), openMediaEditor(key,title), selectedBase() }
let WORKOUTS = [], cur = null; // cur: 正在编辑的训练
const CATS = ['全部', '力量', '核心稳定', '康复激活', '拉伸', '呼吸'];
let catFilter = '全部', onlySel = false;

// ───────── 存储 ─────────
export async function loadWorkouts(server) {
  try { if (server) { const r = await fetch('api/workouts'); if (r.ok) { WORKOUTS = await r.json(); return; } } } catch {}
  try { WORKOUTS = JSON.parse(localStorage.getItem('bodyworkouts') || '[]'); } catch { WORKOUTS = []; }
}
async function saveWorkout(w) {
  const i = WORKOUTS.findIndex(x => x.id === w.id); if (i >= 0) WORKOUTS[i] = w; else WORKOUTS.push(w);
  if (ctx.isServer()) await fetch('api/workouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(w) });
  else try { localStorage.setItem('bodyworkouts', JSON.stringify(WORKOUTS)); } catch {}
}
async function deleteWorkout(id) {
  WORKOUTS = WORKOUTS.filter(w => w.id !== id);
  if (ctx.isServer()) await fetch('api/workouts/' + encodeURIComponent(id), { method: 'DELETE' });
  else try { localStorage.setItem('bodyworkouts', JSON.stringify(WORKOUTS)); } catch {}
}
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

// ───────── 训练量 ─────────
// 主要肌肉每组记 1，协同肌肉每组记 0.5
export function volumeByBase(days = 7) {
  const since = Date.now() - days * 864e5, v = {};
  for (const w of WORKOUTS) {
    if (+new Date(w.date) < since - 864e5) continue;
    for (const it of w.items || []) {
      const ex = EXI[it.ex]; if (!ex) continue;
      const sets = (it.sets || []).filter(s => s.r || s.t).length; if (!sets) continue;
      ex.primaryBases.forEach(b => v[b] = (v[b] || 0) + sets);
      ex.secondaryBases.forEach(b => v[b] = (v[b] || 0) + sets * 0.5);
    }
  }
  return v;
}

// ───────── 动作卡片 / 详情 ─────────
const chip = id => { const e = EXI[id]; return e ? `<button type="button" class="exchip" data-ex="${id}">${esc(e.zh)}</button>` : `<span class="txtchip">${esc(id)}</span>`; };
export function exercisesForBase(base) {
  const p = EX.filter(e => e.primaryBases.includes(base)), s = EX.filter(e => e.secondaryBases.includes(base));
  if (!p.length && !s.length) return '';
  return `<h3>训练它的动作</h3>
    ${p.length ? `<div class="exrow"><span class="tag">主要发力</span>${p.map(e => chip(e.id)).join('')}</div>` : ''}
    ${s.length ? `<div class="exrow"><span class="tag">协同参与</span>${s.map(e => chip(e.id)).join('')}</div>` : ''}`;
}
export function careHTML(e) {
  const c = CARE[e.id]; if (!c) return '';
  const list = a => (a || []).map(chip).join('') || '<span class="hint">—</span>';
  return `<h3>对症处理</h3>
    <details class="care-gen"><summary>处理原则：急性期 / 恢复期 / 何时就医</summary>
      ${['acute', 'sub', 'doctor'].map(k => CG[k] ? `<b>${esc(CG[k].title)}</b><ul>${CG[k].items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '').join('')}</details>
    <div class="card"><b>① 放松</b>${esc(c.release)}<div class="hint" style="margin-top:4px">${esc(CG.release_how || '')}</div></div>
    <div class="card"><b>② 拉伸</b><div class="exrow">${list(c.stretch)}</div></div>
    <div class="card"><b>③ 强化</b><div class="exrow">${list(c.strengthen)}</div></div>
    <div class="card"><b>④ 日常调整</b><ul>${(c.daily || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
}
function exDetailHTML(e) {
  const nm = b => `<button type="button" class="mchip" data-base="${esc(b)}">${esc(ctx.zhOf(b) || b)}</button>`;
  return `<h2>${esc(e.zh)}</h2><div class="en en-txt">${esc(e.en)}</div>
    <div class="crumb">${esc(e.cat)} · ${esc(e.equip)} · ${esc(e.level)}</div>
    <div class="acts">${window.__anim?.has(e.id) ? `<button type="button" class="primary" data-anim="${e.id}">▶ 动作动画</button>` : ''}<button type="button" class="${window.__anim?.has(e.id) ? '' : 'primary'}" data-addex="${e.id}">＋ 加入今天的训练</button>
      <button type="button" data-edit="ex|${e.id}" data-title="${esc(e.zh)}">✎ 视频 / 图片 / 笔记</button></div>
    ${ctx.customHTML('ex|' + e.id)}
    <h3>目标肌肉</h3>
    <div class="exrow"><span class="tag" style="border-color:#2a8cff">主要</span>${e.primaryBases.map(nm).join('')}</div>
    ${e.secondaryBases.length ? `<div class="exrow"><span class="tag" style="border-color:#ff9800">协同</span>${e.secondaryBases.map(nm).join('')}</div>` : ''}
    <p class="hint">模型中蓝色为主要发力肌肉，橙色为协同肌肉。</p>
    <h3>动作步骤</h3><ol class="steps">${e.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    ${e.cues.length ? `<h3>要点</h3><ul>${e.cues.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    <h3>建议量</h3><p style="font-size:13px">${esc(e.dose)}</p>
    ${historyFor(e.id)}`;
}
function historyFor(id) {
  const rows = WORKOUTS.filter(w => (w.items || []).some(i => i.ex === id)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
    .map(w => { const it = w.items.find(i => i.ex === id); return `<div class="card">${esc(w.date)} · ${it.sets.map(s => (s.w ? s.w + 'kg×' : '') + (s.r || '') + (s.t ? s.t + '秒' : '')).join('，')}</div>`; });
  return rows.length ? `<h3>我的记录</h3>${rows.join('')}` : '';
}
export function showExercise(id) {
  const e = EXI[id]; if (!e) return;
  ctx.openInfo(exDetailHTML(e));
  ctx.highlight(e.primaryBases, e.secondaryBases);
}

// ───────── 侧栏：动作库 / 今日训练 / 历史 ─────────
function renderLib() {
  const q = ($('#exQ').value || '').trim().toLowerCase(), sel = onlySel ? ctx.selectedBase() : null;
  const list = EX.filter(e => (catFilter === '全部' || e.cat === catFilter)
    && (!q || (e.zh + e.en + e.primaryBases.concat(e.secondaryBases).map(b => ctx.zhOf(b)).join('')).toLowerCase().includes(q))
    && (!sel || e.primaryBases.includes(sel) || e.secondaryBases.includes(sel)));
  $('#exCats').innerHTML = CATS.map(c => `<button type="button" data-cat="${c}" class="${c === catFilter ? 'on' : ''}">${c}</button>`).join('');
  $('#exList').innerHTML = list.map(e => `<button class="item" data-ex="${e.id}">${esc(e.zh)}<small>${esc(e.cat)} · ${esc([...new Set(e.primaryBases.map(b => (ctx.zhOf(b) || b).replace(/（.*?）/, '')))].slice(0, 3).join('、'))}</small></button>`).join('')
    || `<p class="hint">${sel ? '没有直接训练所选肌肉的动作' : '没有找到'}</p>`;
}
function renderSession() {
  const box = $('#sessBox');
  if (!cur) { box.innerHTML = `<p class="hint">在动作详情里点「加入今天的训练」，或</p><button type="button" id="sessNew">开始今天的训练</button>`; return; }
  box.innerHTML = `<div class="row"><input type="date" id="sessDate" value="${cur.date}"><span class="hint">${cur.items.length} 个动作</span></div>
    ${cur.items.map((it, i) => { const e = EXI[it.ex]; const timed = /秒|分钟/.test(e?.dose || ''); return `<div class="sess-ex" data-i="${i}">
      <div class="row"><b data-ex="${it.ex}" class="link">${esc(e ? e.zh : it.ex)}</b><span style="flex:1"></span><button type="button" data-rmex="${i}" class="danger">✕</button></div>
      ${it.sets.map((s, j) => `<div class="setrow">第 ${j + 1} 组 <input type="number" inputmode="decimal" placeholder="kg" value="${s.w ?? ''}" data-f="w" data-j="${j}"> ×
        <input type="number" inputmode="numeric" placeholder="${timed ? '秒' : '次'}" value="${(timed ? s.t : s.r) ?? ''}" data-f="${timed ? 't' : 'r'}" data-j="${j}"> ${timed ? '秒' : '次'}
        <button type="button" data-rmset="${j}" title="删除这一组">−</button></div>`).join('')}
      <button type="button" data-addset="${i}">＋ 加一组</button></div>`; }).join('')}
    <label>备注<textarea id="sessNote" rows="2" placeholder="状态、疼痛情况…">${esc(cur.note || '')}</textarea></label>
    <div class="row"><button type="button" class="primary" id="sessSave">保存训练</button><button type="button" id="sessCancel">放弃</button></div>`;
}
function renderHistory() {
  const vol = volumeByBase(7);
  const top = Object.entries(vol).sort((a, b) => b[1] - a[1]).slice(0, 12);
  $('#volBox').innerHTML = top.length ? top.map(([b, v]) => `<div class="volrow"><span>${esc(ctx.zhOf(b) || b)}</span><span class="bar"><i style="width:${Math.min(100, v / (top[0][1] || 1) * 100)}%"></i></span><b>${+v.toFixed(1)}</b></div>`).join('') : '<p class="hint">近 7 天还没有训练记录。</p>';
  $('#histList').innerHTML = WORKOUTS.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(w => `<div class="logitem" data-w="${w.id}">
    <b>${esc(w.date)}</b> · ${(w.items || []).length} 个动作 · ${(w.items || []).reduce((n, i) => n + (i.sets || []).length, 0)} 组
    <div class="meta">${esc((w.items || []).map(i => EXI[i.ex]?.zh || i.ex).join('、'))}</div>${w.note ? `<div>${esc(w.note)}</div>` : ''}</div>`).join('') || '<p class="hint">还没有训练记录。</p>';
}
export function renderTraining() { renderLib(); renderSession(); renderHistory(); }
function addToSession(id) {
  if (!cur) cur = { id: Date.now().toString(36), date: today(), items: [], note: '' };
  if (!cur.items.some(i => i.ex === id)) cur.items.push({ ex: id, sets: [{}, {}, {}] });
  renderSession(); ctx.gotoTab('train'); $('#sessBox').scrollIntoView({ behavior: 'smooth' });
}

export function initFitness(c) {
  ctx = c;
  $('#exQ').oninput = renderLib;
  $('#exOnlySel').onchange = e => { onlySel = e.target.checked; renderLib(); };
  $('#exCats').onclick = e => { const c = e.target.dataset.cat; if (c) { catFilter = c; renderLib(); } };
  $('#exList').onclick = e => { const b = e.target.closest('[data-ex]'); if (b) { showExercise(b.dataset.ex); ctx.closeSideMobile(); } };
  // 信息面板里的动作 / 肌肉按钮
  $('#infoBody').addEventListener('click', e => {
    const a = e.target.closest('[data-addex]'); if (a) return addToSession(a.dataset.addex);
    const an = e.target.closest('[data-anim]'); if (an) { ctx.closeSideMobile(); return window.__anim.play(an.dataset.anim); }
    const x = e.target.closest('.exchip,[data-ex].link'); if (x) return showExercise(x.dataset.ex);
    const m = e.target.closest('.mchip'); if (m) return ctx.selectBase(m.dataset.base);
  });
  const box = $('#sessBox');
  box.addEventListener('click', async e => {
    const d = e.target.dataset;
    if (e.target.id === 'sessNew') { cur = { id: Date.now().toString(36), date: today(), items: [], note: '' }; renderSession(); return; }
    if (e.target.closest('[data-ex].link')) return showExercise(e.target.closest('[data-ex]').dataset.ex);
    const i = +e.target.closest('.sess-ex')?.dataset.i;
    if (d.addset != null) { const s = cur.items[+d.addset].sets; s.push({ ...(s[s.length - 1] || {}) }); renderSession(); }
    if (d.rmset != null) { cur.items[i].sets.splice(+d.rmset, 1); renderSession(); }
    if (d.rmex != null) { cur.items.splice(+d.rmex, 1); renderSession(); }
    if (e.target.id === 'sessCancel') { if (confirm('放弃这次未保存的训练？')) { cur = null; renderSession(); } }
    if (e.target.id === 'sessSave') {
      cur.note = $('#sessNote').value.trim(); cur.date = $('#sessDate').value || today();
      cur.items = cur.items.map(it => ({ ...it, sets: it.sets.filter(s => s.r || s.t) })).filter(it => it.sets.length);
      if (!cur.items.length) { alert('还没有填写任何一组的次数或时间'); return; }
      await saveWorkout(cur); cur = null; renderTraining(); ctx.onVolumeChange();
    }
  });
  box.addEventListener('input', e => {
    const d = e.target.dataset; if (!d.f) return;
    const i = +e.target.closest('.sess-ex').dataset.i; const v = e.target.value === '' ? undefined : +e.target.value;
    cur.items[i].sets[+d.j][d.f] = v;
  });
  $('#histList').onclick = e => {
    const it = e.target.closest('[data-w]'); if (!it) return;
    const w = WORKOUTS.find(x => x.id === it.dataset.w);
    const act = prompt(`${w.date} 的训练：\n输入 1 = 载入修改，2 = 删除`, '1');
    if (act === '1') { cur = JSON.parse(JSON.stringify(w)); renderSession(); }
    if (act === '2' && confirm('确定删除？')) deleteWorkout(w.id).then(() => { renderTraining(); ctx.onVolumeChange(); });
  };
  renderTraining();
}
