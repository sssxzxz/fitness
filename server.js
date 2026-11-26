// 本地服务器（Node 版，无需安装依赖，Node 18+）
// 提供 3D 应用页面；把不适记录、自定义说明保存到 userdata/；上传的视频图片存到 userdata/media/
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const PORT = +process.env.PORT || 8686;
const ROOT = path.join(__dirname, 'app');
const DATA_DIR = path.join(__dirname, 'userdata');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const LOGS = path.join(DATA_DIR, 'logs.json'), CUSTOM = path.join(DATA_DIR, 'custom.json');
const MAX_UPLOAD = 2 * 1024 ** 3;
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const load = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const save = (f, o) => { fs.writeFileSync(f + '.tmp', JSON.stringify(o, null, 2)); fs.renameSync(f + '.tmp', f); };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
const MEDIA_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.m4v', '.webm', '.mov'];
const json = (res, o, code = 200) => { res.statusCode = code; res.setHeader('Content-Type', TYPES['.json']); res.end(JSON.stringify(o)); };
const readBody = (req, limit = 5e6) => new Promise((ok, bad) => { let b = ''; req.on('data', c => { b += c; if (b.length > limit) { bad(new Error('too large')); req.destroy(); } }); req.on('end', () => ok(b)); });

function sendFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', cache); res.setHeader('Accept-Ranges', 'bytes');
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      let start = m[1] ? +m[1] : Math.max(0, st.size - +m[2]), end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      if (start > end) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${st.size}`); return res.end(); }
      res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`); res.setHeader('Content-Length', end - start + 1);
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.setHeader('Content-Length', st.size); fs.createReadStream(file).pipe(res);
  });
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
  try {
    if (p === '/api/logs') {
      if (req.method === 'GET') return json(res, load(LOGS, []));
      if (req.method === 'POST') { const log = JSON.parse(await readBody(req)); if (!log.id) throw 0; save(LOGS, load(LOGS, []).filter(x => x.id !== log.id).concat([log])); return json(res, {}); }
    }
    if (p.startsWith('/api/logs/') && req.method === 'DELETE') { const id = p.slice(10); save(LOGS, load(LOGS, []).filter(x => x.id !== id)); return json(res, {}); }
    if (p === '/api/custom') {
      if (req.method === 'GET') return json(res, load(CUSTOM, {}));
      if (req.method === 'POST') { const { key, value } = JSON.parse(await readBody(req)); const c = load(CUSTOM, {}); if (value == null) delete c[key]; else c[key] = value; save(CUSTOM, c); return json(res, {}); }
    }
    if (p === '/api/upload' && req.method === 'POST') {
      const n = +req.headers['content-length'] || 0;
      if (n <= 0 || n > MAX_UPLOAD) return json(res, { error: '文件为空或超过 2GB' }, 413);
      const orig = u.searchParams.get('name') || 'file', ext = path.extname(orig).toLowerCase();
      if (!MEDIA_EXT.includes(ext)) return json(res, { error: '只支持视频或图片' }, 400);
      const stem = (path.basename(orig, path.extname(orig)).replace(/[^\w一-鿿-]+/g, '_').slice(0, 40)) || 'file';
      const d = new Date(), ts = d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const name = `${ts.slice(0, 8)}-${ts.slice(8)}-${stem}${ext}`, fp = path.join(MEDIA_DIR, name);
      const out = fs.createWriteStream(fp + '.part');
      req.pipe(out);
      return out.on('finish', () => { fs.renameSync(fp + '.part', fp); json(res, { src: 'media/' + name, name }); })
                .on('error', () => json(res, { error: '上传失败' }, 500));
    }
    if (p.startsWith('/api/media/') && req.method === 'DELETE') { const f = path.join(MEDIA_DIR, path.basename(p.slice(11))); if (fs.existsSync(f)) fs.unlinkSync(f); return json(res, {}); }
    if (p.startsWith('/api/')) return json(res, {}, 405);
    if (p.startsWith('/media/')) return sendFile(req, res, path.join(MEDIA_DIR, path.basename(p.slice(7))), 'no-cache');
    const file = path.normalize(path.join(ROOT, p === '/' ? 'index.html' : p));
    if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
    sendFile(req, res, file, file.endsWith('.glb') ? 'max-age=86400' : 'no-cache');
  } catch (e) { json(res, { error: String(e && e.message || e) }, 400); }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\n  身体观察系统已启动\n  电脑上打开：  http://localhost:${PORT}`);
  for (const ifs of Object.values(os.networkInterfaces())) for (const a of ifs) if (a.family === 'IPv4' && !a.internal) console.log(`  手机（同一 Wi-Fi）打开：http://${a.address}:${PORT}`);
  console.log('\n  数据保存在：' + DATA_DIR + '\n  关闭此窗口即停止服务。\n');
});
