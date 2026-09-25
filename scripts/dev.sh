#!/bin/sh
set -eu

action=$1
cwd=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
agentDit=${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}
npmPackagePath="$agentDit/npm/node_modules/@yuriteixeira/pi-muxr"
npmBackupPackagePath="$npmPackagePath.installed"

case "$action" in
  setup)
    chmod +x "$cwd/dist/cli/index.js"
    if [ ! -e "$npmBackupPackagePath" ]; then
      mv "$npmPackagePath" "$npmBackupPackagePath"
    fi
    ln -sfn "$cwd" "$npmPackagePath"
    echo "Local pi-muxr package selected. Run /reload in active Pi sessions."
    ;;
  teardown)
    rm -f "$npmPackagePath"
    mv "$npmBackupPackagePath" "$npmPackagePath"
    echo "Installed pi-muxr package restored. Run /reload in active Pi sessions."
    ;;
  *)
    echo "Usage: scripts/dev.sh <setup|teardown>" >&2
    exit 1
    ;;
esac
