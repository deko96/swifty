# Contributing to Swifty

Thanks for your interest in Swifty! This document covers everything needed to
get a change from idea to merged pull request.

## Development setup

Prerequisites: [Bun](https://bun.sh) ≥ 1.3 and [Go](https://go.dev) ≥ 1.24
(only needed for daemon work).

```sh
git clone https://github.com/deko96/swifty.git
cd swifty
bun install
```

See the README's *Getting started* section for running each app.

`bun install` also installs git hooks (via [lefthook](https://lefthook.dev)):
staged files are linted on commit, commit messages are validated, and the
full quality gate runs before every push. You can run the gate yourself at
any time:

```sh
bun run check
```

It runs everything CI runs — lint, typecheck, tests, builds, and the Go
daemon checks — and reports all failures at once.

## Project structure

The monorepo uses Bun workspaces. TypeScript code lives in `apps/*`
(deployables) and `packages/*` (shared libraries); the Go daemon lives in
`daemon/`. Architecture and design decisions are documented in
[ARCHITECTURE.md](ARCHITECTURE.md) — read it before larger changes.

## Making changes

1. Fork and create a topic branch from `main`.
2. Keep pull requests focused — one logical change per PR.
3. Add or update tests alongside behavior changes.
4. Open the PR with a clear description of *what* and *why*.

### Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org):

```
feat(api): add server power actions endpoint
fix(daemon): reap zombie processes after crash restarts
docs: clarify template variable rules
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.
Scope by workspace where it helps: `api`, `web`, `sdk`,
`templates`, `daemon`.

### Code style

- TypeScript is formatted and linted by [Biome](https://biomejs.dev) —
  `bun run lint:fix` fixes most issues.
- Go code must be `gofmt`-clean and pass `go vet`.
- Style is enforced in CI; there is no need to debate it in review.

## Adding a game template

The most welcome first contribution! See
[`packages/templates/README.md`](packages/templates/README.md) — it's a
single YAML file plus a validation run.

## Reporting bugs & proposing features

Open a GitHub issue. For anything security-sensitive, **do not open a public
issue** — see [SECURITY.md](SECURITY.md).

## License of contributions

The Swifty source code is MIT licensed, and contributions follow the usual
inbound = outbound rule: by submitting a pull request you agree that your
contribution is licensed under the [MIT license](LICENSE). There is no CLA
to sign.

## Trademark note

The "Swifty" name and logo are trademarks of the project maintainers:
forks are welcome, but please ship them under a different name.
