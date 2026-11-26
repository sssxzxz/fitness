// 确认动作：详细卡片、视频/图片/笔记编辑、逐项测试流程
// 由 app.js 调用 initTestsUI(ctx) 注入共享函数
const DETAIL = window.TEST_DETAIL || {}, GENERAL = window.TEST_GENERAL || [];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = s => document.querySelector(s);
let ctx = null;                 // { isServer(), saveLog(log), MUSCLES, onChange() }
export let CUSTOM = {};
const ck = (id, name) => id + '|' + name;

// ───────── 自定义内容存储 ─────────
export async function loadCustom(serverMode) {
  try {
    if (serverMode) { const r = await fetch('api/custom'); if (r.ok) { CUSTOM = await r.json(); return; } }
  } catch {}
  try { CUSTOM = JSON.parse(localStorage.getItem('bodycustom') || '{}'); } catch { CUSTOM = {}; }
}
async function saveCustom(key, value) {
  if (value && !value.media?.length && !value.note) value = null;
  if (value == null) delete CUSTOM[key]; else CUSTOM[key] = value;
  if (ctx.isServer()) await fetch('api/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
  else try { localStorage.setItem('bodycustom', JSON.stringify(CUSTOM)); } catch {}
}

// ───────── 媒体渲染 ─────────
function parseMedia(url) {
  let m;
  if ((m = /bilibili\.com\/video\/(BV[\w]+)/i.exec(url)) || (m = /^(BV[\w]{8,})$/i.exec(url))) return { type: 'bilibili', id: m[1] };
  if ((m = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i.exec(url))) return { type: 'youtube', id: m[1] };
  if (/\.(mp4|webm|m4v|mov)(\?|#|$)/i.test(url) || url.startsWith('media/') && /\.(mp4|webm|m4v|mov)$/i.test(url)) return { type: 'video' };
  if (/\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(url)) return { type: 'image' };
  return { type: 'link' };
}
function mediaItemHTML(it) {
  const cap = it.title ? `<div class="mcap">${esc(it.title)}</div>` : '';
  const s = +it.start || 0, e = +it.end || 0;
  const p = parseMedia(it.src);
  if (p.type === 'video') return `<figure class="media"><video controls playsinline preload="metadata" src="${esc(it.src)}${s || e ? `#t=${s}${e ? ',' + e : ''}` : ''}"></video>${cap}</figure>`;
  if (p.type === 'image') return `<figure class="media"><img loading="lazy" src="${esc(it.src)}" alt="${esc(it.title || '')}">${cap}</figure>`;
  if (p.type === 'youtube') return `<figure class="media"><div class="frame"><iframe src="https://www.youtube-nocookie.com/embed/${p.id}?rel=0${s ? '&start=' + s : ''}${e ? '&end=' + e : ''}" allowfullscreen loading="lazy"></iframe></div>${cap}<a class="ext" href="${esc(it.src)}" target="_blank" rel="noopener">在 YouTube 打开</a></figure>`;
  if (p.type === 'bilibili') return `<figure class="media"><div class="frame"><iframe src="https://player.bilibili.com/player.html?bvid=${p.id}&autoplay=0&high_quality=1${s ? '&t=' + s : ''}" allowfullscreen loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"></iframe></div>${cap}<a class="ext" href="https://www.bilibili.com/video/${p.id}${s ? '?t=' + s : ''}" target="_blank" rel="noopener">在 B 站打开</a></figure>`;
  return `<figure class="media"><a href="${esc(it.src)}" target="_blank" rel="noopener">🔗 ${esc(it.title || it.src)}</a></figure>`;
}
function customHTML(key) {
  const c = CUSTOM[key]; if (!c) return '';
  return (c.media || []).map(mediaItemHTML).join('') + (c.note ? `<div class="mynote"><b>我的补充：</b>${esc(c.note)}</div>` : '');
}
function detailHTML(d) {
  if (!d) return '';
  const steps = (d.steps || []).filter(Boolean);
  return `<div class="detail">
    ${d.pos && d.pos !== '—' ? `<div><span class="tag">起始姿势</span>${esc(d.pos)}</div>` : ''}
    ${steps.length ? `<ol>${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    ${d.pos_sign && d.pos_sign !== '—' ? `<div class="sign pos"><span class="tag">阳性</span>${esc(d.pos_sign)}</div>` : ''}
    ${d.neg_sign && d.neg_sign !== '—' ? `<div class="sign neg"><span class="tag">正常</span>${esc(d.neg_sign)}</div>` : ''}
    ${d.comp?.length ? `<div><span class="tag">常见错误</span><ul>${d.comp.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
    ${d.caution ? `<div class="sign warn"><span class="tag">注意</span>${esc(d.caution)}</div>` : ''}
  </div>`;
}
// 一张确认动作卡片
export function testCardHTML(e, name, icon, summary, cue) {
  const key = ck(e.id, name), d = DETAIL[e.id]?.[name], cust = CUSTOM[key];
  const nMedia = cust?.media?.length || 0;
  return `<div class="card test" data-key="${esc(key)}">
    <b>${icon} ${esc(name)}${nMedia ? ` <span class="badge">${nMedia} 个视频/图片</span>` : ''}</b>${esc(summary)}
    ${cue ? `<div class="cue">判断：${esc(cue)}</div>` : ''}
    ${customHTML(key)}
    <details class="more"${cust ? '' : ''}><summary>详细步骤 · 判断标准</summary>${detailHTML(d) || '<p class="hint">暂无详细说明</p>'}</details>
    <div class="tbtns"><button type="button" data-edit="${esc(key)}" data-title="${esc(e.zh + ' · ' + name)}">✎ 添加视频 / 图片 / 笔记</button></div>
  </div>`;
}
export function entryTestsHTML(e) {
  return `<div class="row"><button type="button" class="primary" data-guide="${e.id}">▶ 开始逐项测试</button><span class="hint">按顺序做完并记录结果</span></div>
    ${e.tests.map(t => testCardHTML(e, t.name, '▶', t.how, t.cue)).join('')}
    ${testCardHTML(e, '拉伸确认', '⇄', e.stretch, '拉伸时同一位置出现牵拉痛，与抗阻测试结果互相印证。')}
    ${testCardHTML(e, '触诊定位', '☝', e.palpate, '')}`;
}
// 信息面板内的点击（委托）
export function bindInfoEvents(root) {
  root.addEventListener('click', ev => {
    const ed = ev.target.closest('[data-edit]'); if (ed) return openMediaEditor(ed.dataset.edit, ed.dataset.title);
    const g = ev.target.closest('[data-guide]'); if (g) return startGuide(ctx.MUSCLES.find(m => m.id === g.dataset.guide));
  });
}

// ───────── 编辑：视频 / 图片 / 笔记 ─────────
let editing = null;
function renderMList() {
  $('#mList').innerHTML = editing.media.length ? editing.media.map((it, i) => `<div class="mrow"><span>${parseMedia(it.src).type === 'link' ? '🔗' : /video|youtube|bilibili/.test(parseMedia(it.src).type) ? '🎬' : '🖼'} ${esc(it.title || it.src)}${it.start || it.end ? ` <small>(${it.start || 0}s–${it.end || '结束'})</small>` : ''}</span>
    <span><button type="button" data-up="${i}" title="上移">↑</button><button type="button" data-del="${i}" class="danger" title="删除">✕</button></span></div>`).join('') : '<p class="hint">还没有添加视频或图片。</p>';
}
function openMediaEditor(key, title) {
  const cur = CUSTOM[key] || {};
  editing = { key, media: (cur.media || []).map(x => ({ ...x })), removed: [] };
  $('#mTitle').textContent = title;
  $('#mNote').value = cur.note || '';
  $('#mUrl').value = ''; $('#mCap').value = ''; $('#mStart').value = ''; $('#mEnd').value = ''; $('#mFile').value = ''; $('#mProg').textContent = '';
  $('#mFileRow').style.display = ctx.isServer() ? '' : 'none';
  $('#mLocalHint').style.display = ctx.isServer() ? 'none' : '';
  renderMList();
  $('#mediaDlg').returnValue = ''; $('#mediaDlg').showModal();
}
function uploadFile(file) {
  return new Promise((ok, bad) => {
    const x = new XMLHttpRequest();
    x.open('POST', 'api/upload?name=' + encodeURIComponent(file.name));
    x.upload.onprogress = e => { if (e.lengthComputable) $('#mProg').textContent = `上传中 ${Math.round(e.loaded / e.total * 100)}%（${(e.total / 1048576).toFixed(1)} MB）`; };
    x.onload = () => { try { const r = JSON.parse(x.responseText); r.src ? ok(r) : bad(new Error(r.error || '上传失败')); } catch { bad(new Error('上传失败')); } };
    x.onerror = () => bad(new Error('网络错误'));
    x.send(file);
  });
}
function bindMediaDialog() {
  $('#mList').onclick = ev => {
    const d = ev.target.dataset;
    if (d.del != null) { const [it] = editing.media.splice(+d.del, 1); if (it.src.startsWith('media/')) editing.removed.push(it.src); renderMList(); }
    if (d.up != null && +d.up > 0) { const i = +d.up; [editing.media[i - 1], editing.media[i]] = [editing.media[i], editing.media[i - 1]]; renderMList(); }
  };
  $('#mAdd').onclick = async () => {
    const file = $('#mFile').files[0], url = $('#mUrl').value.trim();
    const meta = { title: $('#mCap').value.trim(), start: +$('#mStart').value || 0, end: +$('#mEnd').value || 0 };
    if (!file && !url) { $('#mProg').textContent = '请选择文件或粘贴链接'; return; }
    $('#mAdd').disabled = true;
    try {
      if (file) { const r = await uploadFile(file); editing.media.push({ src: r.src, ...meta, title: meta.title || file.name }); $('#mProg').textContent = '上传完成 ✓'; }
      else { if (!/^https?:\/\//i.test(url) && !/^BV/i.test(url)) throw new Error('链接需以 http:// 或 https:// 开头'); editing.media.push({ src: url, ...meta }); $('#mProg').textContent = '已添加 ✓'; }
      $('#mFile').value = ''; $('#mUrl').value = ''; $('#mCap').value = ''; $('#mStart').value = ''; $('#mEnd').value = '';
      renderMList();
    } catch (e) { $('#mProg').textContent = '✗ ' + e.message; }
    $('#mAdd').disabled = false;
  };
  $('#mediaDlg').addEventListener('close', async () => {
    if ($('#mediaDlg').returnValue !== 'ok' || !editing) return;
    await saveCustom(editing.key, { media: editing.media, note: $('#mNote').value.trim() });
    for (const src of editing.removed) fetch('api/media/' + encodeURIComponent(src.slice(6)), { method: 'DELETE' }).catch(() => {});
    editing = null; ctx.onChange();
  });
}

// ───────── 逐项测试 ─────────
const RES = [['', '未测'], ['ok', '正常'], ['pain', '痛'], ['weak', '无力'], ['both', '痛+无力']];
let G = null;
function guideItems(e) {
  const items = e.tests.map(t => ({ name: t.name, kind: 'resist', how: t.how, cue: t.cue }));
  const st = DETAIL[e.id]?.['拉伸确认'], pa = DETAIL[e.id]?.['触诊定位'];
  if (!(st && st.pos === '—' && st.pos_sign === '—')) items.push({ name: '拉伸确认', kind: 'stretch', how: e.stretch });
  if (!(pa && pa.pos === '—')) items.push({ name: '触诊定位', kind: 'palp', how: e.palpate });
  return items.filter(it => !/无可靠/.test(it.name));
}
function startGuide(e) {
  G = { e, items: guideItems(e), i: -1, sides: ['r'], res: {} };
  renderGuide(); $('#guideDlg').showModal();
}
function sideSel(it, sd) {
  const k = it.name + '|' + sd, cur = G.res[k] || {};
  return `<div class="gside"><b>${sd === 'l' ? '左侧' : '右侧'}</b>
    <div class="seg">${RES.map(([v, t]) => `<button type="button" data-k="${esc(k)}" data-v="${v}" class="${(cur.v || '') === v ? 'on' : ''}">${t}</button>`).join('')}</div>
    ${/pain|both/.test(cur.v) ? `<label class="pl">疼痛 <input type="range" min="1" max="10" value="${cur.p || 5}" data-pk="${esc(k)}"><b>${cur.p || 5}</b>/10</label>` : ''}</div>`;
}
function summarize() {
  const e = G.e, rows = [], pos = { resist: [], stretch: [], palp: [] }, weakOnly = [];
  let maxP = 0;
  for (const it of G.items) for (const sd of G.sides) {
    const r = G.res[it.name + '|' + sd]; if (!r || !r.v) continue;
    rows.push({ test: it.name, side: sd, v: r.v, p: /pain|both/.test(r.v) ? (r.p || 5) : 0 });
    if (/pain|both/.test(r.v)) { pos[it.kind].push(it.name + (sd === 'l' ? '(左)' : '(右)')); maxP = Math.max(maxP, r.p || 5); }
    if (r.v === 'weak') weakOnly.push(it.name + (sd === 'l' ? '(左)' : '(右)'));
  }
  const lines = [];
  if (pos.resist.length && pos.stretch.length) lines.push(`抗阻与拉伸都诱发疼痛 → 较支持「${e.zh}」相关。`);
  else if (pos.resist.length) lines.push(`抗阻诱发疼痛（${pos.resist.join('、')}）→ 提示「${e.zh}」或其肌腱可能相关；可结合拉伸和触诊确认。`);
  else if (pos.stretch.length) lines.push('仅拉伸诱发疼痛 → 可能是该肌肉紧张，也可能来自附近的关节或其他软组织，建议对照「与易混结构的区分」。');
  if (pos.palp.length) lines.push('触诊有压痛，可作为定位参考。');
  if (weakOnly.length) lines.push(`出现无力但不痛（${weakOnly.join('、')}）→ 可能与神经或肌力不足有关；若是新出现或在加重，建议就医。`);
  if (!lines.length) lines.push(rows.length ? `本次测试未诱发明显症状，「${e.zh}」可能不是主要来源。可查看「与易混结构的区分」测试相邻肌肉。` : '还没有记录任何结果。');
  return { rows, lines, maxP, positives: [...pos.resist, ...pos.stretch, ...pos.palp] };
}
const RESZH = Object.fromEntries(RES);
export function resultsText(results) {
  return (results || []).filter(r => r.v && r.v !== 'ok').map(r => `${r.test}${r.side === 'l' ? '左' : '右'}${RESZH[r.v]}${r.p ? r.p : ''}`).join('，');
}
function renderGuide() {
  const e = G.e, n = G.items.length, i = G.i;
  let body;
  if (i < 0) {
    body = `<h3>逐项测试：${esc(e.zh)}</h3>
      <p class="hint">共 ${n} 项。每一项做完后点选结果，最后可以保存为一条记录。</p>
      <div class="card"><b>测试前请先读</b><ul>${GENERAL.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div class="row"><span>要测试哪一侧？</span>
        <label class="chk"><input type="checkbox" data-side="l" ${G.sides.includes('l') ? 'checked' : ''}> 左侧</label>
        <label class="chk"><input type="checkbox" data-side="r" ${G.sides.includes('r') ? 'checked' : ''}> 右侧</label></div>`;
  } else if (i < n) {
    const it = G.items[i], key = ck(e.id, it.name), d = DETAIL[e.id]?.[it.name];
    body = `<div class="gprog">${i + 1} / ${n}</div><h3>${esc(it.name)}</h3>
      <p>${esc(it.how)}</p>${it.cue ? `<div class="cue">判断：${esc(it.cue)}</div>` : ''}
      ${customHTML(key)}${detailHTML(d)}
      <div class="gres">${G.sides.map(sd => sideSel(it, sd)).join('')}</div>`;
  } else {
    const s = summarize(); G.summary = s;
    body = `<h3>测试结果：${esc(e.zh)}</h3>
      ${s.rows.length ? `<table class="gtab"><tr><th>动作</th><th>侧</th><th>结果</th></tr>${s.rows.map(r => `<tr class="${r.v}"><td>${esc(r.test)}</td><td>${r.side === 'l' ? '左' : '右'}</td><td>${RESZH[r.v]}${r.p ? ' ' + r.p + '/10' : ''}</td></tr>`).join('')}</table>` : ''}
      <div class="card">${s.lines.map(l => `<p>• ${esc(l)}</p>`).join('')}<p class="hint">这是根据测试结果做的初步提示，不是诊断。</p></div>
      <label>备注<textarea id="gNote" rows="2" placeholder="例如：久坐后加重、热敷后缓解…"></textarea></label>`;
  }
  $('#guideBody').innerHTML = body;
  $('#gPrev').style.visibility = i < 0 ? 'hidden' : 'visible';
  $('#gNext').textContent = i < 0 ? '开始' : i < n - 1 ? '下一项' : i === n - 1 ? '查看结果' : '保存为记录';
  $('#guideBody').scrollTop = 0;
}
function bindGuideDialog() {
  $('#guideBody').addEventListener('click', ev => {
    const b = ev.target.closest('[data-k]'); if (!b) return;
    G.res[b.dataset.k] = { ...(G.res[b.dataset.k] || {}), v: b.dataset.v }; renderGuide();
  });
  $('#guideBody').addEventListener('input', ev => {
    const k = ev.target.dataset.pk; if (k) { G.res[k].p = +ev.target.value; ev.target.nextElementSibling.textContent = ev.target.value; }
  });
  $('#guideBody').addEventListener('change', ev => {
    const sd = ev.target.dataset.side; if (!sd) return;
    G.sides = [...document.querySelectorAll('#guideBody [data-side]:checked')].map(x => x.dataset.side);
  });
  $('#gPrev').onclick = () => { G.i--; renderGuide(); };
  $('#gClose').onclick = () => $('#guideDlg').close();
  $('#gNext').onclick = async () => {
    if (G.i < 0 && !G.sides.length) { alert('请至少选择一侧'); return; }
    if (G.i < G.items.length) { G.i++; renderGuide(); return; }
    const s = G.summary, d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const posSides = new Set(s.rows.filter(r => r.v !== 'ok').map(r => r.side));
    const side = posSides.size === 2 ? 'both' : posSides.has('l') ? 'left' : posSides.has('r') ? 'right' : (G.sides.length === 2 ? 'both' : G.sides[0] === 'l' ? 'left' : 'right');
    await ctx.saveLog({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), muscle: G.e.id, side, time: d.toISOString().slice(0, 16),
      pain: s.maxP, feel: [], tests: [...new Set(s.rows.filter(r => /pain|both/.test(r.v)).map(r => r.test))],
      results: s.rows, summary: s.lines.join(' '), kind: 'guided', trigger: '', note: ($('#gNote')?.value || '').trim()
    });
    $('#guideDlg').close(); ctx.onChange();
  };
}

export function initTestsUI(c) { ctx = c; bindMediaDialog(); bindGuideDialog(); }
