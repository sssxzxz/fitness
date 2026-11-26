#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "请先安装 Node.js: https://nodejs.org/"; read; exit 1; }
(sleep 1; open http://localhost:8686 2>/dev/null || xdg-open http://localhost:8686 2>/dev/null) &
node server.js
