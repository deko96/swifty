# swiftyd — Swifty node daemon

A single Go binary installed on every machine that runs game servers. It
supervises game processes (dedicated Unix user + cgroup v2 limits via
transient systemd units — no Docker), streams consoles, runs installers, and
exposes an API consumed exclusively by the panel.

See the repository's [ARCHITECTURE.md](../ARCHITECTURE.md) (§3) for the full
design.

## Development

```sh
go build -o bin/swiftyd ./cmd/swiftyd
./bin/swiftyd --listen 127.0.0.1:8443
curl http://127.0.0.1:8443/healthz
```

## Layout

| Path | Purpose |
|---|---|
| `cmd/swiftyd` | Entry point, flags, lifecycle |
| `internal/api` | HTTP/WebSocket API served to the panel |
| `internal/supervisor` | Process lifecycle & isolation (users, cgroups, systemd) |
| `internal/version` | Build version, set via `-ldflags` |
