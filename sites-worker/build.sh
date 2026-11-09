#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
build_dir="$(mktemp -d)"
trap 'rm -rf "$build_dir"' EXIT

dotnet publish Ti4Companion.Web -c Release -p:SitesWorker=true -m:1 -o "$build_dir/publish"
cp sites-worker/{index,game,store}.mjs "$build_dir/"
python3 sites-worker/export-content.py "$build_dir/content.json"
python3 - "$build_dir" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
index = root / "publish/wwwroot/index.html"
html = index.read_text()
start = html.index("    <script>", html.index("blazor.webassembly"))
end = html.index("</script>", start) + len("</script>")
(root / "shell.html").write_text(html[:start] + html[end:])
index.unlink()
PY

rm -rf dist
mkdir -p dist/server
node_modules/.bin/esbuild "$build_dir/index.mjs" --bundle --format=esm --platform=browser \
    --loader:.html=text --outfile=dist/server/index.js
mv "$build_dir/publish/wwwroot" dist/client
rm -f dist/client/index.html.* dist/client/service-worker* dist/client/prototype.html*
find dist/client -type f \( -name '*.br' -o -name '*.gz' \) -delete
if [[ -f .openai/hosting.json ]]; then
    mkdir -p dist/.openai
    cp .openai/hosting.json dist/.openai/
fi
