#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  exit 0
fi

WATCHES="$(cat /proc/sys/fs/inotify/max_user_watches 2>/dev/null || echo 0)"
INSTANCES="$(cat /proc/sys/fs/inotify/max_user_instances 2>/dev/null || echo 0)"
MIN_WATCHES=262144

if (( WATCHES < MIN_WATCHES )); then
  cat <<EOF
Warning: Linux inotify limit is low for this pnpm workspace (current: ${WATCHES}, recommended: >= ${MIN_WATCHES}).
Expo/Metro may crash with ENOSPC while watching node_modules.

Run this once to fix it permanently:
  pnpm fix:inotify

Optional but helpful:
  sudo apt install watchman
EOF
fi

if (( INSTANCES < 256 )); then
  echo "Warning: fs.inotify.max_user_instances=${INSTANCES} is low. Consider running scripts/increase-inotify-limit.sh"
fi