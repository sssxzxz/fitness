// 本地服务器：提供 3D 应用页面，并把不适记录保存到 userdata/logs.json
// 运行：node server.js   （需要 Node.js 18+，无需安装任何依赖）
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const PORT = +process.env.PORT || 8686;
const ROOT = path.join(__dirname, 'app');
const DATA_DIR = path.join(__dirname, 'userdata');
const LOGS = path.join(DATA_DIR, 'logs.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
const readLogs = () => { try { return JSON.parse(fs.readFileSync(LOGS, 'utf8')); } catch { return []; } };
const writeLogs = l => { fs.writeFileSync(LOGS + '.tmp', JSON.stringify(l, null, 2)); fs.renameSync(LOGS + '.tmp', LOGS); };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url.startsWith('/api/logs')) {
    const id = url.split('/')[3];
    if (req.method === 'GET') { res.setHeader('Content-Type', TYPES['.json']); return res.end(JSON.stringify(readLogs())); }
    if (req.method === 'DELETE' && id) { writeLogs(readLogs().filter(l => l.id !== id)); return res.end('{}'); }
    if (req.method === 'POST') {
      let body = ''; req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
      return req.on('end', () => {
        try { const log = JSON.parse(body); if (!log.id) throw 0; const l = readLogs(); const i = l.findIndex(x => x.id === log.id); if (i >= 0) l[i] = log; else l.push(log); writeLogs(l); res.end('{}'); }
        catch { res.statusCode = 400; res.end('bad request'); }
      });
    }
    res.statusCode = 405; return res.end();
  }
  let file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', file.endsWith('.glb') ? 'max-age=86400' : 'no-cache');
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\n  身体观察系统已启动\n  电脑上打开：  http://localhost:${PORT}`);
  for (const ifs of Object.values(os.networkInterfaces())) for (const a of ifs) if (a.family === 'IPv4' && !a.internal) console.log(`  手机（同一 Wi-Fi）打开：http://${a.address}:${PORT}`);
  console.log('\n  记录保存在：' + LOGS + '\n  关闭此窗口即停止服务。\n');
});
