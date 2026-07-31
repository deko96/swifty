# Swifty — repo conventions

Open-source game hosting panel: Bun-workspaces monorepo (`apps/api` NestJS,
`apps/web` React/Vite, `packages/sdk`, `packages/templates`) plus a Go daemon
in `daemon/`. Design decisions live in ARCHITECTURE.md.

## Commands

All commands go through the root `justfile` — it is the single command
surface for local work, git hooks, and CI. `just` (no args) lists recipes.
Verbs take an optional target — `just <verb> [api|web|sdk|templates|daemon|panel]`
— where no target means everything and `panel` means all TypeScript
workspaces (e.g. `just test daemon`, `just lint api`).

- `just check` — full quality gate (lint, typecheck, tests, builds, Go
  daemon checks); must pass before any work is considered done
- `just lint` / `just fix` — Biome for TypeScript; for the daemon, lint is
  gofmt check + go vet and fix is gofmt
- `just typecheck` — tsc across all workspaces (go vet for the daemon)
- `just test` — bun tests + template validation, go test for the daemon.
  Integration suites (`*.integration.spec.ts`, declared with `describeDb`)
  run against `DATABASE_URL`/`TEST_DATABASE_URL` inside always-rolled-back
  transactions via `src/testing/harness.ts`, and are skipped when neither is
  set; CI always runs them. Service-layer DB logic belongs in these, not in
  mocks.
- `just dev` — all dev servers; `just dev api` / `just dev web` for one
- `just build` — build everything; `just build daemon` produces
  `daemon/bin/swiftyd`
- Database (needs `DATABASE_URL`): `just generate` after schema changes,
  `just migrate`. First admin is created via the setup wizard
  (`/api/v1/setup`), never seeded.
- `just up` / `just down` — dev Postgres + Redis via compose.dev.yml

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
commit, Conventional Commit validation on the message, `just check` on
push. Never bypass them with `--no-verify`; fix the failure instead.

## Code style

- No magic strings. Shared literals live as named constants and everything
  derives from them: roles and server statuses come from `@swifty/sdk`
  (`UserRole`, `ServerStatus` — pgEnums and zod enums are built from their
  `*_VALUES` tuples), token prefixes from `TOKEN_PREFIX` in
  `apps/api/src/common/crypto.ts`, settings keys and cookie names from their
  exported constants. Comparing or storing a raw `'admin'`-style literal is
  a review blocker.
- File naming in `apps/api`: a dotted role suffix (`<name>.<role>.ts` —
  `.module`, `.controller`, `.service`, `.gateway`, `.guard`, `.pipe`,
  `.filter`, `.middleware`, `.decorator`, `.serializer`, `.schemas`,
  `.exception`, `.registry`) marks a NestJS artifact; the prefix is the class
  name minus its role word, kebab-cased (`AgentGateway` → `agent.gateway.ts`).
  Plain kebab-case (`port-range.ts`, `start-command.ts`) marks pure domain
  helpers — exported functions and constants, no DI. Zod shape files are
  always plural `.schemas.ts`. Tests mirror the file under test as
  `<file>.spec.ts` / `<file>.integration.spec.ts`. Non-Nest workspaces
  (`apps/web`, `packages/*`, `db/schema/`) use plain kebab-case with no role
  suffixes.
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
  `PowerAction` values and the wire protocol in `agent/protocol.go`, config
  defaults in `config`). Raw `'start'`-style literals are a review blocker in Go too.
  Literals that belong to an external protocol (systemd directive names,
  `useradd` flags) stay inline at their single point of use.
- Conventional Commits, scoped by workspace: `feat(api): ...`,
  `fix(daemon): ...`.
