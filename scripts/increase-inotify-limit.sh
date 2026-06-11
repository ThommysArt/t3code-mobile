#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This script only applies to Linux."
  exit 0
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required to raise inotify limits."
  exit 1
fi

echo "Raising inotify limits for Metro/Expo file watching..."
sudo tee /etc/sysctl.d/99-t3code-mobile-inotify.conf >/dev/null <<'EOF'
# Allow Expo/Metro to watch large pnpm workspaces on Linux.
fs.inotify.max_user_watches=524288
fs.inotify.max_user_instances=512
EOF

sudo sysctl --system >/dev/null

echo "Updated limits:"
sysctl fs.inotify.max_user_watches fs.inotify.max_user_instances