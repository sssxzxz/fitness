// 结构浏览（列表 / 树）、绘图标注、帮助
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let C;   // ctx：见 viewer 中 initExtras 调用

// ───────── 结构浏览 ─────────
let mode = 'tree', filter = 'all', TREE = null, LIST = [];
const expanded = new Set();
function buildData() {
  TREE = { id: 'root', children: new Map() };
  const seen = new Set();
  for (const sys of C.SYSTEMS.map(s => s.key)) {
    const idx = C.INDEX[sys] || {};
    const sysNode = { id: sys, sys, label: C.SYS[sys].zh, en: C.SYS[sys].en, path: [], children: new Map(), depth: 0 };
    TREE.children.set(sys, sysNode);
    for (const [name, [base, side, groups]] of Object.entries(idx)) {
      let node = sysNode; const path = [];
      for (const g of groups.slice(1)) {     // groups[0] 是系统本身
        path.push(g);
        const id = sys + '|' + path.join('/');
        if (!node.children.has(g)) node.children.set(g, { id, sys, label: C.zhOf(g) || g, en: g, path: [...path], children: new Map(), depth: path.length });
        node = node.children.get(g);
      }
      const id = sys + '#' + base;
      if (!node.children.has('#' + base)) node.children.set('#' + base, { id, sys, base, label: C.zhOf(base) || base, en: base, leaf: true, depth: path.length + 1 });
      if (!seen.has(id)) { seen.add(id); LIST.push({ id, sys, base, label: C.zhOf(base) || base, en: base, la: C.DEFS[base]?.la || '' }); }
    }
  }
  LIST.sort((a, b) => a.en.localeCompare(b.en));
}
function nodeMeshes(n) {
  if (n.leaf) return C.meshes.filter(m => m.userData.sys === n.sys && m.userData.base === n.base);
  if (!n.path?.length) return C.meshes.filter(m => m.userData.sys === n.sys);
  return C.meshes.filter(m => m.userData.sys === n.sys && n.path.every((g, i) => m.userData.groups[i + 1] === g));
}
function nodeState(n) {
  if (!C.sysState[n.sys].loaded) return 'unloaded';
  const ms = nodeMeshes(n); if (!ms.length) return 'none';
  const vis = ms.filter(m => m.userData.state !== 'h').length;
  return vis === ms.length ? 'v' : vis === 0 ? 'h' : 'p';
}
function passFilter(n) {
  if (filter === 'all') return true;
  const s = nodeState(n);
  if (filter === 'visible') return s === 'v' || s === 'p';
  return s === 'h' || s === 'p';
}
function rowHTML(n, depth) {
  const st = nodeState(n);
  const eye = st === 'unloaded' ? '○' : st === 'h' ? '⊘' : st === 'p' ? '◐' : '👁';
  const hasKids = !n.leaf && n.children.size;
  return `<div class="trow${n.leaf ? ' leaf' : ''}${st === 'h' ? ' off' : ''}" data-id="${esc(n.id)}" style="padding-left:${6 + depth * 12}px">
    ${hasKids ? `<button class="caret" data-caret>${expanded.has(n.id) ? '▾' : '▸'}</button>` : '<span class="caret"></span>'}
    <span class="tname" data-pick><b>${esc(n.label)}</b>${n.label !== n.en ? `<small class="en-txt">${esc(n.en)}</small>` : ''}</span>
    <button class="teye" data-eye title="显示 / 隐藏">${eye}</button><button class="tmenu" data-menu title="更多">⋮</button></div>`;
}
const nodeById = new Map();
function indexNodes(n) { nodeById.set(n.id, n); if (n.children) n.children.forEach(indexNodes); }
function renderTree() {
  const out = [];
  const walk = (n, d) => {
    const kids = [...n.children.values()];
    if (n !== TREE) kids.sort((a, b) => (a.leaf - b.leaf) || a.label.localeCompare(b.label, 'zh'));
    for (const c of kids) {
      if (!passFilter(c)) continue;
      out.push(rowHTML(c, d));
      if (!c.leaf && expanded.has(c.id)) walk(c, d + 1);
    }
  };
  walk(TREE, 0);
  return out.join('') || '<p class="hint">没有符合条件的结构</p>';
}
let listLimit = 200;
function renderList(q) {
  const items = LIST.filter(x => !q || (x.label + ' ' + x.en + ' ' + x.la).toLowerCase().includes(q)).map(x => nodeById.get(x.id)).filter(passFilter);
  const entries = q ? C.MUSCLES.filter(m => (m.zh + m.en).toLowerCase().includes(q)) : [];
  return entries.map(m => `<div class="trow leaf star" data-entry="${m.id}"><span class="caret">★</span><span class="tname" data-pick><b>${esc(m.zh)}</b><small>重点肌肉 · 确认动作</small></span></div>`).join('')
    + items.slice(0, listLimit).map(n => rowHTML(n, 0).replace('</b>', `</b><small class="sysname">${esc(C.SYS[n.sys].zh)}</small>`)).join('')
    + (items.length > listLimit ? `<button class="more" data-more>还有 ${items.length - listLimit} 项，显示更多</button>` : '')
    || '<p class="hint">没有找到</p>';
}
export function renderBrowser() {
  if (!TREE) return;
  const q = $('#q').value.trim().toLowerCase();
  $('#bMode').textContent = mode === 'tree' && !q ? '树状' : '列表';
  $('#results').innerHTML = mode === 'tree' && !q ? renderTree() : renderList(q);
}
async function withLoaded(n) { if (!C.sysState[n.sys].loaded) await C.loadSystem(n.sys); C.setSysVisible(n.sys, true); return nodeMeshes(n); }
function closeMenus() { document.querySelectorAll('.tpop').forEach(x => x.remove()); }
function bindBrowser() {
  $('#q').addEventListener('input', () => { listLimit = 200; renderBrowser(); });
  $('#bMode').onclick = () => { mode = mode === 'tree' ? 'list' : 'tree'; renderBrowser(); };
  $('#bExpand').onclick = () => { if (expanded.size) expanded.clear(); else nodeById.forEach(n => { if (!n.leaf && n.children && n.depth <= 2) expanded.add(n.id); }); renderBrowser(); };
  $('#bFilter').onchange = e => { filter = e.target.value; renderBrowser(); };
  $('#results').addEventListener('click', async e => {
    closeMenus();
    if (e.target.closest('[data-more]')) { listLimit += 300; return renderBrowser(); }
    const row = e.target.closest('.trow'); if (!row) return;
    if (row.dataset.entry) { C.closeSideMobile(); return C.selectEntry(C.MUSCLES.find(m => m.id === row.dataset.entry)); }
    const n = nodeById.get(row.dataset.id); if (!n) return;
    if (e.target.closest('[data-caret]')) { expanded.has(n.id) ? expanded.delete(n.id) : expanded.add(n.id); return renderBrowser(); }
    if (e.target.closest('[data-eye]')) {
      const ms = await withLoaded(n); const anyVis = ms.some(m => m.userData.state !== 'h');
      C.commit(ms.map(m => [m, anyVis ? 'h' : 'v'])); return renderBrowser();
    }
    if (e.target.closest('[data-menu]')) {
      const r = e.target.getBoundingClientRect(), pop = document.createElement('div'); pop.className = 'tpop';
      pop.innerHTML = `<button data-m="zoom">定位到这里</button><button data-m="hide">隐藏</button><button data-m="show">显示</button><button data-m="only">只显示这个</button><button data-m="fade">淡化</button><button data-m="fadeothers">淡化其他全部</button>`;
      pop.style.left = Math.min(r.left, innerWidth - 170) + 'px'; pop.style.top = (r.bottom + 2) + 'px';
      document.body.appendChild(pop);
      pop.onclick = async ev => {
        const m = ev.target.dataset.m; if (!m) return; pop.remove();
        const ms = await withLoaded(n);
        if (m === 'zoom') { C.setSelection(ms, ms[0]); C.frame(ms, 1.8, true); }
        if (m === 'hide') C.commit(ms.map(x => [x, 'h']));
        if (m === 'show') C.commit(ms.map(x => [x, 'v']));
        if (m === 'only') C.isolate(ms);
        if (m === 'fade') C.commit(ms.map(x => [x, 'f']));
        if (m === 'fadeothers') C.fadeOthers(ms);
        renderBrowser();
      };
      return;
    }
    // 点击名称：选中并飞到该结构
    const ms = await withLoaded(n);
    const hidden = ms.filter(m => m.userData.state !== 'v'); if (hidden.length) C.commit(hidden.map(m => [m, 'v']));
    if (ms.length) { C.setSelection(ms, ms[0]); C.frame(ms, n.leaf ? 2.2 : 1.4, true); if (n.leaf && C.PREF.autoInfo) C.showInfoForMesh(ms[0]); C.closeSideMobile(); }
    document.querySelectorAll('#results .trow').forEach(x => x.classList.toggle('sel', x === row));
  });
  document.addEventListener('click', e => { if (!e.target.closest('.tpop,[data-menu]')) closeMenus(); });
  let t; const rerender = () => { clearTimeout(t); t = setTimeout(() => { if ($('#pane-search').classList.contains('on')) renderBrowser(); }, 120); };
  addEventListener('styles-changed', rerender); addEventListener('system-loaded', rerender);
}

// ───────── 绘图标注 ─────────
let dctx, drawTool = 'pen', painting = false, last = null;
function sizeCanvas() {
  const cv = $('#drawCanvas'), r = $('#stage').getBoundingClientRect(), dpr = devicePixelRatio || 1;
  const img = cv.width ? dctx.getImageData(0, 0, cv.width, cv.height) : null;
  cv.width = r.width * dpr; cv.height = r.height * dpr; cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  dctx.setTransform(dpr, 0, 0, dpr, 0, 0); if (img) dctx.putImageData(img, 0, 0);
}
export function startDraw() { document.body.classList.add('drawing'); C.controls.enabled = false; sizeCanvas(); setDrawTool('pen'); }
function stopDraw() { document.body.classList.remove('drawing'); C.controls.enabled = true; }
function setDrawTool(t) { drawTool = t; document.querySelectorAll('#drawBar [data-dt]').forEach(b => b.classList.toggle('on', b.dataset.dt === t)); }
function snapshot() {
  C.renderNow();
  const gl = C.renderer.domElement, out = document.createElement('canvas');
  out.width = gl.width; out.height = gl.height; const g = out.getContext('2d');
  g.drawImage(gl, 0, 0); g.drawImage($('#drawCanvas'), 0, 0, out.width, out.height);
  return out;
}
function bindDraw() {
  const cv = $('#drawCanvas'); dctx = cv.getContext('2d');
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), p = [e.clientX - r.left, e.clientY - r.top];
    if (drawTool === 'text') {
      const inp = document.createElement('input'); inp.className = 'drawText'; inp.style.left = (e.clientX) + 'px'; inp.style.top = (e.clientY - 12) + 'px';
      inp.style.color = $('#dColor').value; document.body.appendChild(inp); setTimeout(() => inp.focus(), 0);
      const done = () => { if (inp.value) { dctx.fillStyle = $('#dColor').value; dctx.font = `600 ${8 + +$('#dSize').value * 3}px sans-serif`; dctx.fillText(inp.value, p[0], p[1] + 6); } inp.remove(); };
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') done(); if (ev.key === 'Escape') inp.remove(); }); inp.addEventListener('blur', done);
      return;
    }
    painting = true; last = p; cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => {
    if (!painting) return; const r = cv.getBoundingClientRect(), p = [e.clientX - r.left, e.clientY - r.top];
    dctx.strokeStyle = $('#dColor').value; dctx.lineWidth = +$('#dSize').value; dctx.lineCap = 'round'; dctx.lineJoin = 'round';
    dctx.beginPath(); dctx.moveTo(...last); dctx.lineTo(...p); dctx.stroke(); last = p;
  });
  cv.addEventListener('pointerup', () => painting = false);
  $('#drawBar').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.dt) return setDrawTool(b.dataset.dt);
    const a = b.dataset.da;
    if (a === 'clear') dctx.clearRect(0, 0, cv.width, cv.height);
    if (a === 'exit') stopDraw();
    if (a === 'save') { const url = snapshot().toDataURL('image/png'); const l = document.createElement('a'); l.href = url; l.download = `身体观察-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`; l.click(); }
    if (a === 'copy') {
      try { const blob = await new Promise(r => snapshot().toBlob(r)); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); C.toast('已复制到剪贴板'); }
      catch { C.toast('当前环境不支持复制图片，请用“下载”'); }
    }
  });
  addEventListener('resize', () => { if (document.body.classList.contains('drawing')) sizeCanvas(); });
}

// ───────── 帮助 ─────────
const HELP = {
  basic: `<div class="hgrid">
    <div><b>旋转</b>按住左键拖动<br><small>手机：单指拖动</small></div>
    <div><b>平移</b>按住右键拖动（或 Shift + 左键）<br><small>手机：双指拖动</small></div>
    <div><b>缩放</b>滚轮（朝鼠标位置缩放）<br><small>手机：双指捏合</small></div>
    <div><b>选中</b>单击结构 · Ctrl / Shift + 单击可多选</div>
    <div><b>自动聚焦</b>双击某处，把它移到画面中心并拉近</div>
    <div><b>飞到结构</b>在结构上长按</div></div>`,
  all: `<h4>左侧工具栏</h4><ul>
    <li><b>选择 / 隐藏 / 淡化工具</b>：切换点击模型时的效果。隐藏或淡化模式下，点一下结构就直接隐藏或淡化。</li>
    <li><b>层次</b>：拖动滑块，由外向内一层层淡化肌肉，最后可淡化骨骼，用来观察深层结构。</li>
    <li><b>搜索</b>：按中文、英文或拉丁名找结构；树状视图里每一行都有显示/隐藏开关和“⋮”菜单（定位、隐藏、只显示、淡化、淡化其他）。</li>
    <li><b>绘图</b>：在画面上画笔标注、写文字，可下载或复制截图。</li>
    <li><b>撤销 / 重做 / 重置</b>：重置会恢复所有隐藏、淡化，并回到初始视角。</li></ul>
    <h4>选中结构后的浮动标签</h4><ul><li>🔊 朗读名称 · ⓘ 打开详细信息 · ✕ 取消选择</li><li>隐藏 · 淡化（淡化此结构 / 淡化其他全部）· 只看它</li></ul>
    <h4>右下角导航</h4><ul><li>⌖ 回到初始位置 · ✥ 切换平移/旋转模式 · ＋ / － 缩放 · ⛶ 全屏</li></ul>`,
  keys: `<table class="keys">
    <tr><th colspan="2">工具</th></tr>
    <tr><td>选择 / 隐藏 / 淡化工具</td><td><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></td></tr>
    <tr><td>隐藏选中结构</td><td><kbd>Delete</kbd> <kbd>Backspace</kbd> <kbd>H</kbd> <kbd>Shift+H</kbd></td></tr>
    <tr><td>淡化选中结构</td><td><kbd>Shift+F</kbd></td></tr>
    <tr><td>只看选中结构（隔离）</td><td><kbd>Shift+I</kbd></td></tr>
    <tr><td>聚焦选中结构</td><td><kbd>F</kbd></td></tr>
    <tr><td>重置</td><td><kbd>Shift+R</kbd></td></tr>
    <tr><td>撤销 / 重做</td><td><kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Shift+Z</kbd> <kbd>Ctrl+Y</kbd></td></tr>
    <tr><td>切换平移 / 旋转模式</td><td><kbd>P</kbd></td></tr>
    <tr><th colspan="2">视角</th></tr>
    <tr><td>旋转</td><td><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd></td></tr>
    <tr><td>平移</td><td><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></td></tr>
    <tr><td>放大 / 缩小</td><td><kbd>E</kbd> <kbd>+</kbd> / <kbd>C</kbd> <kbd>-</kbd></td></tr>
    <tr><td>慢速（配合以上按键）</td><td>按住 <kbd>Shift</kbd></td></tr>
    <tr><th colspan="2">其他</th></tr>
    <tr><td>搜索</td><td><kbd>/</kbd></td></tr>
    <tr><td>全屏</td><td><kbd>Ctrl+Enter</kbd></td></tr>
    <tr><td>帮助</td><td><kbd>Shift+/</kbd></td></tr>
    <tr><td>取消选择</td><td><kbd>Esc</kbd></td></tr></table>`
};
export function openHelp(tab = 'basic') {
  const d = $('#helpDlg');
  const show = t => { d.querySelectorAll('[data-ht]').forEach(b => b.classList.toggle('on', b.dataset.ht === t)); $('#helpBody').innerHTML = HELP[t]; };
  d.querySelector('.htabs').onclick = e => { if (e.target.dataset.ht) show(e.target.dataset.ht); };
  show(tab); d.showModal();
}

export function initExtras(ctx) {
  C = ctx; buildData(); indexNodes(TREE); bindBrowser(); bindDraw();
  expanded.add('muscular'); expanded.add('skeletal');
  window.__extras = { startDraw, openHelp, renderBrowser };
  renderBrowser();
}
