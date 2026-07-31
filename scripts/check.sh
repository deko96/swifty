#!/usr/bin/env bash
# Full quality gate: run every check CI runs, report all failures at once.
set -uo pipefail
cd "$(dirname "$0")/.."

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

run 'lint (biome)' bun run lint
run 'typecheck (tsc)' bun run typecheck
run 'test (bun)' bun run test
run 'build' bun run build

if command -v go > /dev/null; then
  run 'gofmt' bash -c 'cd daemon && unformatted=$(gofmt -l .) && test -z "$unformatted" || { echo "$unformatted"; exit 1; }'
  run 'go vet' bash -c 'cd daemon && go vet ./...'
  run 'go test' bash -c 'cd daemon && go test ./...'
  run 'go build' bash -c 'cd daemon && go build ./...'
else
  printf '\nwarning: go not installed, skipping daemon checks\n'
fi

if ((${#failures[@]} > 0)); then
  printf '\n\033[31mFAILED:\033[0m %s\n' "${failures[*]}"
  exit 1
fi

printf '\n\033[32mAll quality gates passed.\033[0m\n'
