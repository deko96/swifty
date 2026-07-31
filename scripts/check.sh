#!/usr/bin/env bash
# Full quality gate: run every check CI runs, report all failures at once.
# Each gate is a just recipe so this script, CI, and manual runs stay in sync.
set -uo pipefail
cd "$(dirname "$0")/.."

if ! command -v just > /dev/null; then
  printf 'error: just is not installed (https://just.systems) — try `brew install just`\n' >&2
  exit 1
fi

failures=()

run() {
  local name="$1"
  shift
  printf '\n\033[1m== %s ==\033[0m\n' "$name"
  if "$@"; then
    printf 'ok: %s\n' "$name"
  else
    failures+=("$name")
  fi
}

run 'lint (biome)' just lint panel
run 'typecheck (tsc)' just typecheck panel
run 'test (bun)' just test panel
run 'build' just build panel

if command -v go > /dev/null; then
  run 'lint daemon (gofmt + vet)' just lint daemon
  run 'test daemon' just test daemon
  run 'build daemon' just build daemon
else
  printf '\nwarning: go not installed, skipping daemon checks\n'
fi

if ((${#failures[@]} > 0)); then
  printf '\n\033[31mFAILED:\033[0m %s\n' "${failures[*]}"
  exit 1
fi

printf '\n\033[32mAll quality gates passed.\033[0m\n'
