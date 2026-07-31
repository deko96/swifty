# Swifty command surface. CI, git hooks, and the local quality gate all run
# these same recipes — change behavior here, not in the callers.
#
# Verbs take an optional target: api | web | sdk | templates | daemon | panel.
# No target applies to everything; `panel` is all TypeScript workspaces.

set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

# Install dependencies and git hooks
install:
    bun install

# Start local dev dependencies (Postgres + Redis)
up:
    docker compose -f compose.dev.yml up -d

# Stop local dev dependencies
down:
    docker compose -f compose.dev.yml down

# Run dev servers — all, or one: `just dev api`, `just dev web`
dev target='':
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{ target }}" in
        '') bun run dev ;;
        daemon) echo 'the daemon has no dev server — `just build daemon` and run daemon/bin/swiftyd' >&2; exit 1 ;;
        *) bun run --filter "@swifty/{{ target }}" dev ;;
    esac

# Build — all, or one target (daemon builds the swiftyd binary)
build target='':
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{ target }}" in
        '')
            bun run build
            if command -v go > /dev/null; then
                cd daemon && go build ./... && go build -o bin/swiftyd ./cmd/swiftyd
            else
                echo 'warning: go not installed, skipping daemon build'
            fi ;;
        panel) bun run build ;;
        daemon) cd daemon && go build ./... && go build -o bin/swiftyd ./cmd/swiftyd ;;
        *) bun run --filter "@swifty/{{ target }}" build ;;
    esac

# Lint — Biome for TypeScript, gofmt check + go vet for the daemon
lint target='':
    #!/usr/bin/env bash
    set -euo pipefail
    daemon_lint() {
        cd daemon
        unformatted=$(gofmt -l .)
        if [[ -n "$unformatted" ]]; then echo "$unformatted"; exit 1; fi
        go vet ./...
    }
    case "{{ target }}" in
        '')
            bun run lint
            if command -v go > /dev/null; then
                daemon_lint
            else
                echo 'warning: go not installed, skipping daemon lint'
            fi ;;
        panel) bun run lint ;;
        daemon) daemon_lint ;;
        api) bunx biome check apps/api ;;
        web) bunx biome check apps/web ;;
        sdk) bunx biome check packages/sdk ;;
        templates) bunx biome check packages/templates ;;
    esac

# Lint and auto-fix
fix target='':
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{ target }}" in
        '')
            bun run lint:fix
            if command -v go > /dev/null; then cd daemon && gofmt -w .; fi ;;
        panel) bun run lint:fix ;;
        daemon) cd daemon && gofmt -w . ;;
        api) bunx biome check --write apps/api ;;
        web) bunx biome check --write apps/web ;;
        sdk) bunx biome check --write packages/sdk ;;
        templates) bunx biome check --write packages/templates ;;
    esac

# Format all files
format target='':
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{ target }}" in
        '')
            bun run format
            if command -v go > /dev/null; then cd daemon && gofmt -w .; fi ;;
        panel) bun run format ;;
        daemon) cd daemon && gofmt -w . ;;
        api) bunx biome format --write apps/api ;;
        web) bunx biome format --write apps/web ;;
        sdk) bunx biome format --write packages/sdk ;;
        templates) bunx biome format --write packages/templates ;;
    esac

# Typecheck — tsc for TypeScript workspaces, go vet for the daemon
typecheck target='':
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{ target }}" in
        '')
            bun run typecheck
            if command -v go > /dev/null; then cd daemon && go vet ./...; fi ;;
        panel) bun run typecheck ;;
        daemon) cd daemon && go vet ./... ;;
        *) bun run --filter "@swifty/{{ target }}" typecheck ;;
    esac

# Tests — bun + template validation, go test for the daemon (integration suites need DATABASE_URL)
test target='':
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{ target }}" in
        '')
            bun run test
            if command -v go > /dev/null; then
                cd daemon && go test ./...
            else
                echo 'warning: go not installed, skipping daemon tests'
            fi ;;
        panel) bun run test ;;
        daemon) cd daemon && go test ./... ;;
        *) bun run --filter "@swifty/{{ target }}" test ;;
    esac

# Apply pending database migrations (needs DATABASE_URL)
migrate:
    bun run --filter @swifty/api db:migrate

# Generate a migration from schema changes (needs DATABASE_URL)
generate:
    bun run --filter @swifty/api db:generate

# Full quality gate — everything CI runs, all failures reported at once
check:
    bash scripts/check.sh
