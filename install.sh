#!/bin/sh
# Symlink this repo's plugins into OpenCode's global plugin directory.
# Linux and macOS. Usage: ./install.sh [--with-probe]
set -eu

dir="$(cd "$(dirname "$0")" && pwd)"
dest="$HOME/.config/opencode/plugins"
mkdir -p "$dest"

linked=0
for f in mempalace.js context-mode-bridge.js; do
  if [ -f "$dir/plugins/$f" ]; then
    ln -sf "$dir/plugins/$f" "$dest/$f"
    echo "linked $f"
    linked=$((linked + 1))
  fi
done

# The probe is a development diagnostic, never linked by default.
if [ "${1:-}" = "--with-probe" ]; then
  ln -sf "$dir/plugins/probe.js" "$dest/probe.js" && echo "linked probe.js"
else
  rm -f "$dest/probe.js"
fi

[ "$linked" -gt 0 ] || { echo "nothing to link" >&2; exit 1; }

# Friendly dependency report - nothing here is fatal, the plugins fail open.
command -v mempalace >/dev/null 2>&1 \
  && echo "mempalace CLI: found" \
  || echo "mempalace CLI: not found (mempalace.js will no-op until installed)"
if [ -d "$HOME/.claude/plugins/marketplaces/context-mode/hooks" ]; then
  echo "context-mode scripts: found"
else
  echo "context-mode scripts: not found (context-mode-bridge.js will no-op)"
fi
command -v bun >/dev/null 2>&1 \
  && echo "bun: found" \
  || echo "bun: not found (required by context-mode-bridge.js)"

echo "done - restart opencode to load the plugins"
