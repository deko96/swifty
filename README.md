# Swifty

**Open-source game server control panel.** No Docker — game servers run as
native processes behind dedicated Unix users and cgroup v2 limits, supervised
by a single-binary daemon. Built for game hosting providers, resellers, and
communities.

> ⚠️ **Early development.** Swifty is being built in the open and is not yet
> usable for hosting. Star the repo and watch releases if you want to follow
> along.

## Why Swifty

- **No containers required** — native processes, native filesystem
  performance, isolation via per-server Unix users, cgroups v2, and systemd.
- **Panel + node daemon** — a lightweight web panel controls any number of
  game machines through `swiftyd`, a single Go binary per node.
- **Games as data** — every game is a declarative YAML template; adding a
  game is a pull request, not a fork.
- **Built to extend** — typed module SDK (`@swifty/sdk`), event hooks, and a
  public REST API from day one.

Read the full design in [ARCHITECTURE.md](ARCHITECTURE.md).

## Repository layout

| Path | Description |
|---|---|
| [`apps/api`](apps/api) | REST API — NestJS on Bun |
| [`apps/web`](apps/web) | Web UI — React + Vite |
| [`packages/sdk`](packages/sdk) | `@swifty/sdk` — typed module & event contract |
| [`packages/templates`](packages/templates) | Official game templates + schema |
| [`daemon`](daemon) | `swiftyd` node daemon — Go |

## Getting started (development)

Prerequisites: [Bun](https://bun.sh) ≥ 1.3, [just](https://just.systems),
[Go](https://go.dev) ≥ 1.24.

```sh
just install

# Dev PostgreSQL + Redis (or point .env at your own instances)
just up

# Panel API (http://localhost:3000/api/v1/health)
cp apps/api/.env.example apps/api/.env
just migrate
just dev api

# Web UI (http://localhost:5173, proxies /api to the panel API)
just dev web

# Node daemon (binary at daemon/bin/swiftyd)
just build daemon
```

Run `just` with no arguments to list every available command.

On first start the panel is unconfigured: open the web UI and the **setup
wizard** walks you through naming the panel and creating the first admin
account. It asks for the one-time setup code printed in the API console, so
only the person who installed the panel can claim it.

With the API running, the interactive API reference lives at
[http://localhost:3000/api/docs](http://localhost:3000/api/docs) (raw OpenAPI
spec at `/api/openapi.json`).

Repo-wide quality gate (also enforced by git hooks and CI):

```sh
just check          # lint + typecheck + tests + builds + daemon checks
```

## Contributing

Contributions are welcome — game templates are the easiest place to start.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## Supporting the project

Swifty's core is free and will stay free. If it saves you time or money,
consider [sponsoring the project](https://github.com/sponsors/deko96) —
sponsorships fund maintenance and keep the open core moving.

## License

Core panel, daemon, SDK, and official templates are [MIT licensed](LICENSE).
The Swifty name and logo are trademarks; see the trademark note in
[CONTRIBUTING.md](CONTRIBUTING.md).
