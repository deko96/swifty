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
| [`apps/panel-api`](apps/panel-api) | REST API — NestJS on Bun |
| [`apps/panel-web`](apps/panel-web) | Web UI — React + Vite |
| [`packages/sdk`](packages/sdk) | `@swifty/sdk` — typed module & event contract |
| [`packages/templates`](packages/templates) | Official game templates + schema |
| [`daemon`](daemon) | `swiftyd` node daemon — Go |

## Getting started (development)

Prerequisites: [Bun](https://bun.sh) ≥ 1.3, [Go](https://go.dev) ≥ 1.24.

```sh
bun install

# Panel API (http://localhost:3000/api/v1/health)
cp apps/panel-api/.env.example apps/panel-api/.env
bun run --filter @swifty/panel-api dev

# Web UI (http://localhost:5173, proxies /api to the panel API)
bun run --filter @swifty/panel-web dev

# Node daemon
cd daemon && go build -o bin/swiftyd ./cmd/swiftyd
```

Repo-wide checks:

```sh
bun run lint        # Biome
bun run typecheck   # tsc across all workspaces
bun run test        # unit tests + template validation
```

## Contributing

Contributions are welcome — game templates are the easiest place to start.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Core panel, daemon, SDK, and official templates are [MIT licensed](LICENSE).
The Swifty name and logo are trademarks; see the trademark note in
[CONTRIBUTING.md](CONTRIBUTING.md).
