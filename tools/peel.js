(async () => {
  const { meshes, THREE, renderer, scene } = window.__dbg;
  const all = meshes.filter(m => (m.userData.sys === 'muscular' && !m.userData.fascia) || m.userData.sys === 'skeletal');
  const musc = all.filter(m => m.userData.sys === 'muscular');
  const box = new THREE.Box3(); all.forEach(m => box.expandByObject(m));
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const R = Math.max(size.x, size.y, size.z) * 0.6;
  const S = 640, rt = new THREE.WebGLRenderTarget(S, S);
  // 每块肌肉的表面积 → 估算无遮挡时应占的像素数
  const area = new Map();
  for (const m of all) { const g = m.geometry, pos = g.attributes.position, idx = g.index; let A = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
    const n = idx ? idx.count : pos.count; const sc = m.getWorldScale(new THREE.Vector3()).x;
    for (let i = 0; i < n; i += 3) { const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); cc.fromBufferAttribute(pos, i2); A += b.sub(a).cross(cc.sub(a)).length() / 2; }
    area.set(m, A * sc * sc); }
  const mats = new Map(); all.forEach((m, i) => { mats.set(m, m.material); m.userData._id = i + 1; });
  const idMat = all.map((m, i) => new THREE.MeshBasicMaterial({ color: new THREE.Color(((i + 1) >> 16 & 255) / 255, ((i + 1) >> 8 & 255) / 255, ((i + 1) & 255) / 255), side: THREE.DoubleSide }));
  const hiddenOthers = []; scene.traverse(o => { if (o.isMesh && !all.includes(o) && o.visible) { o.visible = false; hiddenOthers.push(o); } });
  const dirs = [];
  for (const el of [-0.6, -0.2, 0.2, 0.6]) for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; dirs.push(new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el))); }
  dirs.push(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0));
  // 分段：身体高度方向切成 3 段分别取景，提高分辨率
  const bands = [[box.min.y, box.min.y + size.y * 0.45], [box.min.y + size.y * 0.4, box.min.y + size.y * 0.75], [box.min.y + size.y * 0.7, box.max.y]];
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  const buf = new Uint8Array(S * S * 4);
  all.forEach((m, i) => m.material = idMat[i]);
  const layer = new Map(); let remaining = new Set(musc); const active = new Set(all);
  for (let L = 1; L <= 12 && remaining.size; L++) {
    const best = new Map();
    for (const [y0, y1] of bands) {
      const bc = new THREE.Vector3(c.x, (y0 + y1) / 2, c.z), half = Math.max((y1 - y0) / 2, size.x / 2) * 1.05;
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
      for (const d of dirs) {
        cam.position.copy(bc).addScaledVector(d, R * 2); cam.up.set(Math.abs(d.y) > 0.9 ? 1 : 0, Math.abs(d.y) > 0.9 ? 0 : 1, 0); cam.lookAt(bc);
        cam.near = 0.01; cam.far = R * 4; cam.updateProjectionMatrix();
        renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, cam);
        renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf);
        const cnt = new Map();
        for (let p = 0; p < buf.length; p += 4) { const id = (buf[p] << 16) | (buf[p + 1] << 8) | buf[p + 2]; if (id) cnt.set(id, (cnt.get(id) || 0) + 1); }
        const pxPerM2 = (S / (2 * half)) ** 2;
        for (const [id, n] of cnt) { const m = all[id - 1]; const exp = Math.max(1, area.get(m) / 4 * pxPerM2); best.set(id, Math.max(best.get(id) || 0, n / exp)); }
      }
    }
    const peeled = [...remaining].filter(m => (best.get(m.userData._id) || 0) >= 0.35);
    if (!peeled.length) break;
    peeled.forEach(m => { layer.set(m.userData.name, L); remaining.delete(m); m.visible = false; });
  }
  remaining.forEach(m => layer.set(m.userData.name, 99));
  renderer.setRenderTarget(null); renderer.setClearColor(0x14171c, 1);
  all.forEach(m => { m.material = mats.get(m); m.visible = true; }); hiddenOthers.forEach(o => o.visible = true);
  const hist = {}; layer.forEach(v => hist[v] = (hist[v] || 0) + 1);
  window.__layers = { layers: Object.fromEntries(layer), hist };
  return hist;
})()
