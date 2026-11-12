#!/bin/sh
# 双击本文件：在本机起一个临时网站并自动打开浏览器（和上传到 GitHub Pages 后的效果完全一致）。
# 看完后关掉这个终端窗口即可。直接双击 index.html 也能看，但浏览器会限制部分效果（鼠标流体尾巴会退成简化版）。
cd "$(dirname "$0")" || exit 1
PORT=8000
while lsof -i :"$PORT" >/dev/null 2>&1; do PORT=$((PORT + 1)); done
echo "作品集已在 http://localhost:$PORT 打开，关闭此窗口即停止预览。"
( sleep 1; open "http://localhost:$PORT" ) &
exec python3 -m http.server "$PORT" >/dev/null 2>&1
