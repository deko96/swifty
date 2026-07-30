# Swifty — repo conventions

Open-source game hosting panel: Bun-workspaces monorepo (`apps/api` NestJS,
`apps/web` React/Vite, `packages/sdk`, `packages/templates`) plus a Go daemon
in `daemon/`. Design decisions live in ARCHITECTURE.md.

## Commands

- `bun run check` — full quality gate (lint, typecheck, tests, builds, Go
  daemon checks); must pass before any work is considered done
- `bun run lint` / `lint:fix` — Biome
- `bun run typecheck` — tsc across all workspaces
- `bun run test` — bun tests + template validation
- Daemon only: `cd daemon && gofmt -l . && go vet ./... && go test ./...`

Git hooks (lefthook, installed by `bun install`): Biome on staged files at
commit, Conventional Commit validation on the message, `bun run check` on
push. Never bypass them with `--no-verify`; fix the failure instead.

## Code style

- Code must be self-descriptive. Do not write comments that narrate what the
  code does, restate types, or justify a change — no comments is the default.
  A comment is acceptable only for a non-obvious constraint the code cannot
  express, and JSDoc on public SDK contracts.
- In `apps/api`, NestJS-injected classes need value imports (never
  `import type`) for their injection tokens; Biome's `useImportType` is
  disabled there for this reason.
- Conventional Commits, scoped by workspace: `feat(api): ...`,
  `fix(daemon): ...`.
