# 本地服务器（Python 版，只用标准库）：提供 3D 应用页面，并把不适记录保存到 userdata/logs.json
# 运行：python server.py
import json, os, socket, sys, threading, webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get("PORT", 8686))
BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(BASE, "app")
DATA_DIR = os.path.join(BASE, "userdata")
LOGS = os.path.join(DATA_DIR, "logs.json")
os.makedirs(DATA_DIR, exist_ok=True)
lock = threading.Lock()

def read_logs():
    try:
        with open(LOGS, encoding="utf-8") as f: return json.load(f)
    except Exception: return []

def write_logs(l):
    tmp = LOGS + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(l, f, ensure_ascii=False, indent=2)
    os.replace(tmp, LOGS)

class H(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8", ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8", ".glb": "model/gltf-binary"}
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header("Cache-Control", "max-age=86400" if self.path.endswith(".glb") else "no-cache")
        super().end_headers()
    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path.split("?")[0] == "/api/logs":
            with lock: return self._json(read_logs())
        return super().do_GET()
    def do_POST(self):
        if self.path.split("?")[0] != "/api/logs": return self._json({}, 405)
        n = int(self.headers.get("Content-Length", 0))
        if n > 1_000_000: return self._json({}, 413)
        try:
            log = json.loads(self.rfile.read(n).decode("utf-8")); assert log.get("id")
        except Exception: return self._json({"error": "bad request"}, 400)
        with lock:
            l = read_logs(); l = [x for x in l if x.get("id") != log["id"]] + [log]; write_logs(l)
        self._json({})
    def do_DELETE(self):
        p = self.path.split("?")[0]
        if not p.startswith("/api/logs/"): return self._json({}, 405)
        from urllib.parse import unquote
        lid = unquote(p[len("/api/logs/"):])
        with lock: write_logs([x for x in read_logs() if x.get("id") != lid])
        self._json({})

def lan_ips():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(("10.255.255.255", 1)); ips.add(s.getsockname()[0]); s.close()
    except Exception: pass
    return [i for i in ips if not i.startswith("127.")]

if __name__ == "__main__":
    try:
        srv = ThreadingHTTPServer(("0.0.0.0", PORT), H)
    except OSError:
        print(f"端口 {PORT} 已被占用：系统可能已经在运行，直接打开 http://localhost:{PORT} 即可。"); input(); sys.exit(1)
    print(f"\n  身体观察系统已启动\n  电脑上打开：  http://localhost:{PORT}")
    for ip in lan_ips(): print(f"  手机（同一 Wi-Fi）打开：http://{ip}:{PORT}")
    print(f"\n  记录保存在：{LOGS}\n  关闭此窗口即停止服务。\n")
    if "--no-browser" not in sys.argv: threading.Timer(1.0, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    srv.serve_forever()
