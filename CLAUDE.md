# Swifty — repo conventions

Open-source game hosting panel: Bun-workspaces monorepo (`apps/api` NestJS,
`apps/web` React/Vite, `packages/sdk`, `packages/templates`) plus a Go daemon
in `daemon/`. Design decisions live in ARCHITECTURE.md.

## Commands

- `bun run check` — full quality gate (lint, typecheck, tests, builds, Go
  daemon checks); must pass before any work is considered done
- `bun run lint` / `lint:fix` — Biome
- `bun run typecheck` — tsc across all workspaces
- `bun run test` — bun tests + template validation. Integration suites
  (`*.integration.spec.ts`, declared with `describeDb`) run against
  `DATABASE_URL`/`TEST_DATABASE_URL` inside always-rolled-back transactions
  via `src/testing/harness.ts`, and are skipped when neither is set; CI
  always runs them. Service-layer DB logic belongs in these, not in mocks.
- Daemon only: `cd daemon && gofmt -l . && go vet ./... && go test ./...`
- Database (from `apps/api`, needs `DATABASE_URL`): `bun run db:generate`
  after schema changes, `bun run db:migrate`. First admin is created via the
  setup wizard (`/api/v1/setup`), never seeded.

## API conventions

- Request/response shapes are zod schemas; validate bodies with
  `ZodValidationPipe` and document with `apiSchema()` — never duplicate a
  shape by hand.
- Every endpoint carries `@ApiOperation` with a summary and a plain-language
  description; the reference at `/api/docs` must stay complete and readable
  by non-developers.
- Endpoints are auth-required by default (global guard); opt out explicitly
  with `@Public()`, restrict with `@Roles('admin')`.
- Tokens (sessions, API keys) are stored hashed; only their SHA-256 hash
  ever touches the database.
- Errors: throw `AppException` with a code from `ERROR_CODES` in
  `@swifty/sdk` — never raw Nest HttpExceptions in domain code. All error
  responses share `{ code, message, details?, requestId }` via the global
  filter; add new codes to the SDK, they are part of the API contract.

Git hooks (lefthook, installed by `bun install`): Biome on staged files at
commit, Conventional Commit validation on the message, `bun run check` on
push. Never bypass them with `--no-verify`; fix the failure instead.

## Code style

- No magic strings. Shared literals live as named constants and everything
  derives from them: roles and server statuses come from `@swifty/sdk`
  (`UserRole`, `ServerStatus` — pgEnums and zod enums are built from their
  `*_VALUES` tuples), token prefixes from `TOKEN_PREFIX` in
  `apps/api/src/common/crypto.ts`, settings keys and cookie names from their
  exported constants. Comparing or storing a raw `'admin'`-style literal is
  a review blocker.
- Code must be self-descriptive. Do not write comments that narrate what the
  code does, restate types, or justify a change — no comments is the default.
  A comment is acceptable only for a non-obvious constraint the code cannot
  express, and JSDoc on public SDK contracts.
- In `apps/api`, NestJS-injected classes need value imports (never
  `import type`) for their injection tokens; Biome's `useImportType` is
  disabled there for this reason.
- The Go daemon follows the same discipline as the NestJS side: one concern
  per file (`daemon/internal/api` splits router/auth/respond/handlers/schemas
  the way a Nest module splits controller/schemas/service; `supervisor` splits
  naming/users/sandbox/install/runner), and shared literals are named
  constants (`unitPrefix`, `userPrefix` in `supervisor/naming.go`,
  `PowerAction` values in `api/servers_schemas.go`, config defaults in
  `config`). Raw `'start'`-style literals are a review blocker in Go too.
  Literals that belong to an external protocol (systemd directive names,
  `useradd` flags) stay inline at their single point of use.
- Conventional Commits, scoped by workspace: `feat(api): ...`,
  `fix(daemon): ...`.
