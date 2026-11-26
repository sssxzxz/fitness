# 本地服务器（Python 版，只用标准库）
# 提供 3D 应用页面；把不适记录、自定义说明保存到 userdata/；上传的视频图片存到 userdata/media/
# 运行：python server.py
import json, os, re, socket, sys, threading, time, webbrowser, mimetypes
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import unquote, urlparse, parse_qs

PORT = int(os.environ.get("PORT", 8686))
BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(BASE, "app")
DATA_DIR = os.path.join(BASE, "userdata")
MEDIA_DIR = os.path.join(DATA_DIR, "media")
LOGS = os.path.join(DATA_DIR, "logs.json")
COLL = {"logs": LOGS, "workouts": os.path.join(DATA_DIR, "workouts.json")}
CUSTOM = os.path.join(DATA_DIR, "custom.json")
MAX_UPLOAD = 2 * 1024 ** 3  # 2GB
os.makedirs(MEDIA_DIR, exist_ok=True)
lock = threading.Lock()
TYPES = {".js": "text/javascript; charset=utf-8", ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".json": "application/json; charset=utf-8", ".glb": "model/gltf-binary", ".mp4": "video/mp4", ".webm": "video/webm",
         ".mov": "video/quicktime", ".m4v": "video/mp4", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
         ".gif": "image/gif", ".webp": "image/webp"}

def load(path, default):
    try:
        with open(path, encoding="utf-8") as f: return json.load(f)
    except Exception: return default

def save(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)

class H(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, **TYPES}
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        if "Cache-Control" not in getattr(self, "_sent", set()):
            self.send_header("Cache-Control", "max-age=86400" if self.path.endswith(".glb") else "no-cache")
        super().end_headers()
    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def _body_json(self):
        n = int(self.headers.get("Content-Length", 0))
        if n > 5_000_000: raise ValueError("too large")
        return json.loads(self.rfile.read(n).decode("utf-8"))

    def _media(self, name):
        name = os.path.basename(name)
        fp = os.path.join(MEDIA_DIR, name)
        if not os.path.isfile(fp): return self._json({"error": "not found"}, 404)
        size = os.path.getsize(fp)
        ctype = TYPES.get(os.path.splitext(fp)[1].lower()) or mimetypes.guess_type(fp)[0] or "application/octet-stream"
        start, end = 0, size - 1
        rng = self.headers.get("Range")
        m = re.match(r"bytes=(\d*)-(\d*)", rng or "")
        if m and (m.group(1) or m.group(2)):
            if m.group(1): start = int(m.group(1)); end = int(m.group(2)) if m.group(2) else size - 1
            else: start = max(0, size - int(m.group(2)))
            end = min(end, size - 1)
            if start > end: self.send_response(416); self.send_header("Content-Range", f"bytes */{size}"); self.end_headers(); return
            self.send_response(206); self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype); self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1)); self.end_headers()
        with open(fp, "rb") as f:
            f.seek(start); left = end - start + 1
            while left > 0:
                chunk = f.read(min(1 << 20, left))
                if not chunk: break
                try: self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError): return
                left -= len(chunk)

    def do_GET(self):
        p = unquote(urlparse(self.path).path)
        if p.startswith("/api/") and p[5:] in COLL:
            with lock: return self._json(load(COLL[p[5:]], []))
        if p == "/api/custom":
            with lock: return self._json(load(CUSTOM, {}))
        if p.startswith("/media/"): return self._media(p[len("/media/"):])
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path); p = unquote(u.path)
        try:
            if p.startswith("/api/") and p[5:] in COLL:
                f = COLL[p[5:]]; log = self._body_json(); assert log.get("id")
                with lock:
                    l = [x for x in load(f, []) if x.get("id") != log["id"]] + [log]; save(f, l)
                return self._json({})
            if p == "/api/custom":
                body = self._body_json(); key = body["key"]; val = body.get("value")
                with lock:
                    c = load(CUSTOM, {})
                    if val is None: c.pop(key, None)
                    else: c[key] = val
                    save(CUSTOM, c)
                return self._json({})
            if p == "/api/upload":
                n = int(self.headers.get("Content-Length", 0))
                if n <= 0 or n > MAX_UPLOAD: return self._json({"error": "文件为空或超过 2GB"}, 413)
                orig = parse_qs(u.query).get("name", ["file"])[0]
                ext = os.path.splitext(orig)[1].lower()
                if ext not in TYPES or ext in (".js", ".html", ".css", ".json", ".glb"): return self._json({"error": "只支持视频或图片"}, 400)
                stem = re.sub(r"[^\w一-鿿-]+", "_", os.path.splitext(os.path.basename(orig))[0])[:40] or "file"
                name = f"{time.strftime('%Y%m%d-%H%M%S')}-{stem}{ext}"
                fp = os.path.join(MEDIA_DIR, name)
                with open(fp + ".part", "wb") as f:
                    left = n
                    while left > 0:
                        chunk = self.rfile.read(min(1 << 20, left))
                        if not chunk: break
                        f.write(chunk); left -= len(chunk)
                if left: os.remove(fp + ".part"); return self._json({"error": "上传中断"}, 400)
                os.replace(fp + ".part", fp)
                return self._json({"src": "media/" + name, "name": name})
        except Exception as e:
            return self._json({"error": str(e)}, 400)
        return self._json({}, 405)

    def do_DELETE(self):
        p = unquote(urlparse(self.path).path)
        parts = p.split("/")
        if len(parts) == 4 and parts[1] == "api" and parts[2] in COLL:
            f, lid = COLL[parts[2]], parts[3]
            with lock: save(f, [x for x in load(f, []) if x.get("id") != lid])
            return self._json({})
        if p.startswith("/api/media/"):
            fp = os.path.join(MEDIA_DIR, os.path.basename(p[len("/api/media/"):]))
            if os.path.isfile(fp): os.remove(fp)
            return self._json({})
        return self._json({}, 405)

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
        print(f"端口 {PORT} 已被占用：系统可能已经在运行，直接打开 http://localhost:{PORT} 即可。")
        if "--no-browser" not in sys.argv: webbrowser.open(f"http://localhost:{PORT}")
        input(); sys.exit(1)
    print(f"\n  身体观察系统已启动\n  电脑上打开：  http://localhost:{PORT}")
    for ip in lan_ips(): print(f"  手机（同一 Wi-Fi）打开：http://{ip}:{PORT}")
    print(f"\n  数据保存在：{DATA_DIR}\n  关闭此窗口即停止服务。\n")
    if "--no-browser" not in sys.argv: threading.Timer(1.0, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    srv.serve_forever()
